import { loadDotEnv, loadEnv } from '@philax/config';
import { PoolDb } from '../client';
import { migrate, readMigrations } from '../migrator';
import { MIGRATIONS_DIR } from '../paths';

loadDotEnv();
const env = loadEnv();
const url = process.argv.includes('--test') ? env.TEST_DATABASE_URL : env.DATABASE_URL;
if (!url) throw new Error('No database URL configured');

const db = new PoolDb(url, { max: 1 });
try {
  const result = await migrate(db, await readMigrations(MIGRATIONS_DIR));
  console.info(
    `[migrate] applied ${result.applied.length} (${result.applied.join(', ') || 'none'}), ` +
      `${result.skipped.length} already applied`,
  );
} finally {
  await db.close();
}
