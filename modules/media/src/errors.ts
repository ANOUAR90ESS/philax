export type MediaProviderName = 'elevenlabs' | 'heygen' | 'liveavatar';

export const MEDIA_FAILURES = [
  'not_configured',
  'invalid_api_key',
  'quota_exceeded',
  'rate_limited',
  'timeout',
  'unavailable',
  'invalid_avatar',
  'invalid_voice',
  'generation_failed',
  'identity_mismatch',
] as const;
export type MediaFailure = (typeof MEDIA_FAILURES)[number];

/**
 * A provider call that failed, classified so the product can say what happened
 * ("Voice unavailable", "Retry") without exposing provider responses. `detail`
 * is for logs only and never contains credentials.
 */
export class MediaProviderError extends Error {
  readonly provider: MediaProviderName;
  readonly code: MediaFailure;
  readonly retryAfterMs: number | null;

  constructor(
    provider: MediaProviderName,
    code: MediaFailure,
    detail: string,
    options: { retryAfterMs?: number | null; cause?: unknown } = {},
  ) {
    super(`${provider}: ${code}: ${detail}`, { cause: options.cause });
    this.name = 'MediaProviderError';
    this.provider = provider;
    this.code = code;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }

  /** Failures worth retrying later as-is (the request itself was fine). */
  get retryable(): boolean {
    return this.code === 'rate_limited' || this.code === 'timeout' || this.code === 'unavailable';
  }
}

export function isMediaProviderError(err: unknown): err is MediaProviderError {
  return err instanceof MediaProviderError;
}
