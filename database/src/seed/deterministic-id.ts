import { createHash } from 'node:crypto';

const NAMESPACE = 'philax-seed-v1';

/**
 * Name-based UUID (version 5 layout, SHA-1) so re-seeding yields the same ids and
 * references from existing debates stay valid.
 */
export function seedId(...parts: string[]): string {
  const hash = createHash('sha1')
    .update([NAMESPACE, ...parts].join('\u0000'))
    .digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
