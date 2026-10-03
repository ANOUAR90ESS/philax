import { describe, expect, it } from 'vitest';
import { segmentSpeech, speakableText, visemeAt, wordAtChar, wordVisemes } from './visemes';

function must<T>(x: T | undefined): T {
  if (x === undefined) throw new Error('missing');
  return x;
}

describe('lip sync', () => {
  it('maps Latin and Arabic words to mouth shapes', () => {
    expect(wordVisemes('mama')).toEqual(['closed', 'open', 'closed', 'open']);
    expect(wordVisemes('Hola')).toEqual(['narrow', 'round', 'narrow', 'open']);
    // ب closes the lips; unwritten short vowels open the mouth.
    expect(wordVisemes('كتب')).toEqual(['narrow', 'open', 'narrow', 'open', 'closed']);
    expect(wordVisemes('...')).toEqual([]);
  });

  it('removes citation markers from spoken text', () => {
    expect(speakableText('Freedom is action [E1, E2]. It is plural [E3].')).toBe(
      'Freedom is action. It is plural.',
    );
  });

  it('splits speech into sentences with timed words, slower for slower voices', () => {
    const fast = segmentSpeech('God is dead. And we have killed him!', 1.1);
    const slow = segmentSpeech('God is dead. And we have killed him!', 0.9);
    expect(fast.map((s) => s.text)).toEqual(['God is dead.', 'And we have killed him!']);
    expect(fast[1]?.words.map((w) => w.text)).toEqual(['And', 'we', 'have', 'killed', 'him!']);
    expect(slow[0]?.estimatedMs ?? 0).toBeGreaterThan(fast[0]?.estimatedMs ?? 0);
  });

  it('handles Arabic and Spanish punctuation', () => {
    expect(segmentSpeech('ما الحرية؟ إنها الفعل.').map((s) => s.text)).toEqual([
      'ما الحرية؟',
      'إنها الفعل.',
    ]);
    expect(segmentSpeech('¿Qué es la libertad? Es acción.')).toHaveLength(2);
  });

  it('breaks long sentences at clause boundaries', () => {
    const long = Array.from({ length: 12 }, (_, i) => `clause number ${i} goes on a while`).join(
      ', ',
    );
    const segments = segmentSpeech(`${long}.`);
    expect(segments.length).toBeGreaterThan(1);
    for (const s of segments) expect(s.text.length).toBeLessThanOrEqual(180);
  });

  it('follows voice boundaries and rests between words', () => {
    const segment = must(segmentSpeech('Labor work action.')[0]);
    expect(wordAtChar(segment, 0)).toBe(0);
    expect(wordAtChar(segment, 6)).toBe(1);
    expect(wordAtChar(segment, 999)).toBe(2);
    const word = must(segment.words[0]);
    expect(visemeAt(word, 0)).toBe(word.visemes[0]);
    expect(visemeAt(word, word.durationMs + 1)).toBe('rest');
    expect(visemeAt(undefined, 0)).toBe('rest');
  });
});
