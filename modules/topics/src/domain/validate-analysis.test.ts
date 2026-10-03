import type { TopicAnalysis } from '@philax/types';
import { describe, expect, it } from 'vitest';
import { validateAnalysis } from './validate-analysis';

const base: TopicAnalysis = {
  title: 't',
  summary: 's',
  language: 'en',
  domains: ['technology'],
  concepts: ['creativity'],
  claims: [
    { id: 'c1', kind: 'claim', text: 'AI reduces effort', relatedClaimIds: [] },
    { id: 'c2', kind: 'assumption', text: 'Less effort means less skill', relatedClaimIds: ['c1'] },
  ],
  questions: ['q'],
  tensions: [],
  requiredPerspectives: [
    { perspectiveSlug: 'virtue-ethics', description: 'd', reason: 'r' },
    { perspectiveSlug: null, description: 'd2', reason: 'r2' },
  ],
  retrievalKeywords: ['a', 'b', 'c'],
  admitsReasonableDisagreement: true,
};
function at<T>(xs: T[], i: number): T {
  const x = xs[i];
  if (x === undefined) throw new Error('fixture index');
  return x;
}
const catalog = new Set(['virtue-ethics', 'utilitarianism']);

describe('validateAnalysis', () => {
  it('accepts a coherent analysis', () => expect(validateAnalysis(base, catalog)).toBeNull());
  it('rejects dangling claim references', () => {
    const bad = structuredClone(base);
    at(bad.claims, 1).relatedClaimIds = ['c9'];
    expect(validateAnalysis(bad, catalog)).toMatch(/unknown claim id/);
  });
  it('rejects slugs outside the catalog and duplicates', () => {
    const bad = structuredClone(base);
    at(bad.requiredPerspectives, 1).perspectiveSlug = 'astrology';
    expect(validateAnalysis(bad, catalog)).toMatch(/unknown slug/);
    at(bad.requiredPerspectives, 1).perspectiveSlug = 'virtue-ethics';
    expect(validateAnalysis(bad, catalog)).toMatch(/repeat/);
  });
});
