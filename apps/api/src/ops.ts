/**
 * Operational entry point bundled with the API: `node dist/ops.js migrate|seed`.
 * Lets a deployment run migrations and load the curated seed without dev tooling.
 */
import { loadDotEnv, loadEnv } from '@philax/config';
import {
  loadSeed,
  migrate,
  MIGRATIONS_DIR,
  PoolDb,
  readMigrations,
  readSeedData,
  SEEDS_DIR,
} from '@philax/database';

loadDotEnv();
const env = loadEnv();
const command = process.argv[2];
const db = new PoolDb(env.DATABASE_URL, { max: 1 });
try {
  if (command === 'migrate') {
    const r = await migrate(db, await readMigrations(MIGRATIONS_DIR));
    console.info(`[ops] migrations applied: ${r.applied.join(', ') || 'none'}`);
  } else if (command === 'seed') {
    const r = await loadSeed(db, await readSeedData(SEEDS_DIR));
    console.info(
      `[ops] seed: ${r.characters} characters, ${r.chunks} chunks (${r.retiredChunks} retired)`,
    );
  } else {
    console.error('usage: node dist/ops.js <migrate|seed>');
    process.exitCode = 2;
  }
} finally {
  await db.close();
}
