import { z } from 'zod';

export const SOURCE_TYPES = [
  'primary',
  'secondary',
  'academic',
  'article',
  'book',
  'user-provided',
] as const;
export const SourceTypeSchema = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof SourceTypeSchema>;

/**
 * Epistemic status of a piece of knowledge. These are never mixed (§11):
 * a generated inference is never stored as knowledge, and is labelled when shown.
 */
export const KNOWLEDGE_KINDS = [
  'biographical_fact',
  'documented_position',
  'concept',
  'scholarly_interpretation',
  'interpretation',
  'user_content',
] as const;
export const KnowledgeKindSchema = z.enum(KNOWLEDGE_KINDS);
export type KnowledgeKind = z.infer<typeof KnowledgeKindSchema>;

export const SourceSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  author: z.string().nullable(),
  publisher: z.string().nullable(),
  url: z.url().nullable(),
  publishedAt: z.string().nullable(),
  sourceType: SourceTypeSchema,
});
export type Source = z.infer<typeof SourceSchema>;

export const SourceReferenceSchema = z.object({
  sourceId: z.uuid(),
  locator: z.string().nullable(),
});
export type SourceReference = z.infer<typeof SourceReferenceSchema>;

/** Output of a ContentExtractor for a URL. */
export const ExtractedDocumentSchema = z.object({
  url: z.url(),
  title: z.string().nullable(),
  author: z.string().nullable(),
  publishedAt: z.string().nullable(),
  publisher: z.string().nullable(),
  content: z.string(),
  language: z.string().nullable(),
});
export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;
