import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from './client';

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
// Arbitrary constant key so concurrent migrators serialize.
const MIGRATION_LOCK_KEY = 727_001;

export async function readMigrations(dir: string): Promise<MigrationFile[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const out: MigrationFile[] = [];
  for (const name of files) {
    if (!MIGRATION_NAME.test(name)) {
      throw new Error(`Invalid migration filename "${name}" (expected NNNN_snake_case.sql)`);
    }
    const sql = await readFile(join(dir, name), 'utf8');
    out.push({ name, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  return out;
}

/**
 * Applies pending migrations in order, each in its own transaction. Refuses to
 * run if an already-applied migration file was modified (checksum mismatch).
 */
export async function migrate(db: Db, migrations: MigrationFile[]): Promise<MigrationResult> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    const { rows } = await tx.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migrations',
    );
    const applied = new Map(rows.map((r) => [r.name, r.checksum]));
    const result: MigrationResult = { applied: [], skipped: [] };

    for (const m of migrations) {
      const existing = applied.get(m.name);
      if (existing) {
        if (existing !== m.checksum) {
          throw new Error(
            `Migration ${m.name} was modified after being applied. Create a new migration instead.`,
          );
        }
        result.skipped.push(m.name);
        continue;
      }
      await tx.query(m.sql);
      await tx.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
        m.name,
        m.checksum,
      ]);
      result.applied.push(m.name);
    }
    return result;
  });
}
