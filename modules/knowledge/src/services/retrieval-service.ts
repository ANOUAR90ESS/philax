import type { EmbeddingProvider } from '@philax/ai';
import type { Db } from '@philax/database';
import { extractKeywords, reciprocalRankFusion, toOrQuery } from '../domain/fusion';
import type { RetrievalQuery, RetrievalTrace, RetrievedChunk } from '../domain/types';
import { ChunkRepository } from '../repositories/chunk-repository';

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  trace: RetrievalTrace;
}

/**
 * Knowledge retrieval layer (§15): query understanding (keywords) → lexical
 * full-text search, plus vector search when an embedding model is configured →
 * Reciprocal Rank Fusion → metadata-filtered top-k.
 */
export class RetrievalService {
  private readonly chunks: ChunkRepository;

  constructor(
    db: Db,
    private readonly embeddings: EmbeddingProvider | null,
    private readonly onEmbeddingError: (err: unknown) => void = () => undefined,
  ) {
    this.chunks = new ChunkRepository(db);
  }

  get vectorEnabled(): boolean {
    return this.embeddings !== null;
  }

  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    const limit = query.limit ?? 8;
    const candidates = limit * 3;
    const filter = {
      userId: query.userId ?? null,
      characterIds: query.characterIds,
      sourceIds: query.sourceIds,
    };
    const keywords = query.keywords?.length ? query.keywords : extractKeywords(query.text);

    const lexicalP = this.chunks.lexicalSearch(toOrQuery(keywords), filter, candidates);
    const vectorP = this.embeddings
      ? this.embeddings
          .embed(query.text)
          .then((v) =>
            this.chunks.vectorSearch(
              v,
              (this.embeddings as EmbeddingProvider).model,
              filter,
              candidates,
            ),
          )
          .catch((err: unknown) => {
            // Degrade to lexical-only rather than failing the debate; the trace records it.
            this.onEmbeddingError(err);
            return [] as RetrievedChunk[];
          })
      : Promise.resolve([] as RetrievedChunk[]);
    const [lexical, vector] = await Promise.all([lexicalP, vectorP]);

    const byId = new Map<string, RetrievedChunk>();
    for (const c of [...lexical, ...vector]) if (!byId.has(c.chunkId)) byId.set(c.chunkId, c);
    const fused = reciprocalRankFusion([
      lexical.map((c) => c.chunkId),
      vector.map((c) => c.chunkId),
    ]);
    const inLexical = new Set(lexical.map((c) => c.chunkId));
    const inVector = new Set(vector.map((c) => c.chunkId));

    const ranked = [...fused.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([id, score]) => {
        const c = byId.get(id) as RetrievedChunk;
        const method =
          inLexical.has(id) && inVector.has(id)
            ? 'hybrid'
            : inVector.has(id)
              ? 'vector'
              : 'lexical';
        return { ...c, score, method } as RetrievedChunk;
      });

    return {
      chunks: ranked,
      trace: {
        lexicalHits: lexical.length,
        vectorHits: vector.length,
        vectorEnabled: this.embeddings !== null,
        embeddingModel: this.embeddings?.model ?? null,
      },
    };
  }

  /**
   * Evidence for one character: retrieved chunks about the topic, topped up with the
   * character's documented positions/concepts so every participant is grounded.
   */
  async retrieveForCharacter(
    characterId: string,
    query: RetrievalQuery,
    minimum = 4,
  ): Promise<RetrievalResult> {
    const result = await this.retrieve({ ...query, characterIds: [characterId] });
    if (result.chunks.length >= minimum) return result;
    const seen = new Set(result.chunks.map((c) => c.chunkId));
    const extra = (
      await this.chunks.characterKnowledge(
        [characterId],
        ['documented_position', 'concept'],
        minimum * 2,
      )
    ).filter((c) => !seen.has(c.chunkId));
    return {
      ...result,
      chunks: [...result.chunks, ...extra.slice(0, minimum - result.chunks.length)],
    };
  }

  findByIds(ids: string[], userId: string | null): Promise<RetrievedChunk[]> {
    return this.chunks.findByIds(ids, userId);
  }
}
