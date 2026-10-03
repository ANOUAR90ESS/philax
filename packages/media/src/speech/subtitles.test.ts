import { describe, expect, it } from 'vitest';
import { captionAt, speakableText, subtitleSegments, timeWords } from './subtitles';

function alignment(text: string, msPerChar: number) {
  const chars = [...text];
  return {
    characters: chars,
    character_start_times_seconds: chars.map((_, i) => (i * msPerChar) / 1000),
    character_end_times_seconds: chars.map((_, i) => ((i + 1) * msPerChar) / 1000),
  };
}

describe('subtitles', () => {
  it('removes citation markers and markup from spoken text', () => {
    expect(speakableText('Freedom is *action* [E1, E2]. It is plural [E3].')).toBe(
      'Freedom is action. It is plural.',
    );
  });

  it('times words from the voice alignment', () => {
    const text = 'God is dead. And we have killed him!';
    const words = timeWords(text, alignment(text, 50));
    expect(words[0]).toMatchObject({ text: 'God', startMs: 0, endMs: 150 });
    expect(words[1]).toMatchObject({ text: 'is', startMs: 200, endMs: 300 });
    const segments = subtitleSegments(text, alignment(text, 50));
    expect(segments.map((s) => s.text)).toEqual(['God is dead.', 'And we have killed him!']);
    expect(segments[1]?.startMs).toBe(650);
  });

  it('estimates timing when there is no audio, slower for slower delivery', () => {
    const fast = timeWords('Thinking matters.', undefined, 1.1);
    const slow = timeWords('Thinking matters.', undefined, 0.9);
    expect(slow.at(-1)?.endMs ?? 0).toBeGreaterThan(fast.at(-1)?.endMs ?? 0);
  });

  it('handles Arabic and Spanish punctuation and long sentences', () => {
    expect(subtitleSegments('ما الحرية؟ إنها الفعل.').map((s) => s.text)).toEqual([
      'ما الحرية؟',
      'إنها الفعل.',
    ]);
    expect(subtitleSegments('¿Qué es la libertad? Es acción.')).toHaveLength(2);
    const long = Array.from({ length: 12 }, (_, i) => `clause number ${i} goes on`).join(', ');
    const segments = subtitleSegments(`${long}.`);
    expect(segments.length).toBeGreaterThan(1);
    for (const s of segments) expect(s.text.length).toBeLessThanOrEqual(180);
    expect(segments.map((s) => s.text).join(' ')).toBe(`${long}.`);
  });

  it('finds the caption at a playback position', () => {
    const text = 'Labor work. Action begins.';
    const segments = subtitleSegments(text, alignment(text, 100));
    expect(captionAt(segments, 0)).toEqual({ segment: 0, word: 0 });
    expect(captionAt(segments, 650)).toEqual({ segment: 0, word: 1 });
    expect(captionAt(segments, 1300)).toEqual({ segment: 1, word: 0 });
    expect(captionAt([], 10)).toBeNull();
  });
});
