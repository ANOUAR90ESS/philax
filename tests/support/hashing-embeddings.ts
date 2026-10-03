import { createHash } from 'node:crypto';
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from '@philax/ai';
import { extractKeywords } from '@philax/knowledge';

/**
 * TEST DOUBLE ONLY (ADR-013). Deterministic feature-hashing bag-of-words vectors:
 * texts sharing words get similar vectors. Exercises the pgvector code path
 * without a paid API; it is not a semantic embedding model.
 */
export class HashingEmbeddingProvider implements EmbeddingProvider {
  readonly model = 'test:hashing-bow';
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    for (const word of extractKeywords(text, 200)) {
      const h = createHash('md5').update(word).digest();
      const idx = h.readUInt32BE(0) % EMBEDDING_DIMENSIONS;
      v[idx] = (v[idx] ?? 0) + ((h[4] ?? 0) % 2 === 0 ? 1 : -1);
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }

  embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
