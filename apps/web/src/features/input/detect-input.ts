import type { UserInput } from '@philax/types';

/** Treats the input as a URL only when it is a single http(s) URL and nothing else. */
export function detectInput(raw: string): UserInput {
  const trimmed = raw.trim();
  if (/^https?:\/\/\S+$/i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol === 'http:' || url.protocol === 'https:')
        return { type: 'url', url: url.toString() };
    } catch {
      // Not a valid URL: fall through to text.
    }
  }
  return { type: 'text', content: trimmed };
}
