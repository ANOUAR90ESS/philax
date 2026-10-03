import type { PerspectiveRequirement, TopicAnalysis } from '@philax/types';
import type { CatalogPerspective } from '../repositories/perspective-repository';
import { jaccard, overlap, tokens } from './tokens';

export interface SelectedPerspective {
  perspective: CatalogPerspective;
  relevance: number;
  /** Why it was included: the analyzer's stated reason or a computed match. */
  reason: string;
  requested: boolean;
}

export interface PerspectivePlan {
  selected: SelectedPerspective[];
  /** Average pairwise distance of the selection (0 = identical, 1 = principled opposition). */
  diversity: number;
}

export interface PerspectiveEngineOptions {
  target?: number;
  minimum?: number;
  /** Weight of relevance vs. diversity in the greedy selection (MMR λ). */
  lambda?: number;
}

/**
 * Distance between two perspectives. Curated contrasts count as principled
 * opposition (1.0); otherwise distance grows as their values and assumptions
 * share fewer terms (§3: optimize for meaningful disagreement).
 */
export function perspectiveDistance(a: CatalogPerspective, b: CatalogPerspective): number {
  if (a.slug === b.slug) return 0;
  if (a.contrasts.includes(b.slug) || b.contrasts.includes(a.slug)) return 1;
  const ta = tokens(...a.values, ...a.assumptions);
  const tb = tokens(...b.values, ...b.assumptions);
  return 0.8 * (1 - jaccard(ta, tb));
}

export function averageDistance(ps: CatalogPerspective[]): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      sum += perspectiveDistance(ps[i] as CatalogPerspective, ps[j] as CatalogPerspective);
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

function profile(p: CatalogPerspective): Set<string> {
  return tokens(p.label, p.description, ...p.assumptions, ...p.values);
}

/** Relevance of every catalog perspective to the analysed topic. */
export function scoreRelevance(
  analysis: TopicAnalysis,
  catalog: CatalogPerspective[],
): Map<string, { score: number; reason: string; requested: boolean }> {
  const out = new Map<string, { score: number; reason: string; requested: boolean }>();
  const topicTerms = tokens(
    ...analysis.concepts,
    ...analysis.retrievalKeywords,
    ...analysis.tensions.flatMap((t) => t.poles),
  );
  const domains = new Set(analysis.domains.map((d) => d.toLowerCase()));
  const freeRequirements: PerspectiveRequirement[] = analysis.requiredPerspectives.filter(
    (r) => !r.perspectiveSlug,
  );

  for (const p of catalog) {
    let score = 0;
    let reason = '';
    let requested = false;
    const reqIdx = analysis.requiredPerspectives.findIndex((r) => r.perspectiveSlug === p.slug);
    if (reqIdx >= 0) {
      requested = true;
      score += 3 - reqIdx * 0.1;
      reason = analysis.requiredPerspectives[reqIdx]?.reason ?? '';
    }
    const prof = profile(p);
    for (const r of freeRequirements) {
      const m = overlap(tokens(r.description, r.reason), prof);
      if (m >= 2) {
        score += Math.min(2, m * 0.5);
        if (!reason) reason = r.reason;
      }
    }
    const domainHits = p.relevantDomains.filter((d) => domains.has(d.toLowerCase())).length;
    score += Math.min(1.5, domainHits * 0.5);
    score += Math.min(1, overlap(topicTerms, prof) * 0.25);
    if (!reason && score > 0)
      reason = `Relevant to ${analysis.domains.slice(0, 2).join(', ')}: ${p.description}`;
    out.set(p.slug, { score, reason, requested });
  }
  return out;
}

/**
 * Perspective Engine (§9): chooses a set of perspectives that are each relevant
 * AND maximally in disagreement, via greedy maximal-marginal-relevance.
 */
export function selectPerspectives(
  analysis: TopicAnalysis,
  catalog: CatalogPerspective[],
  opts: PerspectiveEngineOptions = {},
): PerspectivePlan {
  const target = opts.target ?? 4;
  const minimum = opts.minimum ?? 3;
  const lambda = opts.lambda ?? 0.5;
  const relevance = scoreRelevance(analysis, catalog);
  const maxRel = Math.max(...[...relevance.values()].map((r) => r.score), 1);
  const candidates = catalog.filter((p) => (relevance.get(p.slug)?.score ?? 0) > 0.5);
  const pool =
    candidates.length >= minimum
      ? candidates
      : [...catalog]
          .sort((a, b) => (relevance.get(b.slug)?.score ?? 0) - (relevance.get(a.slug)?.score ?? 0))
          .slice(0, Math.max(minimum, target * 2));

  const selected: CatalogPerspective[] = [];
  const remaining = [...pool];
  while (selected.length < target && remaining.length > 0) {
    let best: CatalogPerspective | null = null;
    let bestScore = -Infinity;
    for (const p of remaining) {
      const rel = (relevance.get(p.slug)?.score ?? 0) / maxRel;
      const div =
        selected.length === 0 ? 0 : Math.min(...selected.map((s) => perspectiveDistance(p, s)));
      const mmr = selected.length === 0 ? rel : lambda * rel + (1 - lambda) * div;
      if (mmr > bestScore || (mmr === bestScore && best !== null && p.slug < best.slug)) {
        best = p;
        bestScore = mmr;
      }
    }
    if (!best) break;
    // Stop adding near-duplicates once the minimum is reached.
    if (
      selected.length >= minimum &&
      Math.min(...selected.map((s) => perspectiveDistance(best as CatalogPerspective, s))) < 0.3
    )
      break;
    selected.push(best);
    remaining.splice(remaining.indexOf(best), 1);
  }

  return {
    selected: selected.map((p) => {
      const r = relevance.get(p.slug) ?? { score: 0, reason: p.description, requested: false };
      return {
        perspective: p,
        relevance: r.score,
        reason: r.reason || p.description,
        requested: r.requested,
      };
    }),
    diversity: averageDistance(selected),
  };
}
