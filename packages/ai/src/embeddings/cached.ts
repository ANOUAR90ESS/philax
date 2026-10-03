import { createHash } from 'node:crypto';
import type { EmbeddingProvider } from './types';

/**
 * In-process LRU cache for embeddings (§56). Keys are content hashes, so cached
 * entries reveal nothing without the original text; the cache never leaves memory.
 */
export class CachedEmbeddingProvider implements EmbeddingProvider {
  private readonly cache = new Map<string, number[]>();

  constructor(
    private readonly inner: EmbeddingProvider,
    private readonly maxEntries = 2000,
  ) {}

  get model() {
    return this.inner.model;
  }
  get dimensions() {
    return this.inner.dimensions;
  }

  private key(text: string) {
    return createHash('sha256').update(text).digest('hex');
  }

  private remember(key: string, v: number[]) {
    this.cache.delete(key);
    this.cache.set(key, v);
    if (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  async embed(text: string): Promise<number[]> {
    const [v] = await this.embedBatch([text]);
    return v as number[];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const keys = texts.map((t) => this.key(t));
    const missing: number[] = [];
    keys.forEach((k, i) => {
      if (!this.cache.has(k)) missing.push(i);
    });
    if (missing.length) {
      const fresh = await this.inner.embedBatch(missing.map((i) => texts[i] as string));
      missing.forEach((i, j) => this.remember(keys[i] as string, fresh[j] as number[]));
    }
    return keys.map((k) => {
      const v = this.cache.get(k) as number[];
      this.remember(k, v);
      return v;
    });
  }
}
