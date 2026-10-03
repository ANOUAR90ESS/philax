import type { Db } from '@philax/database';
import type { NormalizedInput, UserInput } from '@philax/types';
import { chunkText } from '../domain/chunker';
import { detectLanguage, ftsConfigFor } from '../domain/language';
import { classifyText } from '../domain/classify';
import type { ContentExtractor } from '../extractors/content-extractor';
import { UserSourceRepository } from '../repositories/user-source-repository';

export interface IngestedInput {
  normalized: NormalizedInput;
  sourceId: string;
}

/**
 * Input engine (§5–6): turns any UserInput into a NormalizedInput and stores the
 * content as a private, chunked user-provided source so debates can cite it.
 */
export class InputService {
  private readonly sources: UserSourceRepository;

  constructor(
    db: Db,
    private readonly extractor: ContentExtractor,
  ) {
    this.sources = new UserSourceRepository(db);
  }

  async normalize(input: UserInput): Promise<NormalizedInput> {
    if (input.type === 'text') {
      return {
        rawContent: input.content,
        language: detectLanguage(input.content),
        contentType: classifyText(input.content),
      };
    }
    const doc = await this.extractor.extract(input.url);
    return {
      title: doc.title ?? undefined,
      rawContent: doc.content,
      sourceUrl: doc.url,
      language: doc.language?.slice(0, 2).toLowerCase() || detectLanguage(doc.content),
      contentType: 'web_article',
      author: doc.author ?? undefined,
      publisher: doc.publisher ?? undefined,
      publishedAt: doc.publishedAt ?? undefined,
    };
  }

  async ingest(userId: string, input: UserInput): Promise<IngestedInput> {
    const normalized = await this.normalize(input);
    const sourceId = await this.sources.create({
      ownerUserId: userId,
      title:
        normalized.title ??
        (normalized.contentType === 'web_article'
          ? (normalized.sourceUrl ?? 'Web page')
          : 'Your input'),
      author: normalized.author ?? null,
      publisher: normalized.publisher ?? null,
      url: normalized.sourceUrl ?? null,
      publishedAt: normalized.publishedAt ?? null,
      language: normalized.language,
      ftsConfig: ftsConfigFor(normalized.language),
      chunks: chunkText(normalized.rawContent),
    });
    return { normalized, sourceId };
  }

  deleteSource(sourceId: string, userId: string): Promise<void> {
    return this.sources.deleteOwned(sourceId, userId);
  }
}
