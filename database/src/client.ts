import pg from 'pg';

export type SqlValue =
  string | number | boolean | null | Date | Buffer | readonly unknown[] | object;

/**
 * Minimal query interface shared by the pool and transaction clients. Every
 * repository depends on this, never on `pg` directly, so all SQL is parameterized
 * ($1, $2, …) and transactions compose.
 */
export interface Db {
  query<R extends object = Record<string, unknown>>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<{ rows: R[]; rowCount: number }>;
  /** Runs `fn` inside a transaction. Nested calls reuse the outer transaction. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

// Return BIGINT/NUMERIC as numbers where safe and timestamps as ISO strings.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (v) => new Date(v).toISOString());

class ClientDb implements Db {
  constructor(private readonly client: pg.PoolClient) {}

  async query<R extends object>(sql: string, params: readonly SqlValue[] = []) {
    const res = await this.client.query<R>(sql, params as unknown[]);
    return { rows: res.rows, rowCount: res.rowCount ?? 0 };
  }

  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

export class PoolDb implements Db {
  readonly pool: pg.Pool;

  constructor(connectionString: string, options: { max?: number } = {}) {
    this.pool = new pg.Pool({
      connectionString,
      max: options.max ?? 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    // Idle client errors must not crash the process; they are surfaced on next use.
    this.pool.on('error', (err) => {
      console.error('[db] idle client error', err.message);
    });
  }

  async query<R extends object>(sql: string, params: readonly SqlValue[] = []) {
    const res = await this.pool.query<R>(sql, params as unknown[]);
    return { rows: res.rows, rowCount: res.rowCount ?? 0 };
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new ClientDb(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Runs `fn` on one dedicated connection (needed for session-level advisory locks). */
  async withConnection<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(new ClientDb(client));
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Formats a number[] as a pgvector literal. */
export function toVectorLiteral(values: readonly number[]): string {
  if (values.some((v) => !Number.isFinite(v))) throw new Error('Vector contains non-finite values');
  return `[${values.join(',')}]`;
}
