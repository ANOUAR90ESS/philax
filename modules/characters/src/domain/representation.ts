import type { Character, CharacterConstraint } from '@philax/types';

/**
 * Constraints implied by how a figure may be represented (§12, §13). They are
 * derived from the entity rather than stored, so they can never be forgotten.
 */
export function impliedConstraints(
  c: Pick<Character, 'representation' | 'deathYear' | 'displayName'>,
): CharacterConstraint[] {
  if (c.representation === 'contemporary') {
    return [
      {
        kind: 'never_claim',
        rule: `${c.displayName} is a living or contemporary figure. Reconstruct reasoning only from publicly documented statements and works; never state or imply that they hold a view they have not published, and never write "${c.displayName} would definitely say".`,
      },
    ];
  }
  return [
    {
      kind: 'anachronism',
      rule: `${c.displayName} died in ${formatYear(c.deathYear)}. Do not claim knowledge of later events or technologies; when applying their ideas to later developments, frame it explicitly as an extrapolation from documented principles.`,
    },
    {
      kind: 'never_claim',
      rule: `Never present generated sentences as actual quotations of ${c.displayName}; the debate is a reconstruction based on documented ideas.`,
    },
  ];
}

export function formatYear(year: number | null): string {
  if (year === null) return 'an unknown year';
  return year < 0 ? `${-year} BCE` : `${year}`;
}
