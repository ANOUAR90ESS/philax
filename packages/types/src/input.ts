import { z } from 'zod';

export const MAX_TEXT_INPUT_CHARS = 20_000;
export const MIN_TEXT_INPUT_CHARS = 3;

const httpUrl = z
  .url({ protocol: /^https?$/, hostname: z.regexes.domain })
  .max(2048)
  .refine((value) => {
    // Zod runs refinements even when earlier checks failed, so parsing must be guarded.
    try {
      const u = new URL(value);
      return !u.username && !u.password;
    } catch {
      return false;
    }
  }, 'URLs with credentials are not allowed');

export const UserInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    content: z.string().trim().min(MIN_TEXT_INPUT_CHARS).max(MAX_TEXT_INPUT_CHARS),
  }),
  z.object({
    type: z.literal('url'),
    url: httpUrl,
  }),
]);
export type UserInput = z.infer<typeof UserInputSchema>;

export const CONTENT_TYPES = [
  'question',
  'statement',
  'topic',
  'long_text',
  'web_article',
] as const;
export const ContentTypeSchema = z.enum(CONTENT_TYPES);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const NormalizedInputSchema = z.object({
  title: z.string().optional(),
  rawContent: z.string().min(1),
  sourceUrl: z.url().optional(),
  language: z.string(),
  contentType: ContentTypeSchema,
  author: z.string().optional(),
  publisher: z.string().optional(),
  publishedAt: z.string().optional(),
});
export type NormalizedInput = z.infer<typeof NormalizedInputSchema>;
