import type { EmbeddingProvider } from '@philax/ai';
import { uuidv7, type Db } from '@philax/database';
import { ChunkRepository } from '../repositories/chunk-repository';

/** Embeds every active chunk that has no vector for the configured model yet. */
export async function indexMissingEmbeddings(
  db: Db,
  embeddings: EmbeddingProvider,
  options: { batchSize?: number; onProgress?: (done: number) => void } = {},
): Promise<number> {
  const repo = new ChunkRepository(db);
  const batchSize = options.batchSize ?? 64;
  let done = 0;
  for (;;) {
    const batch = await repo.chunksMissingEmbedding(embeddings.model, batchSize);
    if (batch.length === 0) return done;
    const vectors = await embeddings.embedBatch(batch.map((c) => c.content));
    for (const [i, c] of batch.entries()) {
      await repo.insertEmbedding(uuidv7(), c.id, embeddings.model, vectors[i] as number[]);
    }
    done += batch.length;
    options.onProgress?.(done);
  }
}
