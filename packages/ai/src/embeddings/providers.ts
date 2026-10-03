import { postJson } from '../providers/http';
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from './types';

const TIMEOUT_MS = 30_000;

function assertDims(vectors: number[][], provider: string): number[][] {
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `${provider} returned ${v.length}-dim embedding, expected ${EMBEDDING_DIMENSIONS}`,
      );
    }
  }
  return vectors;
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = EMBEDDING_DIMENSIONS;
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    modelName = 'text-embedding-3-small',
  ) {
    this.model = `openai:${modelName}`;
    this.modelName = modelName;
  }

  private readonly modelName: string;

  async embed(text: string): Promise<number[]> {
    const [v] = await this.embedBatch([text]);
    return v as number[];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await postJson(
      'openai',
      'https://api.openai.com/v1/embeddings',
      { authorization: `Bearer ${this.apiKey}` },
      { model: this.modelName, input: texts, dimensions: EMBEDDING_DIMENSIONS },
      AbortSignal.timeout(TIMEOUT_MS),
    );
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    const sorted = [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    return assertDims(sorted, 'openai');
  }
}

export class GoogleEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = EMBEDDING_DIMENSIONS;
  readonly model: string;
  private readonly modelName: string;

  constructor(
    private readonly apiKey: string,
    modelName = 'gemini-embedding-001',
  ) {
    this.model = `google:${modelName}`;
    this.modelName = modelName;
  }

  async embed(text: string): Promise<number[]> {
    const [v] = await this.embedBatch([text]);
    return v as number[];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await postJson(
      'google',
      `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:batchEmbedContents`,
      { 'x-goog-api-key': this.apiKey },
      {
        requests: texts.map((t) => ({
          model: `models/${this.modelName}`,
          content: { parts: [{ text: t }] },
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      },
      AbortSignal.timeout(TIMEOUT_MS),
    );
    const json = (await res.json()) as { embeddings: { values: number[] }[] };
    // Truncated-dimension Gemini embeddings must be re-normalized for cosine use.
    return assertDims(
      json.embeddings.map((e) => normalize(e.values)),
      'google',
    );
  }
}
