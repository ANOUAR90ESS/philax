import type { Db } from '@philax/database';
import type { Argument, Citation, DebateMessage, DebateMove, RoundPhase } from '@philax/types';
import { fingerprint } from '@philax/arguments';

export interface NewMessage {
  id: string;
  debateId: string;
  roundId: string;
  roundNumber: number;
  phase: RoundPhase;
  speakerType: 'character' | 'user';
  characterId: string | null;
  move: DebateMove;
  content: string;
  replyToMessageId: string | null;
  addressedCharacterIds: string[];
  turnKey: string;
  validation: Record<string, unknown>;
  argument: Argument | null;
  evidenceIds: string[];
}

interface MessageRow {
  id: string;
  debateId: string;
  roundNumber: number;
  phase: RoundPhase;
  speakerType: 'character' | 'user';
  characterId: string | null;
  move: DebateMove;
  content: string;
  replyToMessageId: string | null;
  addressedCharacterIds: string[];
  createdAt: string;
  turnKey: string;
  argument: (Omit<Argument, 'id'> & { id: string }) | null;
  citations: Citation[] | null;
}

export interface StoredMessage extends DebateMessage {
  turnKey: string;
}

export class MessageRepository {
  constructor(private readonly db: Db) {}

  /** Persists an accepted message with its argument and citations atomically (idempotent per turn key). */
  async insert(m: NewMessage): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const res = await tx.query(
        `INSERT INTO debate_messages (id, debate_id, round_id, round_number, phase, speaker_type, character_id, move, content,
           reply_to_message_id, addressed_character_ids, turn_key, validation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (debate_id, turn_key) DO NOTHING`,
        [
          m.id,
          m.debateId,
          m.roundId,
          m.roundNumber,
          m.phase,
          m.speakerType,
          m.characterId,
          m.move,
          m.content,
          m.replyToMessageId,
          m.addressedCharacterIds,
          m.turnKey,
          JSON.stringify(m.validation),
        ],
      );
      if (res.rowCount === 0) return false;
      if (m.argument) {
        const a = m.argument;
        await tx.query(
          `INSERT INTO arguments (id, debate_id, message_id, character_id, claim, premises, conclusion, assumptions, evidence, objections, source_references, fingerprint)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            a.id,
            m.debateId,
            m.id,
            m.characterId,
            a.claim,
            JSON.stringify(a.premises),
            a.conclusion,
            JSON.stringify(a.assumptions),
            JSON.stringify(a.evidence),
            JSON.stringify(a.objections),
            JSON.stringify(a.sourceReferences),
            fingerprint(`${a.claim} ${a.conclusion}`),
          ],
        );
      }
      for (const evidenceId of m.evidenceIds) {
        await tx.query(
          `INSERT INTO citations (id, message_id, evidence_id) VALUES (gen_random_uuid(), $1, $2) ON CONFLICT DO NOTHING`,
          [m.id, evidenceId],
        );
      }
      return true;
    });
  }

  async list(debateId: string): Promise<StoredMessage[]> {
    const { rows } = await this.db.query<MessageRow>(
      `SELECT m.id, m.debate_id AS "debateId", m.round_number AS "roundNumber", m.phase, m.speaker_type AS "speakerType",
         m.character_id AS "characterId", m.move, m.content, m.reply_to_message_id AS "replyToMessageId",
         m.addressed_character_ids AS "addressedCharacterIds", m.created_at AS "createdAt", m.turn_key AS "turnKey",
         (SELECT json_build_object('id', a.id, 'claim', a.claim, 'premises', a.premises, 'conclusion', a.conclusion,
            'assumptions', a.assumptions, 'evidence', a.evidence, 'objections', a.objections, 'sourceReferences', a.source_references)
          FROM arguments a WHERE a.message_id = m.id) AS argument,
         (SELECT json_agg(json_build_object('evidenceId', e.label, 'sourceId', s.id, 'sourceTitle', s.title, 'author', s.author,
            'locator', c.locator, 'url', s.url, 'sourceType', s.source_type, 'knowledgeKind', c.knowledge_kind) ORDER BY substring(e.label from 2)::int)
          FROM citations ci JOIN evidence e ON e.id = ci.evidence_id JOIN source_chunks c ON c.id = e.chunk_id JOIN sources s ON s.id = c.source_id
          WHERE ci.message_id = m.id) AS citations
       FROM debate_messages m WHERE m.debate_id = $1 ORDER BY m.round_number, m.created_at, m.turn_key`,
      [debateId],
    );
    return rows.map((r) => ({
      id: r.id,
      debateId: r.debateId,
      roundNumber: r.roundNumber,
      phase: r.phase,
      speaker:
        r.speakerType === 'user'
          ? { type: 'user' }
          : { type: 'character', characterId: r.characterId as string },
      move: r.move,
      content: r.content,
      argument: r.argument,
      citations: r.citations ?? [],
      replyToMessageId: r.replyToMessageId,
      addressedCharacterIds: r.addressedCharacterIds,
      createdAt: r.createdAt,
      turnKey: r.turnKey,
    }));
  }
}
