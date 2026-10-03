import { uuidv7 } from '@philax/database';
import { AppError, type DebateStreamEvent, type RoundPhase } from '@philax/types';
import { phaseAfterRound } from '../domain/state-machine';
import { turnsForRound } from '../domain/turns';
import type { RoundRow } from '../repositories/round-repository';
import type { DebateContext, Repos } from './context';
import { stripTurnKey, type TurnGenerator } from './turn-generator';

type Emit = (e: DebateStreamEvent) => void;

/**
 * Generates debate rounds. Turns already persisted are skipped, so a round
 * interrupted by a failure resumes at the failed turn (§55) — one failed message
 * never regenerates the debate.
 */
export class RoundService {
  constructor(
    private readonly repos: Repos,
    private readonly turns: TurnGenerator,
  ) {}

  async generateRound(
    ctx: DebateContext,
    phase: RoundPhase,
    maxRounds: number,
    emit: Emit,
    signal?: AbortSignal,
  ): Promise<void> {
    const number = (await this.repos.rounds.maxNumber(ctx.debate.id)) + 1;
    const round = await this.repos.rounds.open(ctx.debate.id, number, phase);
    await this.runRound(ctx, round, maxRounds, emit, signal);
  }

  /** Continues an interrupted round of any phase. */
  async resumeRound(
    ctx: DebateContext,
    round: RoundRow,
    maxRounds: number,
    emit: Emit,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.runRound(ctx, round, maxRounds, emit, signal);
  }

  async userExchange(
    ctx: DebateContext,
    content: string,
    maxRounds: number,
    emit: Emit,
    signal?: AbortSignal,
  ): Promise<void> {
    const number = (await this.repos.rounds.maxNumber(ctx.debate.id)) + 1;
    const round = await this.repos.rounds.open(ctx.debate.id, number, 'USER_EXCHANGE');
    const messageId = uuidv7();
    await this.repos.messages.insert({
      id: messageId,
      debateId: ctx.debate.id,
      roundId: round.id,
      roundNumber: number,
      phase: 'USER_EXCHANGE',
      speakerType: 'user',
      characterId: null,
      move: 'assert',
      content,
      replyToMessageId: null,
      addressedCharacterIds: [],
      turnKey: `${number}:u`,
      validation: {},
      argument: null,
      evidenceIds: [],
    });
    // The user's position becomes part of debate state (§67) without steering agreement.
    ctx.debate.memory = {
      ...ctx.debate.memory,
      userPositions: [...ctx.debate.memory.userPositions, { messageId, content }].slice(-10),
    };
    await this.repos.debates.setMemory(ctx.debate.id, ctx.debate.memory);
    ctx.messages = await this.repos.messages.list(ctx.debate.id);
    const stored = ctx.messages.find((m) => m.id === messageId);
    if (stored)
      emit({
        type: 'message',
        turnId: `${ctx.debate.id}:${number}:u`,
        message: stripTurnKey(stored),
      });
    ctx.rounds = await this.repos.rounds.list(ctx.debate.id);
    await this.runRound(ctx, round, maxRounds, emit, signal);
  }

  private async runRound(
    ctx: DebateContext,
    round: RoundRow,
    maxRounds: number,
    emit: Emit,
    signal?: AbortSignal,
  ): Promise<void> {
    emit({ type: 'round_started', roundNumber: round.number, phase: round.phase });
    ctx.rounds = await this.repos.rounds.list(ctx.debate.id);
    const userMessage =
      round.phase === 'USER_EXCHANGE'
        ? ctx.messages.find((m) => m.turnKey === `${round.number}:u`)
        : undefined;
    if (round.phase === 'USER_EXCHANGE' && !userMessage)
      throw new AppError('INTERNAL', 'User exchange round without a user message.');
    const priorUserMessages = ctx.messages.filter(
      (m) => m.speaker.type === 'user' && m.roundNumber < round.number,
    ).length;
    const specs = turnsForRound(
      round.number,
      round.phase,
      ctx.plan,
      ctx.participants.map((p) => ({ characterId: p.characterId, seat: p.seat, role: p.role })),
      { userMessageId: userMessage?.id, userMessageCount: priorUserMessages },
    );
    for (const spec of specs) {
      if (ctx.messages.some((m) => m.turnKey === spec.key)) continue;
      if (signal?.aborted) return; // client left: stop before starting another turn
      await this.turns.generate(ctx, round, spec, emit);
    }
    await this.repos.rounds.complete(round.id);
    if (round.phase !== 'USER_EXCHANGE') {
      const next = phaseAfterRound(ctx.debate.mode, round.phase, maxRounds);
      await this.repos.debates.setPhase(ctx.debate.id, next, { currentRound: round.number });
      ctx.debate.phase = next;
    }
    ctx.rounds = await this.repos.rounds.list(ctx.debate.id);
    emit({ type: 'round_completed', roundNumber: round.number });
  }
}
