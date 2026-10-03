import { AppError } from '@philax/types';
import { assertPublicUrl, systemResolver, type Resolver } from './url-safety';

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  resolve?: Resolver;
  fetchImpl?: typeof fetch;
}

export interface FetchedPage {
  finalUrl: string;
  contentType: string;
  body: string;
}

const ALLOWED_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain'];

/**
 * Fetches a public web page with SSRF protection: every redirect hop is
 * re-validated, the body is size-capped while streaming, and only HTML/text is
 * accepted. (DNS rebinding between validation and connect remains a residual
 * risk; mitigate at the network layer in production — see docs/architecture.)
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<FetchedPage> {
  const maxBytes = opts.maxBytes ?? 3 * 1024 * 1024;
  const maxRedirects = opts.maxRedirects ?? 5;
  const resolve = opts.resolve ?? systemResolver;
  const doFetch = opts.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 15_000);

  let current = (await assertPublicUrl(rawUrl, resolve)).toString();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res: Response;
    try {
      res = await doFetch(current, {
        redirect: 'manual',
        signal,
        headers: {
          'user-agent': 'PhilaxBot/0.1 (+debate platform; content extraction)',
          accept: 'text/html,text/plain;q=0.8',
        },
      });
    } catch (err) {
      throw new AppError('EXTRACTION_FAILED', 'The page could not be downloaded.', { cause: err });
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel().catch(() => undefined);
      if (!location)
        throw new AppError('EXTRACTION_FAILED', 'The page redirected without a destination.');
      current = (await assertPublicUrl(new URL(location, current).toString(), resolve)).toString();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new AppError('EXTRACTION_FAILED', `The page returned an error (${res.status}).`);
    }
    const contentType =
      (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!ALLOWED_TYPES.includes(contentType)) {
      await res.body?.cancel().catch(() => undefined);
      throw new AppError('EXTRACTION_FAILED', 'Only web pages (HTML or text) can be read.');
    }
    return { finalUrl: current, contentType, body: await readCapped(res, maxBytes) };
  }
  throw new AppError('EXTRACTION_FAILED', 'Too many redirects.');
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new AppError('EXTRACTION_FAILED', 'The page is too large to process.');
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
}
