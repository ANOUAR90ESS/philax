/** Embedding dimensionality fixed by the database schema (VECTOR(1536)). */
export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingProvider {
  /** Stored with each vector so vectors from different models are never compared. */
  readonly model: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
