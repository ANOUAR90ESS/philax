import type { ErrorCode } from './api';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  EXTRACTION_FAILED: 422,
  URL_NOT_ALLOWED: 422,
  AI_UNAVAILABLE: 503,
  AI_OUTPUT_INVALID: 502,
  NO_SUITABLE_CHARACTERS: 422,
  INVALID_STATE: 409,
  MEDIA_UNAVAILABLE: 503,
  PARTICIPANTS_NOT_READY: 503,
  INTERNAL: 500,
};

/**
 * Domain error with a stable machine code. `message` must be safe to show to
 * users (no internals); put diagnostic detail in `cause`, which is only logged.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { cause?: unknown; details?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
