import type { LLMGateway } from '@philax/ai';
import { limitsFor, type UsageService } from '@philax/billing';
import { CharacterSelector } from '@philax/characters';
import type { Db } from '@philax/database';
import type { RetrievalService } from '@philax/knowledge';
import type { InputService } from '@philax/sources';
import { TopicAnalyzer } from '@philax/topics';
import {
  AppError,
  type CreateChallengeRequest,
  type CreateDebateRequest,
  type DebateListItem,
  type DebateStreamEvent,
  type DebateView,
  type UserView,
} from '@philax/types';
import { assertCanJoin, nextAction } from '../domain/state-machine';
import type { DebateRecord } from '../repositories/debate-repository';
import { createRepos, loadContext, type Repos } from './context';
import type { DebateLock } from './lock';
import { PreparationService } from './preparation-service';
import { RoundService } from './round-service';
import { SynthesisService } from './synthesis-service';
import { TurnGenerator, type TurnGeneratorOptions } from './turn-generator';
import { buildDebateView } from './view-builder';

export interface DebateServiceDeps {
  db: Db;
  gateway: LLMGateway;
  retrieval: RetrievalService;
  inputs: InputService;
  usage: UsageService;
  lock: DebateLock;
  turnOptions?: TurnGeneratorOptions;
  /** Runs after the debate is planned and before it starts. */
  participants?: ParticipantPreparer;
  /** Product analytics hook (event names only; no content). */
  track?: (
    userId: string,
    event: string,
    props?: Record<string, string | number | boolean | null>,
  ) => void;
}

type Emit = (e: DebateStreamEvent) => void;

/** A selected participant handed to participant preparation. */
export interface PreparableParticipant {
  id: string;
  slug: string;
  displayName: string;
  era: string;
  birthYear: number | null;
  deathYear: number | null;
}

/**
 * Prepares the selected participants (e.g. their avatars and voices) before
 * the debate starts. Must be idempotent: it runs again before the first round
 * if an earlier attempt failed. Throws an AppError when a participant cannot
 * be prepared.
 */
export interface ParticipantPreparer {
  prepareParticipants(
    input: { debateId: string; language: string; characters: PreparableParticipant[] },
    signal?: AbortSignal,
  ): Promise<unknown>;
}

/**
 * Application service for debates: authorization, quotas and orchestration of
 * preparation, rounds, user participation and synthesis. Controllers call only this.
 */
export class DebateService {
  private readonly repos: Repos;
  private readonly preparation: PreparationService;
  private readonly rounds: RoundService;
  private readonly synthesis: SynthesisService;

  constructor(private readonly d: DebateServiceDeps) {
    this.repos = createRepos(d.db);
    const selector = new CharacterSelector(this.repos.characters, d.retrieval, d.gateway);
    this.preparation = new PreparationService({
      db: d.db,
      repos: this.repos,
      gateway: d.gateway,
      inputs: d.inputs,
      analyzer: new TopicAnalyzer(d.gateway),
      selector,
      retrieval: d.retrieval,
    });
    this.rounds = new RoundService(
      this.repos,
      new TurnGenerator(d.gateway, this.repos, d.turnOptions),
    );
    this.synthesis = new SynthesisService(d.gateway, this.repos);
  }

  private limits(user: UserView) {
    const l = limitsFor(user.plan);
    return { maxRounds: l.maxRoundsPerDebate, maxUserMessages: l.maxUserMessagesPerDebate };
  }

  private assertAi(): void {
    if (!this.d.gateway.available) {
      throw new AppError('AI_UNAVAILABLE', 'No AI provider is configured on the server.');
    }
  }

  async create(user: UserView, req: CreateDebateRequest): Promise<DebateView> {
    this.assertAi();
    await this.d.usage.assertWithinQuota(user.id, user.plan, 'debate_created');
    const topicId = await this.repos.topics.create(user.id, req.input);
    const id = await this.repos.debates.create({
      userId: user.id,
      topicId,
      mode: req.mode,
      language: req.locale ?? 'en',
    });
    await this.d.usage.record(user.id, 'debate_created', id);
    this.d.track?.(user.id, 'input_submitted', { inputType: req.input.type, mode: req.mode });
    if (req.mode === 'challenge') this.d.track?.(user.id, 'challenge_started');
    return this.view(user, id);
  }

  createChallenge(user: UserView, req: CreateChallengeRequest): Promise<DebateView> {
    return this.create(user, {
      input: { type: 'text', content: req.idea },
      mode: 'challenge',
      locale: req.locale,
    });
  }

  async list(user: UserView): Promise<DebateListItem[]> {
    return this.repos.debates.listByUser(user.id);
  }

  async view(user: UserView, id: string): Promise<DebateView> {
    return buildDebateView(this.repos, await this.owned(user, id), this.limits(user));
  }

  /** Validates that `advance` is possible before the response is turned into a stream. */
  async assertCanAdvance(user: UserView, id: string): Promise<void> {
    const debate = await this.owned(user, id);
    const incomplete = await this.repos.rounds.findIncomplete(id);
    const action = nextAction(debate.mode, debate.phase, this.limits(user).maxRounds);
    if (!incomplete && action.kind === 'none')
      throw new AppError('INVALID_STATE', 'This debate is already complete.');
    this.assertAi();
    if (action.kind === 'round' && !incomplete)
      await this.d.usage.assertWithinQuota(user.id, user.plan, 'round_generated');
    if (action.kind === 'synthesize')
      await this.d.usage.assertWithinQuota(user.id, user.plan, 'synthesis');
  }

  /** Advances the state machine by one step (prepare, one round, or synthesis). */
  async advance(user: UserView, id: string, emit: Emit, signal?: AbortSignal): Promise<void> {
    await this.d.lock.withLock(id, async () => {
      const debate = await this.owned(user, id);
      const limits = this.limits(user);
      const incomplete = await this.repos.rounds.findIncomplete(id);
      if (incomplete) {
        const ctx = await loadContext(this.repos, debate);
        await this.rounds.resumeRound(ctx, incomplete, limits.maxRounds, emit, signal);
      } else {
        const action = nextAction(debate.mode, debate.phase, limits.maxRounds);
        if (action.kind === 'prepare') {
          await this.preparation.prepare(debate, user.id, emit);
          if (debate.phase === 'DEBATE_PLANNED')
            await this.prepareParticipants(user, id, emit, signal);
          this.d.track?.(user.id, 'topic_analyzed');
          this.d.track?.(user.id, 'character_selected');
          this.d.track?.(user.id, 'debate_started', { mode: debate.mode });
        } else if (action.kind === 'round') {
          // The debate starts only with every participant prepared.
          if (debate.phase === 'DEBATE_PLANNED')
            await this.prepareParticipants(user, id, emit, signal);
          const ctx = await loadContext(this.repos, debate);
          await this.rounds.generateRound(ctx, action.phase, limits.maxRounds, emit, signal);
          await this.d.usage.record(user.id, 'round_generated', id);
          this.d.track?.(user.id, 'round_completed', { phase: action.phase });
        } else if (action.kind === 'synthesize') {
          const ctx = await loadContext(this.repos, debate);
          await this.synthesis.synthesize(ctx, emit);
          await this.d.usage.record(user.id, 'synthesis', id);
          this.d.track?.(user.id, 'debate_completed', {
            userJoined: ctx.debate.memory.userPositions.length > 0,
          });
        } else {
          throw new AppError('INVALID_STATE', 'This debate is already complete.');
        }
      }
      emit({ type: 'state', debate: await this.view(user, id) });
    });
  }

  private async prepareParticipants(
    user: UserView,
    id: string,
    emit: Emit,
    signal?: AbortSignal,
  ): Promise<void> {
    const preparer = this.d.participants;
    if (!preparer) return;
    const view = await this.view(user, id);
    emit({ type: 'step', step: 'participants', status: 'started' });
    await preparer.prepareParticipants(
      {
        debateId: id,
        language: view.language,
        characters: view.participants.map((p) => ({
          id: p.character.id,
          slug: p.character.slug,
          displayName: p.character.displayName,
          era: p.character.era,
          birthYear: p.character.birthYear,
          deathYear: p.character.deathYear,
        })),
      },
      signal,
    );
    emit({ type: 'step', step: 'participants', status: 'completed' });
  }

  async assertCanPostMessage(user: UserView, id: string): Promise<void> {
    const debate = await this.owned(user, id);
    assertCanJoin(debate.phase);
    if (await this.repos.rounds.findIncomplete(id))
      throw new AppError('INVALID_STATE', 'Please let the current round finish first.');
    const messages = await this.repos.messages.list(id);
    if (
      messages.filter((m) => m.speaker.type === 'user').length >= this.limits(user).maxUserMessages
    ) {
      throw new AppError(
        'QUOTA_EXCEEDED',
        'You have reached the number of contributions allowed in one debate.',
      );
    }
    this.assertAi();
    await this.d.usage.assertWithinQuota(user.id, user.plan, 'user_message');
  }

  /** The user enters the debate (§26): their message joins the state and participants answer. */
  async postUserMessage(
    user: UserView,
    id: string,
    content: string,
    emit: Emit,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.d.lock.withLock(id, async () => {
      await this.assertCanPostMessage(user, id);
      const debate = await this.owned(user, id);
      const ctx = await loadContext(this.repos, debate);
      await this.d.usage.record(user.id, 'user_message', id);
      this.d.track?.(user.id, 'user_joined_debate');
      await this.rounds.userExchange(ctx, content, this.limits(user).maxRounds, emit, signal);
      emit({ type: 'state', debate: await this.view(user, id) });
    });
  }

  async setSaved(user: UserView, id: string, saved: boolean): Promise<void> {
    await this.owned(user, id);
    await this.repos.debates.setSaved(id, user.id, saved);
    if (saved) this.d.track?.(user.id, 'debate_saved');
  }

  /** Deletes a debate with its topic, private input source and all generated content (§57). */
  async delete(user: UserView, id: string): Promise<void> {
    const debate = await this.owned(user, id);
    const topic = await this.repos.topics.get(debate.topicId);
    await this.d.db.transaction(async (tx) => {
      await tx.query(`DELETE FROM topics WHERE id = $1 AND user_id = $2`, [
        debate.topicId,
        user.id,
      ]); // cascades to the debate
      if (topic?.sourceId)
        await tx.query(
          `DELETE FROM sources WHERE id = $1 AND owner_user_id = $2 AND origin = 'user'`,
          [topic.sourceId, user.id],
        );
    });
  }

  trackSourceOpened(user: UserView): void {
    this.d.track?.(user.id, 'source_opened');
  }

  /** Loads a debate and enforces ownership; other users' debates look like 404s. */
  private async owned(user: UserView, id: string): Promise<DebateRecord> {
    const debate = await this.repos.debates.get(id);
    if (!debate || debate.userId !== user.id) throw new AppError('NOT_FOUND', 'Debate not found.');
    return debate;
  }
}
