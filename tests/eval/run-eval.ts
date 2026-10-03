import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv, loadEnv } from '@philax/config';
import { PoolDb } from '@philax/database';
import { runLiveEval } from './live';
import { loadDataset, runOfflineEval } from './offline';

/**
 * pnpm eval            → offline evaluation (no LLM, no cost)
 * pnpm eval --live [N] → also runs N real debates against configured providers (costs money)
 * Uses DATABASE_URL (must be migrated and seeded).
 */
loadDotEnv();
const env = loadEnv();
const live = process.argv.includes('--live');
const limitArg = Number(process.argv[process.argv.indexOf('--live') + 1]);
const db = new PoolDb(env.DATABASE_URL);
const data = loadDataset();
try {
  const offline = await runOfflineEval(db, data);
  const report: Record<string, unknown> = { generatedAt: new Date().toISOString(), offline };
  if (live)
    report.live = await runLiveEval(
      db,
      env,
      data,
      Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 5,
    );
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'reports');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.info(JSON.stringify(report, null, 2));
  console.info(`[eval] report written to ${file}`);
} finally {
  await db.close();
}
