import { toVectorLiteral, type Db, type SqlValue } from '@philax/database';
import type { KnowledgeKind, SourceType } from '@philax/types';
import type { RetrievedChunk } from '../domain/types';

interface Row {
  chunkId: string;
  sourceId: string;
  characterId: string | null;
  content: string;
  knowledgeKind: KnowledgeKind;
  locator: string | null;
  title: string;
  author: string | null;
  url: string | null;
  sourceType: SourceType;
  publishedAt: string | null;
  score: number;
}

const COLUMNS = `c.id AS "chunkId", c.source_id AS "sourceId", c.character_id AS "characterId", c.content,
  c.knowledge_kind AS "knowledgeKind", c.locator, s.title, s.author, s.url, s.source_type AS "sourceType",
  s.published_at AS "publishedAt"`;

/** Visibility: active chunks, seed/curated sources, or the requesting user's own sources. */
const VISIBLE = `c.retired_at IS NULL AND (s.origin <> 'user' OR s.owner_user_id = $1)`;

export interface ChunkFilter {
  userId: string | null;
  characterIds?: string[];
  sourceIds?: string[];
}

function filterSql(f: ChunkFilter, startIdx: number): { sql: string; params: SqlValue[] } {
  const parts: string[] = [];
  const params: SqlValue[] = [];
  let i = startIdx;
  if (f.characterIds?.length) {
    parts.push(`c.character_id = ANY($${i++}::uuid[])`);
    params.push(f.characterIds);
  }
  if (f.sourceIds?.length) {
    parts.push(`c.source_id = ANY($${i++}::uuid[])`);
    params.push(f.sourceIds);
  }
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params };
}

function toChunk(r: Row, method: RetrievedChunk['method']): RetrievedChunk {
  return {
    chunkId: r.chunkId,
    sourceId: r.sourceId,
    characterId: r.characterId,
    content: r.content,
    knowledgeKind: r.knowledgeKind,
    locator: r.locator,
    source: {
      title: r.title,
      author: r.author,
      url: r.url,
      sourceType: r.sourceType,
      publishedAt: r.publishedAt,
    },
    score: Number(r.score),
    method,
  };
}

export class ChunkRepository {
  constructor(private readonly db: Db) {}

  async lexicalSearch(
    orQuery: string,
    filter: ChunkFilter,
    limit: number,
  ): Promise<RetrievedChunk[]> {
    if (!orQuery.trim()) return [];
    const f = filterSql(filter, 4);
    const { rows } = await this.db.query<Row>(
      `WITH q AS (SELECT websearch_to_tsquery('english', $2) || websearch_to_tsquery('simple', $2) AS query)
       SELECT ${COLUMNS}, ts_rank_cd(c.tsv, q.query) AS score
       FROM source_chunks c JOIN sources s ON s.id = c.source_id, q
       WHERE ${VISIBLE} AND c.tsv @@ q.query ${f.sql}
       ORDER BY score DESC, c.id
       LIMIT $3`,
      [filter.userId, orQuery, limit, ...f.params],
    );
    return rows.map((r) => toChunk(r, 'lexical'));
  }

  async vectorSearch(
    vector: number[],
    model: string,
    filter: ChunkFilter,
    limit: number,
  ): Promise<RetrievedChunk[]> {
    const f = filterSql(filter, 5);
    const { rows } = await this.db.query<Row>(
      `SELECT ${COLUMNS}, 1 - (e.embedding <=> $2::vector) AS score
       FROM embeddings e JOIN source_chunks c ON c.id = e.chunk_id JOIN sources s ON s.id = c.source_id
       WHERE ${VISIBLE} AND e.model = $3 ${f.sql}
       ORDER BY e.embedding <=> $2::vector
       LIMIT $4`,
      [filter.userId, toVectorLiteral(vector), model, limit, ...f.params],
    );
    return rows.map((r) => toChunk(r, 'vector'));
  }

  /** All active documented knowledge for given characters (fallback when search finds little). */
  async characterKnowledge(
    characterIds: string[],
    kinds: KnowledgeKind[],
    limitPerCharacter: number,
  ): Promise<RetrievedChunk[]> {
    const { rows } = await this.db.query<Row>(
      `SELECT * FROM (
         SELECT ${COLUMNS}, 0::float AS score,
           row_number() OVER (PARTITION BY c.character_id ORDER BY c.knowledge_kind, c.ordinal) AS rn
         FROM source_chunks c JOIN sources s ON s.id = c.source_id
         WHERE c.retired_at IS NULL AND s.origin <> 'user' AND c.character_id = ANY($1::uuid[])
           AND c.knowledge_kind = ANY($2::text[])
       ) t WHERE rn <= $3`,
      [characterIds, kinds, limitPerCharacter],
    );
    return rows.map((r) => toChunk(r, 'direct'));
  }

  /** First chunks of one source in reading order (visibility-checked). */
  async bySource(
    sourceId: string,
    userId: string | null,
    limit: number,
  ): Promise<RetrievedChunk[]> {
    const { rows } = await this.db.query<Row>(
      `SELECT ${COLUMNS}, 0::float AS score FROM source_chunks c JOIN sources s ON s.id = c.source_id
       WHERE ${VISIBLE} AND c.source_id = $2 ORDER BY c.ordinal LIMIT $3`,
      [userId, sourceId, limit],
    );
    return rows.map((r) => toChunk(r, 'direct'));
  }

  async findByIds(ids: string[], userId: string | null): Promise<RetrievedChunk[]> {
    if (ids.length === 0) return [];
    const { rows } = await this.db.query<Row>(
      `SELECT ${COLUMNS}, 0::float AS score FROM source_chunks c JOIN sources s ON s.id = c.source_id
       WHERE (s.origin <> 'user' OR s.owner_user_id = $1) AND c.id = ANY($2::uuid[])`,
      [userId, ids],
    );
    return rows.map((r) => toChunk(r, 'direct'));
  }

  async chunksMissingEmbedding(
    model: string,
    limit: number,
  ): Promise<{ id: string; content: string }[]> {
    const { rows } = await this.db.query<{ id: string; content: string }>(
      `SELECT c.id, c.content FROM source_chunks c
       WHERE c.retired_at IS NULL AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.chunk_id = c.id AND e.model = $1)
       ORDER BY c.id LIMIT $2`,
      [model, limit],
    );
    return rows;
  }

  async insertEmbedding(
    id: string,
    chunkId: string,
    model: string,
    vector: number[],
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO embeddings (id, chunk_id, model, embedding) VALUES ($1, $2, $3, $4::vector)
       ON CONFLICT (chunk_id, model) DO UPDATE SET embedding = EXCLUDED.embedding, created_at = now()`,
      [id, chunkId, model, toVectorLiteral(vector)],
    );
  }
}
