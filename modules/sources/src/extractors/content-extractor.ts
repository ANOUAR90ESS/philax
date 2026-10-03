import type { ExtractedDocument } from '@philax/types';

/** Abstraction over URL → readable document (§6). Swap implementations freely. */
export interface ContentExtractor {
  readonly name: string;
  extract(url: string): Promise<ExtractedDocument>;
}

export const MIN_EXTRACTED_CHARS = 200;
export const MAX_EXTRACTED_CHARS = 60_000;
