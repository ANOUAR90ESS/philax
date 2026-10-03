import type { ContentType } from '@philax/types';

const QUESTION_START =
  /^(who|what|when|where|why|how|is|are|can|could|should|would|will|do|does|did|qué|cómo|por qué|cuál|es|son|debería|hay|هل|ما|ماذا|لماذا|كيف|متى|أين|من)\b/iu;

/** Heuristic content type for text input; the topic analyzer refines meaning. */
export function classifyText(text: string): ContentType {
  const t = text.trim();
  if (t.length > 600 || t.split(/\n\s*\n/).length > 2) return 'long_text';
  if (/[?؟]\s*$/.test(t) || t.startsWith('¿') || QUESTION_START.test(t)) return 'question';
  if (t.split(/\s+/).length <= 5 && !/[.!]$/.test(t)) return 'topic';
  return 'statement';
}
