import { z } from 'zod';
import { LocaleSchema } from './common';
import { DebateModeSchema } from './debates';
import { UserInputSchema } from './input';

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    errorId: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
  'EXTRACTION_FAILED',
  'URL_NOT_ALLOWED',
  'AI_UNAVAILABLE',
  'AI_OUTPUT_INVALID',
  'NO_SUITABLE_CHARACTERS',
  'INVALID_STATE',
  'MEDIA_UNAVAILABLE',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const PasswordSchema = z.string().min(10).max(200);
export const EmailSchema = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());

export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
  locale: LocaleSchema.optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UserViewSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  locale: LocaleSchema,
  plan: z.enum(['free', 'pro']),
});
export type UserView = z.infer<typeof UserViewSchema>;

export const CreateDebateRequestSchema = z.object({
  input: UserInputSchema,
  mode: DebateModeSchema.default('debate'),
  /** UI locale; debate content follows the input language unless overridden. */
  locale: LocaleSchema.optional(),
});
export type CreateDebateRequest = z.infer<typeof CreateDebateRequestSchema>;

export const CreateChallengeRequestSchema = z.object({
  idea: z.string().trim().min(3).max(2000),
  locale: LocaleSchema.optional(),
});
export type CreateChallengeRequest = z.infer<typeof CreateChallengeRequestSchema>;

export const UserMessageRequestSchema = z.object({
  content: z.string().trim().min(2).max(2000),
});
export type UserMessageRequest = z.infer<typeof UserMessageRequestSchema>;

export const SaveDebateRequestSchema = z.object({ saved: z.boolean() });
