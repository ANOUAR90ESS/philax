import { describe, expect, it } from 'vitest';
import { uuidv7 } from './ids';

describe('uuidv7', () => {
  it('produces RFC 9562 version 7 / variant 10 UUIDs', () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is time-ordered and unique', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a < b).toBe(true);
    const set = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(set.size).toBe(1000);
  });
});
