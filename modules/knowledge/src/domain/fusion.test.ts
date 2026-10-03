import { describe, expect, it } from 'vitest';
import { extractKeywords, reciprocalRankFusion, toOrQuery } from './fusion';

describe('reciprocalRankFusion', () => {
  it('rewards items ranked well in several lists', () => {
    const s = reciprocalRankFusion([
      ['a', 'b', 'c'],
      ['b', 'a', 'd'],
    ]);
    expect(s.get('a')).toBeCloseTo(s.get('b') as number);
    expect((s.get('a') as number) > (s.get('c') as number)).toBe(true);
    expect((s.get('c') as number) > 0 && (s.get('d') as number) > 0).toBe(true);
  });
});

describe('keywords', () => {
  it('drops stopwords and duplicates, keeps unicode words', () => {
    expect(extractKeywords('Will AI make the people less creative? Creative people!')).toEqual([
      'make',
      'people',
      'less',
      'creative',
    ]);
    expect(extractKeywords('الذكاء الاصطناعي والإبداع')).toEqual([
      'الذكاء',
      'الاصطناعي',
      'والإبداع',
    ]);
  });
  it('builds a sanitized OR query', () => {
    expect(toOrQuery(['freedom', 'division of labour', 'a|b'])).toBe(
      'freedom or "division of labour" or "a b"',
    );
  });
});
