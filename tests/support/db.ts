import { PoolDb } from '@philax/database';
import { testEnv } from './env';

export function createTestDb(): PoolDb {
  return new PoolDb(testEnv().DATABASE_URL, { max: 5 });
}

/**
 * Removes per-test user data. Uses row-level DELETE (FK ON DELETE CASCADE) rather
 * than TRUNCATE … CASCADE, which would wipe entire referencing tables such as the
 * seeded `sources` table.
 */
export async function resetUserData(db: PoolDb): Promise<void> {
  await db.query('DELETE FROM ai_calls');
  await db.query('DELETE FROM users');
}
