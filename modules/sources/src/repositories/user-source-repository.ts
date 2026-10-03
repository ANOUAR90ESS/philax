import { uuidv7, type Db } from '@philax/database';
import { createHash } from 'node:crypto';

export interface NewUserSource {
  ownerUserId: string;
  title: string;
  author: string | null;
  publisher: string | null;
  url: string | null;
  publishedAt: string | null;
  language: string;
  ftsConfig: string;
  chunks: string[];
}

export class UserSourceRepository {
  constructor(private readonly db: Db) {}

  /** Stores a private user-provided source and its chunks; returns the source id. */
  async create(s: NewUserSource): Promise<string> {
    const id = uuidv7();
    const hash = createHash('sha256').update(s.chunks.join('\n\n')).digest('hex');
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO sources (id, title, author, publisher, url, published_at, source_type, language, origin, owner_user_id, content_hash)
         VALUES ($1, $2, $3, $4, $5, $6, 'user-provided', $7, 'user', $8, $9)`,
        [id, s.title, s.author, s.publisher, s.url, s.publishedAt, s.language, s.ownerUserId, hash],
      );
      for (const [i, content] of s.chunks.entries()) {
        await tx.query(
          `INSERT INTO source_chunks (id, source_id, ordinal, content, knowledge_kind, locator, fts_config)
           VALUES ($1, $2, $3, $4, 'user_content', $5, $6::regconfig)`,
          [uuidv7(), id, i, content, `part ${i + 1}`, s.ftsConfig],
        );
      }
    });
    return id;
  }

  async deleteOwned(sourceId: string, ownerUserId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM sources WHERE id = $1 AND owner_user_id = $2 AND origin = 'user'`,
      [sourceId, ownerUserId],
    );
  }
}
