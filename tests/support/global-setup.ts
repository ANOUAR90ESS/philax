import { migrate, MIGRATIONS_DIR, PoolDb, readMigrations } from '@philax/database';
import { testEnv } from './env';
import { seedTestDatabase } from './seed';

/** Rebuilds the test database schema from migrations and loads the seed once per run. */
export default async function setup(): Promise<void> {
  const env = testEnv();
  const db = new PoolDb(env.DATABASE_URL, { max: 1 });
  try {
    await db.query('DROP SCHEMA IF EXISTS public CASCADE');
    await db.query('CREATE SCHEMA public');
    await migrate(db, await readMigrations(MIGRATIONS_DIR));
    await seedTestDatabase(db);
  } finally {
    await db.close();
  }
}
