const ES = new Set([
  'el',
  'la',
  'los',
  'las',
  'de',
  'que',
  'y',
  'en',
  'un',
  'una',
  'es',
  'por',
  'para',
  'con',
  'no',
  'se',
  'del',
  'más',
  'como',
  'pero',
  'debería',
  'hay',
  'qué',
  'cómo',
]);
const EN = new Set([
  'the',
  'of',
  'and',
  'to',
  'in',
  'is',
  'that',
  'it',
  'for',
  'on',
  'with',
  'as',
  'be',
  'are',
  'this',
  'will',
  'should',
  'does',
  'what',
  'how',
  'not',
  'or',
  'can',
]);

/**
 * Cheap language guess used for full-text-search configuration and as a hint
 * to the topic analyzer (which makes the final call). Returns a BCP-47 tag.
 */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 4000);
  const letters = sample.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return 'und';
  const arabic = sample.match(/[؀-ۿݐ-ݿ]/g)?.length ?? 0;
  if (arabic / letters > 0.3) return 'ar';
  const words = sample
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  let es = 0;
  let en = 0;
  for (const w of words) {
    if (ES.has(w)) es++;
    if (EN.has(w)) en++;
  }
  if (/[ñ¿¡áéíóú]/i.test(sample)) es += 2;
  if (es === 0 && en === 0) return 'und';
  return es > en ? 'es' : 'en';
}

/** PostgreSQL text search configuration for a language tag. */
export function ftsConfigFor(language: string): 'english' | 'spanish' | 'arabic' | 'simple' {
  const base = language.slice(0, 2).toLowerCase();
  if (base === 'en') return 'english';
  if (base === 'es') return 'spanish';
  if (base === 'ar') return 'arabic';
  return 'simple';
}
