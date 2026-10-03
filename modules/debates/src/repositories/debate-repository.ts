import { uuidv7, type Db } from '@philax/database';
import type {
  ChallengeFraming,
  DebateListItem,
  DebateMode,
  DebatePhase,
  Synthesis,
} from '@philax/types';
import type { DebateMemory } from '../domain/memory';
import { normalizeMemory } from '../domain/memory';
import type { DebatePlan } from '../domain/plan';

export interface DebateRecord {
  id: string;
  userId: string;
  topicId: string;
  mode: DebateMode;
  phase: DebatePhase;
  language: string;
  currentRound: number;
  plan: DebatePlan | null;
  memory: DebateMemory;
  challenge: ChallengeFraming | null;
  synthesis: Synthesis | null;
  errorCode: string | null;
  createdAt: string;
  saved: boolean;
}

const SELECT = `SELECT d.id, d.user_id AS "userId", d.topic_id AS "topicId", d.mode, d.phase, d.language,
  d.current_round AS "currentRound", d.plan, d.memory, d.challenge, d.synthesis, d.error_code AS "errorCode",
  d.created_at AS "createdAt", EXISTS (SELECT 1 FROM saved_debates s WHERE s.debate_id = d.id AND s.user_id = d.user_id) AS saved
  FROM debates d`;

export class DebateRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    userId: string;
    topicId: string;
    mode: DebateMode;
    language: string;
  }): Promise<string> {
    const id = uuidv7();
    await this.db.query(
      `INSERT INTO debates (id, user_id, topic_id, mode, phase, language) VALUES ($1, $2, $3, $4, 'DEBATE_CREATED', $5)`,
      [id, input.userId, input.topicId, input.mode, input.language],
    );
    return id;
  }

  async get(id: string): Promise<DebateRecord | null> {
    const { rows } = await this.db.query<DebateRecord>(`${SELECT} WHERE d.id = $1`, [id]);
    const r = rows[0];
    return r ? { ...r, memory: normalizeMemory(r.memory) } : null;
  }

  async listByUser(userId: string, limit = 50): Promise<DebateListItem[]> {
    const { rows } = await this.db.query<DebateListItem>(
      `SELECT d.id, d.mode, COALESCE(t.title, t.input_preview) AS title, d.phase, d.created_at AS "createdAt",
         EXISTS (SELECT 1 FROM saved_debates s WHERE s.debate_id = d.id AND s.user_id = d.user_id) AS saved
       FROM debates d JOIN topics t ON t.id = d.topic_id WHERE d.user_id = $1 ORDER BY d.created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows;
  }

  async setPhase(
    id: string,
    phase: DebatePhase,
    extra: { currentRound?: number; errorCode?: string | null } = {},
  ): Promise<void> {
    await this.db.query(
      `UPDATE debates SET phase = $2, current_round = COALESCE($3, current_round), error_code = $4,
         completed_at = CASE WHEN $2 = 'COMPLETED' THEN now() ELSE completed_at END, updated_at = now() WHERE id = $1`,
      [id, phase, extra.currentRound ?? null, extra.errorCode ?? null],
    );
  }

  async setLanguage(id: string, language: string): Promise<void> {
    await this.db.query(`UPDATE debates SET language = $2, updated_at = now() WHERE id = $1`, [
      id,
      language,
    ]);
  }

  async setPlan(id: string, plan: DebatePlan): Promise<void> {
    await this.db.query(`UPDATE debates SET plan = $2, updated_at = now() WHERE id = $1`, [
      id,
      JSON.stringify(plan),
    ]);
  }

  async setMemory(id: string, memory: DebateMemory): Promise<void> {
    await this.db.query(`UPDATE debates SET memory = $2, updated_at = now() WHERE id = $1`, [
      id,
      JSON.stringify(memory),
    ]);
  }

  async setChallenge(id: string, challenge: ChallengeFraming): Promise<void> {
    await this.db.query(`UPDATE debates SET challenge = $2, updated_at = now() WHERE id = $1`, [
      id,
      JSON.stringify(challenge),
    ]);
  }

  async setSynthesis(id: string, synthesis: Synthesis): Promise<void> {
    await this.db.query(`UPDATE debates SET synthesis = $2, updated_at = now() WHERE id = $1`, [
      id,
      JSON.stringify(synthesis),
    ]);
  }

  async setSaved(id: string, userId: string, saved: boolean): Promise<void> {
    if (saved) {
      await this.db.query(
        `INSERT INTO saved_debates (user_id, debate_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, id],
      );
    } else {
      await this.db.query(`DELETE FROM saved_debates WHERE user_id = $1 AND debate_id = $2`, [
        userId,
        id,
      ]);
    }
  }
}
