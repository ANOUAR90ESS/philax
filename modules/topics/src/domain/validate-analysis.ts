import type { TopicAnalysis } from '@philax/types';

/**
 * Semantic checks beyond the schema, used as `refine` for structured output so the
 * model gets a repair round with precise feedback.
 */
export function validateAnalysis(
  a: TopicAnalysis,
  catalogSlugs: ReadonlySet<string>,
): string | null {
  const ids = new Set(a.claims.map((c) => c.id));
  if (ids.size !== a.claims.length) return 'claims[].id must be unique';
  for (const c of a.claims) {
    for (const r of c.relatedClaimIds) {
      if (!ids.has(r)) return `claim ${c.id} references unknown claim id "${r}"`;
      if (r === c.id) return `claim ${c.id} references itself`;
    }
  }
  for (const p of a.requiredPerspectives) {
    if (p.perspectiveSlug !== null && !catalogSlugs.has(p.perspectiveSlug)) {
      return `requiredPerspectives contains unknown slug "${p.perspectiveSlug}"; use a catalog slug or null`;
    }
  }
  const slugs = a.requiredPerspectives.flatMap((p) =>
    p.perspectiveSlug ? [p.perspectiveSlug] : [],
  );
  if (new Set(slugs).size !== slugs.length)
    return 'requiredPerspectives must not repeat the same slug';
  return null;
}
