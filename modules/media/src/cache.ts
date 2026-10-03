import { createHash } from 'node:crypto';

/**
 * Bounded in-memory cache (LRU by insertion/access order, with TTL and a size
 * budget). Holds generated media only — never credentials or request headers.
 */
export class MediaCache<V> {
  private readonly entries = new Map<string, { value: V; size: number; expires: number }>();
  private bytes = 0;

  constructor(
    private readonly opts: {
      maxBytes: number;
      ttlMs: number;
      sizeOf: (value: V) => number;
      now?: () => number;
    },
  ) {}

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expires <= this.now()) {
      this.bytes -= entry.size;
      return undefined;
    }
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    const size = this.opts.sizeOf(value);
    const existing = this.entries.get(key);
    if (existing) {
      this.bytes -= existing.size;
      this.entries.delete(key);
    }
    if (size > this.opts.maxBytes) return;
    this.entries.set(key, { value, size, expires: this.now() + this.opts.ttlMs });
    this.bytes += size;
    for (const [k, e] of this.entries) {
      if (this.bytes <= this.opts.maxBytes) break;
      this.entries.delete(k);
      this.bytes -= e.size;
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Stable cache key: a hash, so cached text never appears in keys or logs. */
export function cacheKey(parts: readonly (string | number)[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
