import { PoolDb } from '@philax/database';
import { testEnv } from './env';

/** Tables holding per-test user data. Seeded knowledge tables are left intact. */
const USER_TABLES = ['users', 'ai_calls'];

export function createTestDb(): PoolDb {
  return new PoolDb(testEnv().DATABASE_URL, { max: 5 });
}

export async function resetUserData(db: PoolDb): Promise<void> {
  // users cascades to sessions, subscriptions, topics, debates, user sources, usage.
  await db.query(`TRUNCATE ${USER_TABLES.join(', ')} CASCADE`);
}
