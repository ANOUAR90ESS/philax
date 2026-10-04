import type { DebateParticipant } from '@philax/types';
import { describe, expect, it } from 'vitest';
import { pickScene } from './scenes';

const born = (...years: (number | null)[]) =>
  years.map((birthYear) => ({ character: { birthYear } }) as unknown as DebateParticipant);

describe('pickScene', () => {
  it('stages a challenged idea in the debate hall', () => {
    expect(pickScene({ mode: 'challenge', participants: born(-384, -428) })).toBe('hall');
  });

  it('matches the set to when the cast lived', () => {
    expect(pickScene({ mode: 'debate', participants: born(-384, -428, 1724) })).toBe('agora');
    expect(pickScene({ mode: 'debate', participants: born(1723, 1818, 1906) })).toBe('library');
    expect(pickScene({ mode: 'debate', participants: born(1906, 1929, 1818) })).toBe('studio');
  });

  it('falls back to the studio when no dates are known', () => {
    expect(pickScene({ mode: 'debate', participants: born(null) })).toBe('studio');
  });
});
