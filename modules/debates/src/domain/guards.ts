/** Matches citation markers such as [E3] or [E3, E7] in a speech. */
const MARKER = /\[(E\d+(?:\s*,\s*E\d+)*)\]/g;

export function extractCitationLabels(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MARKER))
    for (const l of (m[1] ?? '').split(',')) out.push(l.trim());
  return [...new Set(out)];
}

/**
 * Verdict language is forbidden (§25): the platform never declares a winner or
 * ranks thinkers. Checked in en/es/ar on synthesis and turns.
 */
const WINNER_PATTERNS: RegExp[] = [
  /\b(the\s+)?winner\b/i,
  /\bwins? (the|this) (debate|argument)\b/i,
  /\b(won|lost) (the|this) debate\b/i,
  /\b(is|was) (clearly |obviously )?(right|correct) and \w+ (is|was) wrong\b/i,
  /\bmost correct\b/i,
  /\bbest (philosopher|thinker|argument overall)\b/i,
  /\bdebate champion\b/i,
  /\bganador(a)?\b/i,
  /\bgan[óa] el debate\b/i,
  /الفائز/,
  /فاز (في|ب)ال?مناظرة/,
];

export function findWinnerLanguage(text: string): string | null {
  for (const re of WINNER_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/** Phrases that present a reconstruction of a living figure as certain (§13). */
const CERTAINTY_ABOUT_PERSON =
  /\b(would|will) (definitely|certainly|surely) (say|argue|agree|think)\b/i;

export function findCertaintyClaim(text: string): string | null {
  return text.match(CERTAINTY_ABOUT_PERSON)?.[0] ?? null;
}
