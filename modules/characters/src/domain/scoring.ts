import type { TopicAnalysis } from '@philax/types';
import type { CharacterCandidate } from '../repositories/character-repository';

export interface PerspectiveTarget {
  slug: string;
  /** Normalized 0..1 relevance of the perspective to the topic. */
  relevance: number;
}

export interface ScoreBreakdown {
  topic: number;
  perspective: number;
  knowledge: number;
  evidence: number;
  validity: number;
  total: number;
  /** Best-matching target perspective for this candidate, if any. */
  perspectiveSlug: string | null;
}

/** Weights (§63). Popularity is deliberately not a factor. */
export const SCORE_WEIGHTS = {
  topic: 0.3,
  perspective: 0.35,
  knowledge: 0.15,
  evidence: 0.1,
  validity: 0.1,
} as const;

function norm(s: string): string {
  return s.toLowerCase().normalize('NFKC');
}

function termOverlap(a: string[], b: string[]): number {
  const words = (xs: string[]) =>
    new Set(
      xs
        .flatMap((x) => norm(x).split(/[^\p{L}\p{N}]+/u))
        .filter((w) => w.length > 3)
        .map((w) => w.slice(0, 6)),
    );
  const A = words(a);
  let n = 0;
  for (const w of words(b)) if (A.has(w)) n++;
  return n;
}

export function scoreCandidate(
  c: CharacterCandidate,
  analysis: TopicAnalysis,
  targets: PerspectiveTarget[],
  retrievalHits: number,
): ScoreBreakdown {
  // Topic relevance: domain/concept overlap plus how much of their knowledge the retriever surfaced.
  const domainHits = termOverlap(c.domains, analysis.domains);
  const conceptHits = termOverlap(
    [...c.concepts, ...c.domains],
    [...analysis.concepts, ...analysis.retrievalKeywords],
  );
  const topic = Math.min(1, domainHits * 0.2 + conceptHits * 0.1 + retrievalHits * 0.15);

  // Perspective relevance: how paradigmatically they represent a needed perspective.
  let perspective = 0;
  let perspectiveSlug: string | null = null;
  for (const t of targets) {
    const link = c.perspectives.find((p) => p.slug === t.slug);
    if (!link) continue;
    const s = (link.strength / 3) * (0.5 + 0.5 * t.relevance);
    if (s > perspective) {
      perspective = s;
      perspectiveSlug = t.slug;
    }
  }

  const knowledge = Math.min(1, c.positionCount / 5);
  const evidence = c.primarySourceCount > 0 ? Math.min(1, 0.6 + 0.2 * c.primarySourceCount) : 0.2;
  // Contextual validity: every seeded figure can be reconstructed; contemporary figures
  // are slightly penalized because only published statements may be used (§13).
  const validity = c.representation === 'contemporary' ? 0.7 : 1;

  const total =
    SCORE_WEIGHTS.topic * topic +
    SCORE_WEIGHTS.perspective * perspective +
    SCORE_WEIGHTS.knowledge * knowledge +
    SCORE_WEIGHTS.evidence * evidence +
    SCORE_WEIGHTS.validity * validity;
  return { topic, perspective, knowledge, evidence, validity, total, perspectiveSlug };
}

export interface ScoredCandidate {
  candidate: CharacterCandidate;
  score: ScoreBreakdown;
}

/** Penalty/bonus between two candidates for appearing in the same debate. */
export function pairAdjustment(a: CharacterCandidate, b: CharacterCandidate): number {
  const rel = [
    ...a.relations.filter((r) => r.otherId === b.id),
    ...b.relations.filter((r) => r.otherId === a.id),
  ].map((r) => r.relation);
  let adj = 0;
  if (rel.includes('opposes') || rel.includes('critiques')) adj += 0.15;
  if (rel.includes('shares_tradition')) adj -= 0.2;
  const topA = a.perspectives[0]?.slug;
  if (topA && topA === b.perspectives[0]?.slug) adj -= 0.3;
  return adj;
}

/**
 * Greedy, deterministic assignment of one distinct character per target
 * perspective, balancing individual score with pairwise disagreement.
 */
export function assignByPerspective(
  scored: ScoredCandidate[],
  targets: PerspectiveTarget[],
  count: number,
): ScoredCandidate[] {
  const chosen: ScoredCandidate[] = [];
  for (const t of targets) {
    if (chosen.length >= count) break;
    const options = scored
      .filter((s) => !chosen.some((c) => c.candidate.id === s.candidate.id))
      .filter((s) => s.candidate.perspectives.some((p) => p.slug === t.slug && p.strength >= 2))
      .map((s) => ({
        s,
        value:
          s.score.total +
          chosen.reduce((acc, c) => acc + pairAdjustment(s.candidate, c.candidate), 0),
      }))
      .sort((x, y) => y.value - x.value || x.s.candidate.slug.localeCompare(y.s.candidate.slug));
    const pick = options[0]?.s;
    if (pick)
      chosen.push({ candidate: pick.candidate, score: { ...pick.score, perspectiveSlug: t.slug } });
  }
  return chosen;
}
