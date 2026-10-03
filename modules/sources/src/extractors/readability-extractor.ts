import { Readability } from '@mozilla/readability';
import { AppError, type ExtractedDocument } from '@philax/types';
import { parseHTML } from 'linkedom';
import { safeFetch, type SafeFetchOptions } from '../domain/safe-fetch';
import {
  MAX_EXTRACTED_CHARS,
  MIN_EXTRACTED_CHARS,
  type ContentExtractor,
} from './content-extractor';

type HtmlDocument = ReturnType<typeof parseHTML>['document'];

const BLOCKS = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, figcaption, td';

function meta(document: HtmlDocument, ...names: string[]): string | null {
  for (const name of names) {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    const v = el?.getAttribute('content')?.trim();
    if (v) return v;
  }
  return null;
}

/** Turns article HTML into plain text with paragraph breaks preserved. */
export function htmlToText(html: string): string {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const blocks = [...document.querySelectorAll(BLOCKS)]
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (blocks.length) return blocks.join('\n\n');
  return (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Parses an HTML page into an ExtractedDocument (pure; used by tests and the extractor). */
export function extractFromHtml(html: string, url: string): ExtractedDocument {
  const { document } = parseHTML(html);
  const lang = document.documentElement?.getAttribute('lang') ?? null;
  const metaInfo = {
    publishedAt: meta(document, 'article:published_time', 'datePublished', 'date', 'dc.date'),
    publisher: meta(document, 'og:site_name', 'application-name'),
    author: meta(document, 'author', 'article:author'),
    title:
      meta(document, 'og:title') ?? document.querySelector('title')?.textContent?.trim() ?? null,
  };
  // Readability mutates the DOM; it receives the parsed document directly.
  const article = new Readability(
    document as unknown as ConstructorParameters<typeof Readability>[0],
    { charThreshold: 200 },
  ).parse();
  const content = article?.content ? htmlToText(article.content) : '';
  return {
    url,
    title: article?.title?.trim() || metaInfo.title,
    author: article?.byline?.trim() || metaInfo.author,
    publishedAt: article?.publishedTime ?? metaInfo.publishedAt,
    publisher: article?.siteName ?? metaInfo.publisher,
    content: content.slice(0, MAX_EXTRACTED_CHARS),
    language: article?.lang ?? lang,
  };
}

/** Built-in extractor: safe fetch + Mozilla Readability. Needs no API key. */
export class ReadabilityExtractor implements ContentExtractor {
  readonly name = 'readability';

  constructor(private readonly fetchOptions: SafeFetchOptions = {}) {}

  async extract(url: string): Promise<ExtractedDocument> {
    const page = await safeFetch(url, this.fetchOptions);
    const doc =
      page.contentType === 'text/plain'
        ? {
            url: page.finalUrl,
            title: null,
            author: null,
            publishedAt: null,
            publisher: null,
            content: page.body.slice(0, MAX_EXTRACTED_CHARS),
            language: null,
          }
        : extractFromHtml(page.body, page.finalUrl);
    if (doc.content.length < MIN_EXTRACTED_CHARS) {
      throw new AppError(
        'EXTRACTION_FAILED',
        'We could not find readable article text on that page.',
      );
    }
    return doc;
  }
}
