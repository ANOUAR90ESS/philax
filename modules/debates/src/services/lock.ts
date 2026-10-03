import type { PoolDb } from '@philax/database';
import { AppError } from '@philax/types';

export interface DebateLock {
  /** Runs `fn` while holding an exclusive per-debate lock; rejects if already held. */
  withLock<T>(debateId: string, fn: () => Promise<T>): Promise<T>;
}

/**
 * PostgreSQL session advisory lock on a dedicated connection. Prevents two
 * concurrent requests from generating the same round twice, across processes.
 */
export class PgAdvisoryLock implements DebateLock {
  constructor(private readonly pool: PoolDb) {}

  withLock<T>(debateId: string, fn: () => Promise<T>): Promise<T> {
    return this.pool.withConnection(async (conn) => {
      const { rows } = await conn.query<{ ok: boolean }>(
        `SELECT pg_try_advisory_lock(hashtext($1)) AS ok`,
        [`debate:${debateId}`],
      );
      if (!rows[0]?.ok)
        throw new AppError(
          'CONFLICT',
          'This debate is already being generated. Please wait a moment.',
        );
      try {
        return await fn();
      } finally {
        await conn.query(`SELECT pg_advisory_unlock(hashtext($1))`, [`debate:${debateId}`]);
      }
    });
  }
}
