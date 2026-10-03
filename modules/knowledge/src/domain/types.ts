import type { KnowledgeKind, SourceType } from '@philax/types';

export type RetrievalMethod = 'lexical' | 'vector' | 'hybrid' | 'direct';

export interface RetrievedChunk {
  chunkId: string;
  sourceId: string;
  characterId: string | null;
  content: string;
  knowledgeKind: KnowledgeKind;
  locator: string | null;
  source: {
    title: string;
    author: string | null;
    url: string | null;
    sourceType: SourceType;
    publishedAt: string | null;
  };
  score: number;
  method: RetrievalMethod;
}

export interface RetrievalQuery {
  /** Natural-language query (embedded when vectors are available). */
  text: string;
  /** Keywords for lexical search; defaults to terms extracted from `text`. */
  keywords?: string[];
  characterIds?: string[];
  sourceIds?: string[];
  /** Exclude user-provided sources not owned by this user (always enforced). */
  userId?: string | null;
  limit?: number;
}

export interface RetrievalTrace {
  lexicalHits: number;
  vectorHits: number;
  vectorEnabled: boolean;
  embeddingModel: string | null;
}
