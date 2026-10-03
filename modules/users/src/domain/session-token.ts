import { createHash, randomBytes } from 'node:crypto';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 256-bit random opaque token; only its SHA-256 hash is persisted. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
