import type { Db } from '@philax/database';
import type { Locale } from '@philax/types';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  locale: Locale;
  plan: 'free' | 'pro';
}

const SELECT = `SELECT u.id, u.email, u.password_hash AS "passwordHash", u.display_name AS "displayName",
  u.locale, COALESCE(s.plan, 'free') AS plan
  FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'`;

export class UserRepository {
  constructor(private readonly db: Db) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await this.db.query<UserRecord>(`${SELECT} WHERE lower(u.email) = lower($1)`, [
      email,
    ]);
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.db.query<UserRecord>(`${SELECT} WHERE u.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async create(input: {
    id: string;
    email: string;
    passwordHash: string;
    displayName: string | null;
    locale: Locale;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO users (id, email, password_hash, display_name, locale) VALUES ($1, $2, $3, $4, $5)`,
      [input.id, input.email, input.passwordHash, input.displayName, input.locale],
    );
  }

  async updateLocale(id: string, locale: Locale): Promise<void> {
    await this.db.query(`UPDATE users SET locale = $2, updated_at = now() WHERE id = $1`, [
      id,
      locale,
    ]);
  }

  /** Hard delete; cascades to sessions, topics, debates, user sources, usage. */
  async delete(id: string): Promise<void> {
    await this.db.query(`DELETE FROM users WHERE id = $1`, [id]);
  }
}
