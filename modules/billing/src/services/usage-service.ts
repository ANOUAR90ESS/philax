import { uuidv7, type Db } from '@philax/database';
import { AppError } from '@philax/types';
import { limitsFor, type Plan, type UsageKind } from '../domain/plans';

export class UsageService {
  constructor(private readonly db: Db) {}

  async countLast24h(userId: string, kind: UsageKind): Promise<number> {
    const { rows } = await this.db.query<{ total: number }>(
      `SELECT COALESCE(SUM(quantity), 0)::int AS total FROM usage_events
       WHERE user_id = $1 AND kind = $2 AND created_at > now() - interval '24 hours'`,
      [userId, kind],
    );
    return rows[0]?.total ?? 0;
  }

  /** Throws QUOTA_EXCEEDED if recording one more `kind` event would exceed the plan's daily limit. */
  async assertWithinQuota(userId: string, plan: Plan, kind: UsageKind): Promise<void> {
    const used = await this.countLast24h(userId, kind);
    if (used >= limitsFor(plan).daily[kind]) {
      throw new AppError(
        'QUOTA_EXCEEDED',
        'You have reached the daily limit for this action. Please try again later.',
        {
          details: { kind },
        },
      );
    }
  }

  async record(
    userId: string,
    kind: UsageKind,
    debateId: string | null = null,
    quantity = 1,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO usage_events (id, user_id, kind, debate_id, quantity) VALUES ($1, $2, $3, $4, $5)`,
      [uuidv7(), userId, kind, debateId, quantity],
    );
  }
}
