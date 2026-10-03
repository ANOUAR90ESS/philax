import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TopicAnalysis } from '@philax/types';
import { describe, expect, it } from 'vitest';
import type { CatalogPerspective } from '../repositories/perspective-repository';
import { averageDistance, perspectiveDistance, selectPerspectives } from './perspective-engine';

// The real curated catalog: the engine is tested against production data.
const raw = JSON.parse(
  readFileSync(join(__dirname, '../../../../database/seeds/perspectives.json'), 'utf8'),
) as Omit<CatalogPerspective, 'id'>[];
const catalog: CatalogPerspective[] = raw.map((p, i) => ({
  ...p,
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
}));
const bySlug = (s: string) => catalog.find((p) => p.slug === s) as CatalogPerspective;

function analysis(over: Partial<TopicAnalysis>): TopicAnalysis {
  return {
    title: 'Does technology make people more free?',
    summary: 's',
    language: 'en',
    domains: ['technology', 'politics'],
    concepts: ['freedom', 'technology', 'autonomy'],
    claims: [
      { id: 'c1', kind: 'claim', text: 'Technology increases freedom', relatedClaimIds: [] },
    ],
    questions: ['What is freedom?'],
    tensions: [
      {
        description: 'Freedom as choice vs self-mastery',
        axis: 'definitions',
        poles: ['choice', 'self-mastery'],
      },
    ],
    requiredPerspectives: [
      {
        perspectiveSlug: 'natural-rights-liberalism',
        description: 'Freedom as individual choice',
        reason: 'Technology widens options',
      },
      {
        perspectiveSlug: 'technological-criticism',
        description: 'Technology as enframing',
        reason: 'Tools reshape users',
      },
      {
        perspectiveSlug: 'stoicism',
        description: 'Freedom as self-mastery',
        reason: 'Freedom is inner',
      },
      {
        perspectiveSlug: 'civic-republicanism',
        description: 'Freedom as non-domination',
        reason: 'Platforms dominate',
      },
    ],
    retrievalKeywords: ['freedom', 'technology', 'autonomy', 'domination'],
    admitsReasonableDisagreement: true,
    ...over,
  };
}

describe('perspectiveDistance', () => {
  it('treats curated contrasts as principled opposition', () => {
    expect(perspectiveDistance(bySlug('utilitarianism'), bySlug('deontology'))).toBe(1);
    expect(perspectiveDistance(bySlug('utilitarianism'), bySlug('utilitarianism'))).toBe(0);
  });
});

describe('selectPerspectives', () => {
  it('selects requested, mutually distant perspectives', () => {
    const plan = selectPerspectives(analysis({}), catalog);
    const slugs = plan.selected.map((s) => s.perspective.slug);
    expect(slugs.length).toBeGreaterThanOrEqual(3);
    expect(slugs).toContain('natural-rights-liberalism');
    expect(slugs).toContain('technological-criticism');
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(plan.diversity).toBeGreaterThan(0.6);
    expect(plan.selected.every((s) => s.reason.length > 0)).toBe(true);
  });

  it('prefers disagreement over a cluster of similar perspectives', () => {
    const plan = selectPerspectives(
      analysis({
        domains: ['economics'],
        requiredPerspectives: [
          { perspectiveSlug: 'market-liberalism', description: 'Markets', reason: 'r' },
          { perspectiveSlug: 'natural-rights-liberalism', description: 'Rights', reason: 'r' },
          { perspectiveSlug: 'marxism', description: 'Class', reason: 'r' },
          { perspectiveSlug: 'egalitarian-liberalism', description: 'Fairness', reason: 'r' },
        ],
      }),
      catalog,
      { target: 3 },
    );
    const slugs = plan.selected.map((s) => s.perspective.slug);
    expect(slugs).toContain('marxism');
    expect(slugs).toContain('market-liberalism');
  });

  it('still returns a diverse minimum when the analyzer requested only free-text perspectives', () => {
    const plan = selectPerspectives(
      analysis({
        requiredPerspectives: [
          {
            perspectiveSlug: null,
            description: 'Aggregate welfare and consequences for everyone',
            reason: 'Costs and benefits matter',
          },
          {
            perspectiveSlug: null,
            description: 'Duty, dignity and rights that cannot be traded off',
            reason: 'Persons are ends',
          },
        ],
      }),
      catalog,
    );
    expect(plan.selected.length).toBeGreaterThanOrEqual(3);
    expect(averageDistance(plan.selected.map((s) => s.perspective))).toBeGreaterThan(0.5);
  });
});
