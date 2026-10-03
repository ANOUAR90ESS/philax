/**
 * Subtitles for spoken turns. Text is cleaned once (the same text is sent to
 * the voice provider), split into short sentence segments, and each word is
 * timed from the provider's character alignment so captions follow the audio.
 */

/** Spoken text: citation markers and markup removed, whitespace collapsed. */
export function speakableText(content: string): string {
  return content
    .replace(/\[(?:E\d+(?:\s*,\s*E\d+)*)\]/g, '')
    .replace(/[*_#`>]+/g, '')
    .replace(/\s+([.,;:!?،؛؟])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Character timing as returned by ElevenLabs `with-timestamps` endpoints. */
export interface CharacterAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface TimedWord {
  text: string;
  /** Character offsets in the spoken text. */
  start: number;
  end: number;
  startMs: number;
  endMs: number;
}

export interface SubtitleSegment {
  index: number;
  text: string;
  words: TimedWord[];
  startMs: number;
  endMs: number;
}

const SENTENCE = /[^.!?؟…]+(?:[.!?؟…]+["»”')]*|$)/g;
const MAX_SEGMENT = 180;
/** Reading-speed estimate used when no audio timing exists (≈ 160 wpm). */
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

/** Sentence ranges (character offsets) within already-spoken text. */
function sentenceRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const m of text.matchAll(SENTENCE)) {
    const base = m.index ?? 0;
    let cursor = 0;
    for (const part of splitLong(m[0].trim())) {
      const at = m[0].indexOf(part, cursor);
      if (at < 0 || !part) continue;
      ranges.push({ start: base + at, end: base + at + part.length });
      cursor = at + part.length;
    }
  }
  return ranges;
}

/**
 * Words with times. With an alignment the times are the provider's; without
 * one they are a reading-speed estimate (`rate` scales it).
 */
export function timeWords(text: string, alignment?: CharacterAlignment, rate = 1): TimedWord[] {
  const words: TimedWord[] = [];
  let clock = 0;
  for (const m of text.matchAll(/\S+/g)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    let startMs: number;
    let endMs: number;
    const s = alignment?.character_start_times_seconds[start];
    const e = alignment?.character_end_times_seconds[end - 1];
    if (alignment && s !== undefined && e !== undefined) {
      startMs = Math.round(s * 1000);
      endMs = Math.round(e * 1000);
    } else {
      startMs = clock;
      endMs = clock + Math.round(Math.max(160, [...m[0]].length * MS_PER_CHAR) / rate);
    }
    clock = endMs + Math.round(60 / rate);
    words.push({ text: m[0], start, end, startMs, endMs });
  }
  return words;
}

/** Subtitle segments for spoken text, timed by the alignment when available. */
export function subtitleSegments(
  text: string,
  alignment?: CharacterAlignment,
  rate = 1,
): SubtitleSegment[] {
  const words = timeWords(text, alignment, rate);
  return sentenceRanges(text)
    .map((r, index) => {
      const inSegment = words.filter((w) => w.start >= r.start && w.end <= r.end);
      return {
        index,
        text: text.slice(r.start, r.end),
        words: inSegment,
        startMs: inSegment[0]?.startMs ?? 0,
        endMs: inSegment.at(-1)?.endMs ?? 0,
      };
    })
    .filter((s) => s.words.length > 0)
    .map((s, index) => ({ ...s, index }));
}

/** Segment and word showing at `ms` into the audio. */
export function captionAt(
  segments: readonly SubtitleSegment[],
  ms: number,
): { segment: number; word: number } | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (!seg || ms < seg.startMs) continue;
    let word = 0;
    seg.words.forEach((w, j) => {
      if (ms >= w.startMs) word = j;
    });
    return { segment: i, word };
  }
  return segments.length ? { segment: 0, word: 0 } : null;
}
