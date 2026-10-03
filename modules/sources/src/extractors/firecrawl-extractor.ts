import { AppError, type ExtractedDocument } from '@philax/types';
import { assertPublicUrl, systemResolver, type Resolver } from '../domain/url-safety';
import {
  MAX_EXTRACTED_CHARS,
  MIN_EXTRACTED_CHARS,
  type ContentExtractor,
} from './content-extractor';

interface FirecrawlResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      author?: string;
      language?: string;
      publishedTime?: string;
      ogSiteName?: string;
      sourceURL?: string;
    };
  };
}

/** Strips Markdown syntax that adds noise to analysis while keeping paragraphs. */
export function markdownToText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]{1,3}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Firecrawl scrape API. All Firecrawl specifics stay in this file (§6). */
export class FirecrawlExtractor implements ContentExtractor {
  readonly name = 'firecrawl';

  constructor(
    private readonly apiKey: string,
    private readonly resolve: Resolver = systemResolver,
    private readonly baseUrl = 'https://api.firecrawl.dev/v1',
  ) {}

  async extract(url: string): Promise<ExtractedDocument> {
    await assertPublicUrl(url, this.resolve);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/scrape`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      throw new AppError('EXTRACTION_FAILED', 'The page could not be downloaded.', { cause: err });
    }
    if (!res.ok)
      throw new AppError('EXTRACTION_FAILED', 'The page could not be read.', {
        cause: new Error(`firecrawl ${res.status}`),
      });
    const json = (await res.json()) as FirecrawlResponse;
    const content = markdownToText(json.data?.markdown ?? '').slice(0, MAX_EXTRACTED_CHARS);
    if (!json.success || content.length < MIN_EXTRACTED_CHARS) {
      throw new AppError(
        'EXTRACTION_FAILED',
        'We could not find readable article text on that page.',
      );
    }
    const m = json.data?.metadata ?? {};
    return {
      url: m.sourceURL ?? url,
      title: m.title ?? null,
      author: m.author ?? null,
      publishedAt: m.publishedTime ?? null,
      publisher: m.ogSiteName ?? null,
      content,
      language: m.language ?? null,
    };
  }
}
