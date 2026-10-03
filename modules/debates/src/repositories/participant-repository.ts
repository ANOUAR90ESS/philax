import { uuidv7, type Db } from '@philax/database';
import type { DebateParticipant, ParticipantRole } from '@philax/types';

export interface ParticipantRow {
  characterId: string;
  role: ParticipantRole;
  seat: number;
  perspectiveId: string | null;
  perspectiveSlug: string;
  perspectiveLabel: string;
  selectionReason: string;
}

export class ParticipantRepository {
  constructor(private readonly db: Db) {}

  async replaceAll(
    debateId: string,
    rows: {
      characterId: string;
      perspectiveId: string | null;
      role: ParticipantRole;
      seat: number;
      selectionReason: string;
      score: number;
    }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(`DELETE FROM debate_participants WHERE debate_id = $1`, [debateId]);
      for (const r of rows) {
        await tx.query(
          `INSERT INTO debate_participants (id, debate_id, character_id, perspective_id, role, seat, selection_reason, selection_score)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            uuidv7(),
            debateId,
            r.characterId,
            r.perspectiveId,
            r.role,
            r.seat,
            r.selectionReason,
            r.score,
          ],
        );
      }
    });
  }

  async list(debateId: string): Promise<ParticipantRow[]> {
    const { rows } = await this.db.query<ParticipantRow>(
      `SELECT dp.character_id AS "characterId", dp.role, dp.seat, dp.perspective_id AS "perspectiveId",
         COALESCE(p.slug, '') AS "perspectiveSlug", COALESCE(p.label, '') AS "perspectiveLabel", dp.selection_reason AS "selectionReason"
       FROM debate_participants dp LEFT JOIN perspectives p ON p.id = dp.perspective_id
       WHERE dp.debate_id = $1 ORDER BY dp.seat`,
      [debateId],
    );
    return rows;
  }

  async listForView(debateId: string): Promise<DebateParticipant[]> {
    const { rows } = await this.db.query<DebateParticipant & { [k: string]: unknown }>(
      `SELECT json_build_object('id', c.id, 'slug', c.slug, 'displayName', c.display_name, 'type', c.type,
           'birthYear', c.birth_year, 'deathYear', c.death_year, 'era', c.era, 'representation', c.representation,
           'worldviewSummary', c.worldview_summary) AS character,
         dp.role, json_build_object('slug', COALESCE(p.slug, ''), 'label', COALESCE(p.label, '')) AS perspective,
         dp.selection_reason AS "selectionReason", dp.seat
       FROM debate_participants dp JOIN characters c ON c.id = dp.character_id LEFT JOIN perspectives p ON p.id = dp.perspective_id
       WHERE dp.debate_id = $1 ORDER BY dp.seat`,
      [debateId],
    );
    return rows;
  }
}
