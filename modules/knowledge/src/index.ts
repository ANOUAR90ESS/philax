export { RetrievalService } from './services/retrieval-service';
export type { RetrievalResult } from './services/retrieval-service';
export { indexMissingEmbeddings } from './services/indexer';
export { extractKeywords, reciprocalRankFusion, toOrQuery } from './domain/fusion';
export type {
  RetrievalMethod,
  RetrievalQuery,
  RetrievalTrace,
  RetrievedChunk,
} from './domain/types';
