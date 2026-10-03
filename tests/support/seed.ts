import type { Db } from '@philax/database';

/** Loads the production seed into the test database (filled in once seeds exist). */
export async function seedTestDatabase(_db: Db): Promise<void> {}
