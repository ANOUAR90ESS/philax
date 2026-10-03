import { loadSeed, readSeedData, SEEDS_DIR, type Db } from '@philax/database';

/** Loads the real curated seed into the test database. */
export async function seedTestDatabase(db: Db): Promise<void> {
  await loadSeed(db, await readSeedData(SEEDS_DIR));
}
