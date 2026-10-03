import { uuidv7, type Db } from '@philax/database';
import type { Claim, NormalizedInput, TopicAnalysis, UserInput } from '@philax/types';

export interface TopicRecord {
  id: string;
  userId: string;
  inputType: 'text' | 'url';
  inputPreview: string;
  inputText: string | null;
  inputUrl: string | null;
  sourceId: string | null;
  analysis: TopicAnalysis | null;
  contentType: string | null;
  language: string | null;
}

export function previewOf(input: UserInput): string {
  const raw = input.type === 'text' ? input.content : input.url;
  return raw.length > 280 ? `${raw.slice(0, 277)}…` : raw;
}

export class TopicRepository {
  constructor(private readonly db: Db) {}

  async create(userId: string, input: UserInput): Promise<string> {
    const id = uuidv7();
    await this.db.query(
      `INSERT INTO topics (id, user_id, input_type, input_preview, input_text, input_url) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        userId,
        input.type,
        previewOf(input),
        input.type === 'text' ? input.content : null,
        input.type === 'url' ? input.url : null,
      ],
    );
    return id;
  }

  async get(id: string): Promise<TopicRecord | null> {
    const { rows } = await this.db.query<TopicRecord>(
      `SELECT id, user_id AS "userId", input_type AS "inputType", input_preview AS "inputPreview", input_text AS "inputText",
         input_url AS "inputUrl", source_id AS "sourceId", analysis, content_type AS "contentType", language
       FROM topics WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async attachSource(id: string, sourceId: string, normalized: NormalizedInput): Promise<void> {
    await this.db.query(
      `UPDATE topics SET source_id = $2, content_type = $3, language = $4 WHERE id = $1`,
      [id, sourceId, normalized.contentType, normalized.language],
    );
  }

  async saveAnalysis(id: string, analysis: TopicAnalysis, promptVersion: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(
        `UPDATE topics SET title = $2, summary = $3, language = $4, domains = $5, concepts = $6, retrieval_keywords = $7,
           analysis = $8, prompt_version = $9 WHERE id = $1`,
        [
          id,
          analysis.title,
          analysis.summary,
          analysis.language,
          analysis.domains,
          analysis.concepts,
          analysis.retrievalKeywords,
          JSON.stringify(analysis),
          promptVersion,
        ],
      );
      await tx.query(`DELETE FROM claims WHERE topic_id = $1`, [id]);
      for (const c of analysis.claims) await insertClaim(tx, id, c);
    });
  }
}

async function insertClaim(db: Db, topicId: string, c: Claim): Promise<void> {
  await db.query(
    `INSERT INTO claims (id, topic_id, local_id, kind, text, related_ids) VALUES ($1, $2, $3, $4, $5, $6)`,
    [uuidv7(), topicId, c.id, c.kind, c.text, c.relatedClaimIds],
  );
}
