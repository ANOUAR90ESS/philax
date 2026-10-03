/**
 * Text-driven lip sync. Speech is split into subtitle segments and words; each
 * word gets a viseme sequence and an estimated duration. Playback re-anchors
 * on word boundaries reported by the voice, so the mouth follows the audio.
 */

export const VISEMES = ['rest', 'closed', 'open', 'wide', 'round', 'teeth', 'narrow'] as const;
export type Viseme = (typeof VISEMES)[number];

/** Mouth shape per viseme: vertical opening and horizontal width, 0–1. */
export const VISEME_SHAPE: Record<Viseme, { open: number; width: number }> = {
  rest: { open: 0, width: 0.5 },
  closed: { open: 0, width: 0.45 },
  open: { open: 0.85, width: 0.6 },
  wide: { open: 0.4, width: 0.85 },
  round: { open: 0.55, width: 0.3 },
  teeth: { open: 0.15, width: 0.6 },
  narrow: { open: 0.3, width: 0.5 },
};

const LATIN: [RegExp, Viseme][] = [
  [/[aáàâä]/, 'open'],
  [/[eéèêëiíìîïy]/, 'wide'],
  [/[oóòôöuúùûüw]/, 'round'],
  [/[mbp]/, 'closed'],
  [/[fv]/, 'teeth'],
];
const ARABIC_VOWELS: Record<string, Viseme> = {
  ا: 'open',
  أ: 'open',
  إ: 'wide',
  آ: 'open',
  ى: 'open',
  ي: 'wide',
  و: 'round',
  'َ': 'open', // fatha
  'ِ': 'wide', // kasra
  'ُ': 'round', // damma
};
const ARABIC_CONSONANTS: Record<string, Viseme> = { م: 'closed', ب: 'closed', ف: 'teeth' };
const ARABIC_LETTER = /[ء-ي]/;

/** Viseme sequence for one word, with consecutive repeats collapsed. */
export function wordVisemes(word: string): Viseme[] {
  const chars = [...word.toLowerCase()];
  const out: Viseme[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? '';
    let v: Viseme | undefined = ARABIC_VOWELS[c] ?? ARABIC_CONSONANTS[c];
    if (!v && ARABIC_LETTER.test(c)) v = 'narrow';
    if (!v) v = LATIN.find(([re]) => re.test(c))?.[1];
    if (!v && /\p{L}/u.test(c)) v = 'narrow';
    if (!v) continue;
    out.push(v);
    // Unwritten short vowels: open the mouth after an Arabic consonant not followed by a vowel.
    const next = chars[i + 1] ?? '';
    if (ARABIC_LETTER.test(c) && !ARABIC_VOWELS[c] && next && !ARABIC_VOWELS[next])
      out.push('open');
  }
  return out.filter((v, i) => v !== out[i - 1]);
}

export interface TimedWord {
  text: string;
  /** Character offsets within the segment text. */
  start: number;
  end: number;
  visemes: Viseme[];
  durationMs: number;
}

export interface SubtitleSegment {
  index: number;
  text: string;
  words: TimedWord[];
  estimatedMs: number;
}

/** Spoken text: citation markers and markup removed, whitespace collapsed. */
export function speakableText(content: string): string {
  return content
    .replace(/\[(?:E\d+(?:\s*,\s*E\d+)*)\]/g, '')
    .replace(/[*_#`>]+/g, '')
    .replace(/\s+([.,;:!?،؛؟])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const SENTENCE = /[^.!?؟…]+(?:[.!?؟…]+["»”')]*|$)/g;
const MAX_SEGMENT = 180;
/** Milliseconds per character at rate 1 (≈ 160 words per minute). */
const MS_PER_CHAR = 62;

function splitLong(sentence: string): string[] {
  if (sentence.length <= MAX_SEGMENT) return [sentence];
  const parts: string[] = [];
  let current = '';
  for (const clause of sentence.split(/(?<=[,;:،؛])\s+/)) {
    if (current && (current + ' ' + clause).length > MAX_SEGMENT) {
      parts.push(current);
      current = clause;
    } else current = current ? `${current} ${clause}` : clause;
  }
  if (current) parts.push(current);
  return parts;
}

export function wordDurationMs(word: string, rate: number): number {
  return Math.round(Math.max(160, [...word].length * MS_PER_CHAR) / rate);
}

/** Splits speech into subtitle segments with per-word lip-sync timing. */
export function segmentSpeech(content: string, rate = 1): SubtitleSegment[] {
  const text = speakableText(content);
  const sentences = (text.match(SENTENCE) ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap(splitLong);
  return sentences.map((sentence, index) => {
    const words: TimedWord[] = [];
    for (const m of sentence.matchAll(/\S+/g)) {
      const start = m.index ?? 0;
      words.push({
        text: m[0],
        start,
        end: start + m[0].length,
        visemes: wordVisemes(m[0]),
        durationMs: wordDurationMs(m[0], rate),
      });
    }
    return {
      index,
      text: sentence,
      words,
      estimatedMs: words.reduce((t, w) => t + w.durationMs, 0),
    };
  });
}

/** Index of the word containing a character offset reported by the voice. */
export function wordAtChar(segment: SubtitleSegment, charIndex: number): number {
  const i = segment.words.findIndex((w) => charIndex < w.end);
  return i === -1 ? segment.words.length - 1 : i;
}

/** Viseme to show `elapsedMs` into a word; the mouth closes between words. */
export function visemeAt(word: TimedWord | undefined, elapsedMs: number): Viseme {
  if (!word || word.visemes.length === 0 || elapsedMs >= word.durationMs) return 'rest';
  const slot = Math.floor((elapsedMs / word.durationMs) * word.visemes.length);
  return word.visemes[Math.min(slot, word.visemes.length - 1)] ?? 'rest';
}
