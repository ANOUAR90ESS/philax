import { generateStructured, type LLMGateway } from '@philax/ai';
import { selectStrongestObjection } from '@philax/arguments';
import type { CharacterSelector, SelectionTarget } from '@philax/characters';
import type { Db } from '@philax/database';
import type { RetrievalService } from '@philax/knowledge';
import { PerspectiveRepository, selectPerspectives } from '@philax/perspectives';
import { challengeFramingPrompt, debatePlannerPrompt } from '@philax/prompts';
import type { InputService } from '@philax/sources';
import type { TopicAnalyzer } from '@philax/topics';
import {
  AppError,
  type DebateStreamEvent,
  type NormalizedInput,
  type ParticipantRole,
  type PreparationStep,
  type TopicAnalysis,
  type UserInput,
} from '@philax/types';
import { DebatePlanSchema, validatePlan, type DebatePlan } from '../domain/plan';
import type { DebateRecord } from '../repositories/debate-repository';
import { ChallengeFramingOutputSchema } from '../schemas/llm-outputs';
import type { Repos } from './context';

export interface PreparationDeps {
  db: Db;
  repos: Repos;
  gateway: LLMGateway;
  inputs: InputService;
  analyzer: TopicAnalyzer;
  selector: CharacterSelector;
  retrieval: RetrievalService;
}

type Emit = (e: DebateStreamEvent) => void;

/** Errors the user must fix (different input); the debate is marked FAILED. */
const TERMINAL: ReadonlySet<string> = new Set([
  'EXTRACTION_FAILED',
  'URL_NOT_ALLOWED',
  'NO_SUITABLE_CHARACTERS',
]);

/**
 * Preparation pipeline (§1): extraction → topic analysis → perspective discovery
 * → (challenge framing) → character selection → evidence retrieval → planning.
 * Each step is persisted, so a failed or interrupted preparation resumes where
 * it stopped instead of starting over (§55).
 */
export class PreparationService {
  constructor(private readonly d: PreparationDeps) {}

  async prepare(debate: DebateRecord, userId: string, emit: Emit): Promise<void> {
    try {
      if (debate.phase === 'DEBATE_CREATED') await this.analyze(debate, userId, emit);
      if (debate.phase === 'TOPIC_ANALYZED') await this.cast(debate, userId, emit);
      if (debate.phase === 'CHARACTERS_SELECTED') await this.plan(debate, emit);
    } catch (err) {
      if (err instanceof AppError && TERMINAL.has(err.code)) {
        await this.d.repos.debates.setPhase(debate.id, 'FAILED', { errorCode: err.code });
        debate.phase = 'FAILED';
      }
      throw err;
    }
  }

  private step<T>(emit: Emit, step: PreparationStep, fn: () => Promise<T>): Promise<T> {
    emit({ type: 'step', step, status: 'started' });
    return fn().then((v) => {
      emit({ type: 'step', step, status: 'completed' });
      return v;
    });
  }

  private async analyze(debate: DebateRecord, userId: string, emit: Emit): Promise<void> {
    const topic = await this.d.repos.topics.get(debate.topicId);
    if (!topic) throw new AppError('NOT_FOUND', 'Topic not found.');
    const input: UserInput =
      topic.inputType === 'url'
        ? { type: 'url', url: topic.inputUrl as string }
        : { type: 'text', content: topic.inputText as string };

    const normalized: NormalizedInput = await this.step(emit, 'extract', async () => {
      if (topic.sourceId)
        return this.reloadNormalized(topic.sourceId, input, topic.contentType, topic.language);
      const ingested = await this.d.inputs.ingest(userId, input);
      await this.d.repos.topics.attachSource(topic.id, ingested.sourceId, ingested.normalized);
      return ingested.normalized;
    });

    await this.step(emit, 'analyze', async () => {
      const catalog = await new PerspectiveRepository(this.d.db).listAll();
      const { analysis, promptVersion } = await this.d.analyzer.analyze(
        normalized,
        catalog.map((p) => ({ slug: p.slug, label: p.label, description: p.description })),
        { topicId: topic.id, debateId: debate.id },
      );
      await this.d.repos.topics.saveAnalysis(topic.id, analysis, promptVersion);
      await this.d.repos.debates.setLanguage(debate.id, analysis.language);
      debate.language = analysis.language;
    });
    await this.d.repos.debates.setPhase(debate.id, 'TOPIC_ANALYZED');
    debate.phase = 'TOPIC_ANALYZED';
  }

  private async reloadNormalized(
    sourceId: string,
    input: UserInput,
    contentType: string | null,
    language: string | null,
  ): Promise<NormalizedInput> {
    const { rows } = await this.d.db.query<{
      content: string | null;
      url: string | null;
      title: string;
    }>(
      `SELECT string_agg(c.content, E'\n\n' ORDER BY c.ordinal) AS content, s.url, s.title
       FROM sources s JOIN source_chunks c ON c.source_id = s.id WHERE s.id = $1 GROUP BY s.id`,
      [sourceId],
    );
    const r = rows[0];
    return {
      rawContent: r?.content ?? (input.type === 'text' ? input.content : ''),
      sourceUrl: r?.url ?? undefined,
      title: input.type === 'url' ? r?.title : undefined,
      language: language ?? 'en',
      contentType: (contentType as NormalizedInput['contentType'] | null) ?? 'statement',
    };
  }

  private async cast(debate: DebateRecord, userId: string, emit: Emit): Promise<void> {
    const topic = await this.d.repos.topics.get(debate.topicId);
    const analysis = topic?.analysis as TopicAnalysis;
    const catalog = await new PerspectiveRepository(this.d.db).listAll();

    const targets: SelectionTarget[] = await this.step(emit, 'perspectives', async () => {
      const plan = selectPerspectives(analysis, catalog, {
        target: debate.mode === 'challenge' ? 3 : 4,
        minimum: 3,
      });
      const maxRel = Math.max(...plan.selected.map((s) => s.relevance), 1);
      const base = plan.selected.map((s) => ({
        slug: s.perspective.slug,
        label: s.perspective.label,
        reason: s.reason,
        relevance: s.relevance / maxRel,
        role: 'debater' as ParticipantRole,
      }));
      if (debate.mode !== 'challenge') return base;
      return this.frameChallenge(debate, analysis, topic?.inputText ?? analysis.summary, base);
    });

    await this.step(emit, 'characters', async () => {
      const count = debate.mode === 'challenge' ? 3 : Math.min(4, Math.max(3, targets.length));
      const selection = await this.d.selector.select(analysis, targets, {
        count,
        mode: debate.mode,
        debateId: debate.id,
      });
      const perspectiveIds = new Map(catalog.map((p) => [p.slug, p.id]));
      const roleOrder: ParticipantRole[] = ['supporter', 'opponent', 'alternative', 'debater'];
      const ordered =
        debate.mode === 'challenge'
          ? [...selection.participants].sort(
              (a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role),
            )
          : selection.participants;
      await this.d.repos.participants.replaceAll(
        debate.id,
        ordered.map((p, seat) => ({
          characterId: p.characterId,
          perspectiveId: perspectiveIds.get(p.perspectiveSlug) ?? null,
          role: p.role,
          seat,
          selectionReason: p.selectionReason,
          score: p.score,
        })),
      );
      debate.memory = { ...debate.memory, expectedDisagreement: selection.expectedDisagreement };
      await this.d.repos.debates.setMemory(debate.id, debate.memory);

      // Evidence retrieval (§15): per-participant knowledge + the user's own input.
      const query = {
        text: `${analysis.title}. ${analysis.summary}`,
        keywords: [...analysis.retrievalKeywords, ...analysis.concepts],
        userId,
        limit: 6,
      };
      for (const p of ordered) {
        const { chunks } = await this.d.retrieval.retrieveForCharacter(p.characterId, query, 4);
        await this.d.repos.evidence.addToPool(
          debate.id,
          chunks.map((chunk) => ({ chunk, forCharacterId: p.characterId })),
        );
      }
      if (topic?.sourceId) {
        const userChunks = await this.d.retrieval.retrieveFromSource(topic.sourceId, query, 4);
        await this.d.repos.evidence.addToPool(
          debate.id,
          userChunks.map((chunk) => ({ chunk, forCharacterId: null })),
        );
      }
    });
    await this.d.repos.debates.setPhase(debate.id, 'CHARACTERS_SELECTED');
    debate.phase = 'CHARACTERS_SELECTED';
  }

  /** Challenge mode (§27): hidden assumptions, strongest objection, role → perspective. */
  private async frameChallenge(
    debate: DebateRecord,
    analysis: TopicAnalysis,
    idea: string,
    base: SelectionTarget[],
  ): Promise<SelectionTarget[]> {
    const prompt = challengeFramingPrompt.build({
      language: analysis.language,
      idea,
      perspectives: base.map((b) => ({ slug: b.slug, label: b.label, description: b.reason })),
    });
    const slugs = new Set(base.map((b) => b.slug));
    const { data } = await generateStructured(
      this.d.gateway,
      {
        tier: 'strong',
        operation: 'challenge.frame',
        promptVersion: prompt.version,
        system: prompt.system,
        messages: prompt.messages,
        maxOutputTokens: 2500,
        trace: { debateId: debate.id },
      },
      ChallengeFramingOutputSchema,
      {
        refine: (d) => {
          const roles = (d as { roles: Record<string, string> }).roles;
          const vals = Object.values(roles);
          if (vals.some((v) => !slugs.has(v)))
            return `roles must use these perspective slugs: ${[...slugs].join(', ')}`;
          if (new Set(vals).size !== vals.length) return 'each role needs a different perspective';
          return null;
        },
      },
    );
    const strongest =
      selectStrongestObjection(data.objectionCandidates) ?? data.objectionCandidates[0];
    const framing = {
      idea,
      hiddenAssumptions: data.hiddenAssumptions,
      strongestObjection: strongest?.text ?? '',
    };
    await this.d.repos.debates.setChallenge(debate.id, framing);
    debate.challenge = framing;
    const bySlug = new Map(base.map((b) => [b.slug, b]));
    return (['supporter', 'opponent', 'alternative'] as const).map((role) => ({
      ...(bySlug.get(data.roles[role]) as SelectionTarget),
      role,
    }));
  }

  private async plan(debate: DebateRecord, emit: Emit): Promise<void> {
    await this.step(emit, 'plan', async () => {
      const topic = await this.d.repos.topics.get(debate.topicId);
      const analysis = topic?.analysis as TopicAnalysis;
      const participants = await this.d.repos.participants.list(debate.id);
      const profiles = await Promise.all(
        participants.map((p) => this.d.repos.characters.getFull(p.characterId)),
      );
      const prompt = debatePlannerPrompt.build({
        language: debate.language,
        mode: debate.mode,
        topicTitle: analysis.title,
        topicSummary: analysis.summary,
        claims: analysis.claims.map((c) => ({ id: c.id, kind: c.kind, text: c.text })),
        tensions: analysis.tensions,
        expectedDisagreement: debate.memory.expectedDisagreement,
        participants: participants.map((p, i) => ({
          characterId: p.characterId,
          name: profiles[i]?.displayName ?? '',
          role: p.role,
          perspective: p.perspectiveLabel,
          worldview: profiles[i]?.worldviewSummary ?? '',
          keyPositions: (profiles[i]?.knownPositions ?? [])
            .slice(0, 6)
            .map((x) => `${x.topic}: ${x.statement}`),
        })),
      });
      const ids = new Set(participants.map((p) => p.characterId));
      const claimIds = new Set(analysis.claims.map((c) => c.id));
      let plan: DebatePlan;
      try {
        ({ data: plan } = await generateStructured(
          this.d.gateway,
          {
            tier: 'strong',
            operation: 'debate.plan',
            promptVersion: prompt.version,
            system: prompt.system,
            messages: prompt.messages,
            maxOutputTokens: 3000,
            trace: { debateId: debate.id },
          },
          DebatePlanSchema,
          { refine: (d) => validatePlan(d as DebatePlan, ids, claimIds) },
        ));
      } catch (err) {
        if (!(err instanceof AppError && err.code === 'AI_OUTPUT_INVALID')) throw err;
        plan = fallbackPlan(
          analysis,
          participants.map((p) => p.characterId),
        );
      }
      await this.d.repos.debates.setPlan(debate.id, plan);
      debate.plan = plan;
    });
    await this.d.repos.debates.setPhase(debate.id, 'DEBATE_PLANNED');
    debate.phase = 'DEBATE_PLANNED';
  }
}

/**
 * Deterministic structural plan used only if the planner's output stays invalid:
 * axes come from the analysed tensions and every participant challenges the next.
 */
export function fallbackPlan(analysis: TopicAnalysis, ids: string[]): DebatePlan {
  const tensions = analysis.tensions.length
    ? analysis.tensions
    : [
        {
          description: analysis.questions[0] ?? analysis.title,
          axis: 'values' as const,
          poles: ['', ''],
        },
      ];
  const axes = tensions
    .slice(0, 3)
    .map((t, i) => ({
      id: `x${i + 1}`,
      axis: t.axis,
      description: t.description.padEnd(10, '.'),
      between: ids,
    }));
  return {
    disagreementAxes: axes,
    openings: ids.map((id) => ({
      characterId: id,
      angle: 'Your central documented position on the topic',
      claimIds: [],
    })),
    challenges: ids.map((id, i) => ({
      challengerId: ids[(i + 1) % ids.length] as string,
      targetId: id,
      axisId: axes[i % axes.length]?.id ?? 'x1',
    })),
    crossExaminations: [
      {
        askerId: ids[0] as string,
        responderId: ids[1] as string,
        focus: (analysis.questions[0] ?? analysis.title).slice(0, 300).padEnd(5, '.'),
      },
    ],
    deepestDisagreement: {
      axisId: 'x1',
      question: (analysis.questions[0] ?? analysis.title).padEnd(10, '.'),
    },
    openQuestion: (analysis.questions.at(-1) ?? analysis.title).padEnd(10, '.'),
  };
}
