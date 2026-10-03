import { describe, expect, it } from 'vitest';
import { formatYear, impliedConstraints } from './representation';

describe('impliedConstraints', () => {
  it('forbids anachronism and fake quotations for historical figures', () => {
    const rules = impliedConstraints({
      representation: 'historical',
      deathYear: -322,
      displayName: 'Aristotle',
    });
    expect(rules.map((r) => r.kind)).toEqual(['anachronism', 'never_claim']);
    expect(rules[0]?.rule).toContain('322 BCE');
  });
  it('forbids attributing unpublished views to living figures', () => {
    const rules = impliedConstraints({
      representation: 'contemporary',
      deathYear: null,
      displayName: 'Peter Singer',
    });
    expect(rules).toHaveLength(1);
    expect(rules[0]?.rule).toMatch(/never state or imply/);
  });
  it('formats years', () => {
    expect(formatYear(1873)).toBe('1873');
    expect(formatYear(null)).toBe('an unknown year');
  });
});
