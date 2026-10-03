import { generateStructured, LLMError, type LLMGateway } from '@philax/ai';
import type { RetrievalService } from '@philax/knowledge';
import { characterSelectorPrompt } from '@philax/prompts';
import { AppError, type ParticipantRole, type TopicAnalysis } from '@philax/types';
import { z } from 'zod';
import { formatYear } from '../domain/representation';
import {
  assignByPerspective,
  scoreCandidate,
  type PerspectiveTarget,
  type ScoredCandidate,
} from '../domain/scoring';
import type { CharacterCandidate, CharacterRepository } from '../repositories/character-repository';

export interface SelectionTarget extends PerspectiveTarget {
  label: string;
  reason: string;
  /** Required role (challenge mode) or 'debater'. */
  role: ParticipantRole;
}

export interface SelectedParticipant {
  characterId: string;
  slug: string;
  displayName: string;
  perspectiveSlug: string;
  role: ParticipantRole;
  selectionReason: string;
  score: number;
}

export interface SelectionResult {
  participants: SelectedParticipant[];
  expectedDisagreement: string | null;
  method: 'llm' | 'algorithmic';
  promptVersion: string | null;
}

const SelectionSchema = z.object({
  participants: z
    .array(
      z.object({
        characterId: z.string(),
        perspectiveSlug: z.string(),
        role: z.enum(['debater', 'supporter', 'opponent', 'alternative']),
        selectionReason: z.string().min(10).max(600),
      }),
    )
    .min(2)
    .max(5),
  expectedDisagreement: z.string().min(5).max(400),
});

function years(c: CharacterCandidate): string {
  return c.deathYear === null ? 'contemporary' : `d. ${formatYear(c.deathYear)}`;
}

/**
 * Character selection (§4, §63): transparent scoring builds a shortlist, an LLM
 * makes the final choice under hard validation, and a deterministic assignment
 * is used if the model is unavailable or its answer is invalid.
 */
export class CharacterSelector {
  constructor(
    private readonly repo: CharacterRepository,
    private readonly retrieval: RetrievalService,
    private readonly gateway: LLMGateway,
  ) {}

  async select(
    analysis: TopicAnalysis,
    targets: SelectionTarget[],
    opts: { count: number; mode: 'debate' | 'challenge'; debateId?: string },
  ): Promise<SelectionResult> {
    const candidates = await this.repo.listCandidates();
    const hits = await this.retrievalHits(analysis);
    const scored: ScoredCandidate[] = candidates
      .map((c) => ({
        candidate: c,
        score: scoreCandidate(c, analysis, targets, hits.get(c.id) ?? 0),
      }))
      .filter((s) => s.score.perspectiveSlug !== null);

    const fallback = assignByPerspective(scored, targets, opts.count);
    if (fallback.length < Math.min(2, opts.count)) {
      throw new AppError(
        'NO_SUITABLE_CHARACTERS',
        'Not enough well-documented, genuinely different perspectives were found.',
      );
    }

    // Shortlist: top candidates per target perspective.
    const shortlistIds = new Set<string>();
    for (const t of targets) {
      scored
        .filter((s) => s.candidate.perspectives.some((p) => p.slug === t.slug && p.strength >= 2))
        .sort((a, b) => b.score.total - a.score.total)
        .slice(0, 3)
        .forEach((s) => shortlistIds.add(s.candidate.id));
    }
    const shortlist = scored.filter((s) => shortlistIds.has(s.candidate.id));
    const prompt = characterSelectorPrompt.build({
      topicTitle: analysis.title,
      topicSummary: analysis.summary,
      language: analysis.language,
      mode: opts.mode,
      count: Math.min(opts.count, targets.length),
      roles: targets.map((t) => t.role),
      perspectives: targets.map((t) => ({ slug: t.slug, label: t.label, reason: t.reason })),
      shortlist: shortlist.map((s) => ({
        characterId: s.candidate.id,
        name: s.candidate.displayName,
        years: years(s.candidate),
        representation: s.candidate.representation,
        perspectives: s.candidate.perspectives.filter((p) => p.strength >= 2).map((p) => p.slug),
        domains: s.candidate.domains,
        worldview: s.candidate.worldviewSummary,
        score: Number(s.score.total.toFixed(3)),
      })),
    });

    const byId = new Map(shortlist.map((s) => [s.candidate.id, s]));
    const targetBySlug = new Map(targets.map((t) => [t.slug, t]));
    const count = Math.min(opts.count, targets.length);
    try {
      const { data } = await generateStructured(
        this.gateway,
        {
          tier: 'strong',
          operation: 'characters.select',
          promptVersion: prompt.version,
          system: prompt.system,
          messages: prompt.messages,
          maxOutputTokens: 2000,
          trace: { debateId: opts.debateId },
        },
        SelectionSchema,
        {
          refine: (d) => {
            const sel = (d as z.infer<typeof SelectionSchema>).participants;
            if (sel.length !== count) return `choose exactly ${count} participants`;
            if (new Set(sel.map((p) => p.characterId)).size !== sel.length)
              return 'participants must be distinct';
            if (new Set(sel.map((p) => p.perspectiveSlug)).size !== sel.length)
              return 'each participant needs a different perspectiveSlug';
            for (const p of sel) {
              const cand = byId.get(p.characterId);
              if (!cand) return `characterId ${p.characterId} is not in the shortlist`;
              if (!targetBySlug.has(p.perspectiveSlug))
                return `perspectiveSlug ${p.perspectiveSlug} is not a needed perspective`;
              if (!cand.candidate.perspectives.some((x) => x.slug === p.perspectiveSlug)) {
                return `${cand.candidate.displayName} does not represent ${p.perspectiveSlug}`;
              }
            }
            if (opts.mode === 'challenge') {
              const roles = new Set(sel.map((p) => p.role));
              for (const t of targets.slice(0, count))
                if (!roles.has(t.role)) return `role ${t.role} must be assigned`;
            }
            return null;
          },
        },
      );
      return {
        participants: data.participants.map((p) => {
          const s = byId.get(p.characterId) as ScoredCandidate;
          return {
            characterId: p.characterId,
            slug: s.candidate.slug,
            displayName: s.candidate.displayName,
            perspectiveSlug: p.perspectiveSlug,
            role: opts.mode === 'debate' ? 'debater' : p.role,
            selectionReason: p.selectionReason,
            score: s.score.total,
          };
        }),
        expectedDisagreement: data.expectedDisagreement,
        method: 'llm',
        promptVersion: prompt.version,
      };
    } catch (err) {
      // Validation failures and unavailable models degrade to the transparent algorithm.
      if (
        !(err instanceof AppError && err.code === 'AI_OUTPUT_INVALID') &&
        !(err instanceof LLMError)
      )
        throw err;
      return {
        participants: fallback.map((s) => {
          const t = targetBySlug.get(s.score.perspectiveSlug as string) as SelectionTarget;
          return {
            characterId: s.candidate.id,
            slug: s.candidate.slug,
            displayName: s.candidate.displayName,
            perspectiveSlug: t.slug,
            role: t.role,
            selectionReason: t.reason,
            score: s.score.total,
          };
        }),
        expectedDisagreement: null,
        method: 'algorithmic',
        promptVersion: null,
      };
    }
  }

  /** How often each character's knowledge appears in a topic-level retrieval. */
  private async retrievalHits(analysis: TopicAnalysis): Promise<Map<string, number>> {
    const { chunks } = await this.retrieval.retrieve({
      text: `${analysis.title}. ${analysis.concepts.join(', ')}`,
      keywords: [...analysis.retrievalKeywords, ...analysis.concepts],
      limit: 40,
    });
    const hits = new Map<string, number>();
    for (const c of chunks)
      if (c.characterId) hits.set(c.characterId, (hits.get(c.characterId) ?? 0) + 1);
    return hits;
  }
}
