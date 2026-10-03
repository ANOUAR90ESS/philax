import type { Db } from '@philax/database';

export class SessionRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [input.id, input.userId, input.tokenHash, input.expiresAt],
    );
  }

  /** Returns the user id for a valid, unexpired session and refreshes last_seen_at. */
  async touch(tokenHash: string): Promise<string | null> {
    const { rows } = await this.db.query<{ userId: string }>(
      `UPDATE sessions SET last_seen_at = now()
       WHERE token_hash = $1 AND expires_at > now()
       RETURNING user_id AS "userId"`,
      [tokenHash],
    );
    return rows[0]?.userId ?? null;
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.db.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
  }

  async deleteExpired(): Promise<number> {
    const { rowCount } = await this.db.query(`DELETE FROM sessions WHERE expires_at <= now()`);
    return rowCount;
  }
}
