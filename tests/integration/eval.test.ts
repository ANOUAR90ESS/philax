import { afterAll, describe, expect, it } from 'vitest';
import { runOfflineEval } from '../eval/offline';
import { createTestDb } from '../support/db';

const db = createTestDb();
afterAll(() => db.close());

/** Quality gates for the deterministic AI pipeline (docs/ai/evaluation.md). */
describe('offline AI evaluation', () => {
  it('meets diversity, grounding, constraint and isolation thresholds on the eval dataset', async () => {
    const r = await runOfflineEval(db);
    console.info('[eval]', JSON.stringify({ ...r, failures: r.failures.length }));
    expect(r.topics).toBe(20);
    expect(r.castValidity).toBe(1);
    expect(r.conflictEncoding).toBe(1);
    expect(r.evidenceAttribution).toBe(1);
    expect(r.anachronismGuard).toBe(1);
    expect(r.injectionIsolation).toBe(1);
    expect(r.meanPerspectiveDiversity).toBeGreaterThanOrEqual(0.7);
    expect(r.contrastCoverage, r.failures.join('\n')).toBeGreaterThanOrEqual(0.9);
    expect(r.historicalRetrieval, r.failures.join('\n')).toBeGreaterThanOrEqual(0.8);
    expect(r.topicalGrounding).toBeGreaterThanOrEqual(0.6);
  }, 60_000);
});
