import { uuidv7, type Db } from '@philax/database';
import type { DebateRound, RoundPhase } from '@philax/types';

export interface RoundRow extends DebateRound {
  id: string;
}

export class RoundRepository {
  constructor(private readonly db: Db) {}

  /** Returns the round with this number, creating it in `generating` state if new. */
  async open(debateId: string, number: number, phase: RoundPhase): Promise<RoundRow> {
    await this.db.query(
      `INSERT INTO debate_rounds (id, debate_id, number, phase, status, started_at) VALUES ($1, $2, $3, $4, 'generating', now())
       ON CONFLICT (debate_id, number) DO UPDATE SET status = CASE WHEN debate_rounds.status = 'completed' THEN 'completed' ELSE 'generating' END`,
      [uuidv7(), debateId, number, phase],
    );
    const { rows } = await this.db.query<RoundRow>(
      `SELECT id, number, phase, status FROM debate_rounds WHERE debate_id = $1 AND number = $2`,
      [debateId, number],
    );
    return rows[0] as RoundRow;
  }

  async complete(roundId: string): Promise<void> {
    await this.db.query(
      `UPDATE debate_rounds SET status = 'completed', completed_at = now() WHERE id = $1`,
      [roundId],
    );
  }

  async list(debateId: string): Promise<RoundRow[]> {
    const { rows } = await this.db.query<RoundRow>(
      `SELECT id, number, phase, status FROM debate_rounds WHERE debate_id = $1 ORDER BY number`,
      [debateId],
    );
    return rows;
  }

  /** The unfinished round, if generation was interrupted. */
  async findIncomplete(debateId: string): Promise<RoundRow | null> {
    const { rows } = await this.db.query<RoundRow>(
      `SELECT id, number, phase, status FROM debate_rounds WHERE debate_id = $1 AND status <> 'completed' ORDER BY number LIMIT 1`,
      [debateId],
    );
    return rows[0] ?? null;
  }

  async maxNumber(debateId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT COALESCE(max(number), 0)::int AS n FROM debate_rounds WHERE debate_id = $1`,
      [debateId],
    );
    return rows[0]?.n ?? 0;
  }
}
