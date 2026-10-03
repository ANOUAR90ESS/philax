import { loadDotEnv, loadEnv } from '@philax/config';
import { PoolDb } from '../client';
import { SEEDS_DIR } from '../paths';
import { loadSeed, readSeedData } from '../seed/loader';

loadDotEnv();
const env = loadEnv();
const url = process.argv.includes('--test') ? env.TEST_DATABASE_URL : env.DATABASE_URL;
if (!url) throw new Error('No database URL configured');

const db = new PoolDb(url, { max: 1 });
try {
  const result = await loadSeed(db, await readSeedData(SEEDS_DIR));
  console.info(
    `[seed] ${result.perspectives} perspectives, ${result.characters} characters, ${result.sources} sources, ` +
      `${result.chunks} chunks (${result.retiredChunks} retired). Run "pnpm knowledge:index" to embed chunks if EMBEDDING_MODEL is set.`,
  );
} finally {
  await db.close();
}
