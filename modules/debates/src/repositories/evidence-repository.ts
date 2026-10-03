import { uuidv7, type Db } from '@philax/database';
import type { RetrievedChunk } from '@philax/knowledge';
import type { Citation, KnowledgeKind, SourceType } from '@philax/types';

export interface EvidenceItem {
  id: string;
  label: string;
  chunkId: string;
  characterId: string | null;
  content: string;
  knowledgeKind: KnowledgeKind;
  locator: string | null;
  source: {
    id: string;
    title: string;
    author: string | null;
    url: string | null;
    sourceType: SourceType;
    publishedAt: string | null;
  };
}

export function toCitation(e: EvidenceItem): Citation {
  return {
    evidenceId: e.label,
    sourceId: e.source.id,
    sourceTitle: e.source.title,
    author: e.source.author,
    locator: e.locator,
    url: e.source.url,
    sourceType: e.source.sourceType,
    knowledgeKind: e.knowledgeKind,
  };
}

/** Human-readable bibliographic tag used inside prompts. */
export function citationTag(e: EvidenceItem): string {
  const who = e.source.author ? `${e.source.author}, ` : '';
  const year = e.source.publishedAt ? ` (${e.source.publishedAt})` : '';
  return `${who}${e.source.title}${year}${e.locator ? `, ${e.locator}` : ''}`;
}

export class EvidenceRepository {
  constructor(private readonly db: Db) {}

  /**
   * Adds chunks to the debate's evidence pool with stable labels E1, E2, … .
   * Chunks already in the pool keep their label.
   */
  async addToPool(
    debateId: string,
    chunks: { chunk: RetrievedChunk; forCharacterId: string | null }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`evidence:${debateId}`]);
      const { rows } = await tx.query<{ n: number }>(
        `SELECT COALESCE(max(substring(label from 2)::int), 0)::int AS n FROM evidence WHERE debate_id = $1`,
        [debateId],
      );
      let next = (rows[0]?.n ?? 0) + 1;
      for (const { chunk, forCharacterId } of chunks) {
        const res = await tx.query(
          `INSERT INTO evidence (id, debate_id, chunk_id, character_id, label, retrieval_score, retrieval_method)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (debate_id, chunk_id) DO NOTHING`,
          [
            uuidv7(),
            debateId,
            chunk.chunkId,
            forCharacterId,
            `E${next}`,
            chunk.score,
            chunk.method,
          ],
        );
        if (res.rowCount > 0) next++;
      }
    });
  }

  async list(debateId: string): Promise<EvidenceItem[]> {
    const { rows } = await this.db.query<
      Omit<EvidenceItem, 'source'> & {
        sourceId: string;
        title: string;
        author: string | null;
        url: string | null;
        sourceType: SourceType;
        publishedAt: string | null;
      }
    >(
      `SELECT e.id, e.label, e.chunk_id AS "chunkId", e.character_id AS "characterId", c.content, c.knowledge_kind AS "knowledgeKind",
         c.locator, s.id AS "sourceId", s.title, s.author, s.url, s.source_type AS "sourceType", s.published_at AS "publishedAt"
       FROM evidence e JOIN source_chunks c ON c.id = e.chunk_id JOIN sources s ON s.id = c.source_id
       WHERE e.debate_id = $1 ORDER BY substring(e.label from 2)::int`,
      [debateId],
    );
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      chunkId: r.chunkId,
      characterId: r.characterId,
      content: r.content,
      knowledgeKind: r.knowledgeKind,
      locator: r.locator,
      source: {
        id: r.sourceId,
        title: r.title,
        author: r.author,
        url: r.url,
        sourceType: r.sourceType,
        publishedAt: r.publishedAt,
      },
    }));
  }
}
