/** Reciprocal Rank Fusion (Cormack et al., 2009) with the conventional k = 60. */
export function reciprocalRankFusion(rankings: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, idx) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return scores;
}

const STOPWORDS = new Set(
  'a an and are as at be but by can could do does for from has have how i if in into is it its may might more most no not of on or our should so than that the their them then there these they this to was we were what when where which who why will with would you your'.split(
    ' ',
  ),
);

/** Extracts lowercase content words usable as OR-ed lexical search terms. */
export function extractKeywords(text: string, max = 12): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, max);
}

/** Builds a websearch_to_tsquery string that ORs sanitized terms (phrases allowed). */
export function toOrQuery(terms: string[]): string {
  return terms
    .map((t) => t.replace(/["'\\:&|!()<>*]/g, ' ').trim())
    .filter(Boolean)
    .map((t) => (t.includes(' ') ? `"${t}"` : t))
    .join(' or ');
}
