import type { TopicAnalysis } from '@philax/types';
import { describe, expect, it } from 'vitest';
import type { CharacterCandidate } from '../repositories/character-repository';
import { assignByPerspective, pairAdjustment, scoreCandidate } from './scoring';

const analysis = {
  domains: ['technology', 'work'],
  concepts: ['machinery', 'creativity'],
  retrievalKeywords: ['machinery', 'division of labour'],
} as unknown as TopicAnalysis;

function cand(
  slug: string,
  perspectives: [string, number][],
  extra: Partial<CharacterCandidate> = {},
): CharacterCandidate {
  return {
    id: `id-${slug}`,
    slug,
    displayName: slug,
    representation: 'historical',
    deathYear: 1900,
    worldviewSummary: 'w',
    domains: ['technology'],
    concepts: [],
    perspectives: perspectives.map(([s, strength]) => ({ slug: s, strength })),
    positionCount: 5,
    primarySourceCount: 2,
    sourceCount: 3,
    relations: [],
    ...extra,
  };
}

describe('scoreCandidate', () => {
  it('rewards paradigmatic representatives of needed perspectives, not popularity', () => {
    const targets = [{ slug: 'marxism', relevance: 1 }];
    const strong = scoreCandidate(cand('marx', [['marxism', 3]]), analysis, targets, 2);
    const weak = scoreCandidate(cand('sartre', [['marxism', 1]]), analysis, targets, 0);
    expect(strong.perspectiveSlug).toBe('marxism');
    expect(strong.total).toBeGreaterThan(weak.total);
  });

  it('accounts for knowledge availability and evidence quality', () => {
    const targets = [{ slug: 'x', relevance: 1 }];
    const rich = scoreCandidate(cand('a', [['x', 3]]), analysis, targets, 0);
    const poor = scoreCandidate(
      cand('b', [['x', 3]], { positionCount: 1, primarySourceCount: 0 }),
      analysis,
      targets,
      0,
    );
    expect(rich.total).toBeGreaterThan(poor.total);
  });
});

describe('assignByPerspective', () => {
  it('assigns distinct characters and avoids same-tradition pairs', () => {
    const a = cand('a', [['p1', 3]]);
    const b = cand('b', [['p2', 3]], {
      relations: [{ otherId: 'id-a', relation: 'shares_tradition' }],
    });
    const c = cand('c', [['p2', 2]], { relations: [{ otherId: 'id-a', relation: 'critiques' }] });
    const targets = [
      { slug: 'p1', relevance: 1 },
      { slug: 'p2', relevance: 1 },
    ];
    const scored = [a, b, c].map((x) => ({
      candidate: x,
      score: scoreCandidate(x, analysis, targets, 0),
    }));
    const chosen = assignByPerspective(scored, targets, 2);
    expect(chosen.map((s) => s.candidate.slug)).toEqual(['a', 'c']);
    expect(pairAdjustment(a, b)).toBeLessThan(0);
  });
});
