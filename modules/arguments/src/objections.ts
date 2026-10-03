export interface ObjectionCandidate {
  text: string;
  /** 1–5: how directly it bears on the target argument. */
  relevance: number;
  /** 1–5: how hard it is to answer (targets a premise, assumption or evidence). */
  strength: number;
  targets: 'premise' | 'assumption' | 'evidence' | 'conclusion' | 'definition';
}

/**
 * Strongest-objection selection (§23): rank candidates by relevance and strength
 * and select the strongest. Objections attacking assumptions or evidence are
 * preferred on ties because they cut deeper than restating the opposite
 * conclusion. Scores stay internal (never shown to users).
 */
export function selectStrongestObjection(
  candidates: ObjectionCandidate[],
): ObjectionCandidate | null {
  const depth: Record<ObjectionCandidate['targets'], number> = {
    assumption: 3,
    evidence: 3,
    premise: 2,
    definition: 2,
    conclusion: 1,
  };
  const ranked = candidates
    .filter((c) => c.relevance >= 3)
    .sort(
      (a, b) =>
        b.strength * b.relevance - a.strength * a.relevance ||
        depth[b.targets] - depth[a.targets] ||
        a.text.localeCompare(b.text),
    );
  return ranked[0] ?? null;
}
