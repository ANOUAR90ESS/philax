import { MediaProviderError, type MediaFailure, type MediaProviderName } from './errors';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CallOptions {
  provider: MediaProviderName;
  fetch: FetchLike;
  timeoutMs: number;
  /** What a 404 means for this endpoint (e.g. an unknown voice id). */
  notFound?: MediaFailure;
  signal?: AbortSignal;
}

function retryAfterMs(res: Response): number | null {
  const value = res.headers.get('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/** Maps an HTTP failure to a classified provider error. The body is read for its status code words only. */
export async function failureFor(res: Response, opts: CallOptions): Promise<MediaProviderError> {
  const body = (await res.text().catch(() => '')).slice(0, 2000);
  const says = (word: string) => body.toLowerCase().includes(word);
  const fail = (code: MediaFailure) =>
    new MediaProviderError(opts.provider, code, `HTTP ${res.status}`, {
      retryAfterMs: code === 'rate_limited' ? retryAfterMs(res) : null,
    });
  if (says('quota_exceeded') || says('insufficient credit') || says('no_credits'))
    return fail('quota_exceeded');
  switch (res.status) {
    case 401:
    case 403:
      return fail('invalid_api_key');
    case 402:
      return fail('quota_exceeded');
    case 404:
      return fail(opts.notFound ?? 'unavailable');
    case 408:
      return fail('timeout');
    case 429:
      return fail('rate_limited');
  }
  if (says('voice_not_found')) return fail('invalid_voice');
  if (says('avatar') && says('not found')) return fail('invalid_avatar');
  if (res.status >= 500) return fail('unavailable');
  return fail('generation_failed');
}

/**
 * Calls a provider endpoint with a deadline. Network failures become
 * `unavailable`, deadline expiry `timeout`; a caller's own abort is rethrown.
 */
export async function call(url: string, init: RequestInit, opts: CallOptions): Promise<Response> {
  const deadline = AbortSignal.timeout(opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([deadline, opts.signal]) : deadline;
  let res: Response;
  try {
    res = await opts.fetch(url, { ...init, signal });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    if (deadline.aborted)
      throw new MediaProviderError(opts.provider, 'timeout', `no response in ${opts.timeoutMs}ms`, {
        cause: err,
      });
    throw new MediaProviderError(opts.provider, 'unavailable', 'network error', { cause: err });
  }
  if (!res.ok) throw await failureFor(res, opts);
  return res;
}

export async function callJson<T>(url: string, init: RequestInit, opts: CallOptions): Promise<T> {
  const res = await call(url, init, opts);
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new MediaProviderError(opts.provider, 'generation_failed', 'invalid JSON response', {
      cause: err,
    });
  }
}

export function malformed(provider: MediaProviderName, what: string): MediaProviderError {
  return new MediaProviderError(provider, 'generation_failed', `unexpected response: ${what}`);
}
