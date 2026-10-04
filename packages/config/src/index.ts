import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: csv,
  /** Number of trusted reverse-proxy hops for client IPs (0 = do not trust X-Forwarded-For). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  SESSION_SECRET: optionalString,
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: optionalString,

  OPENAI_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  GOOGLE_AI_API_KEY: optionalString,
  LLM_TIER_FAST: csv,
  LLM_TIER_STRONG: csv,
  LLM_TIER_PREMIUM: csv,
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  EMBEDDING_MODEL: optionalString,

  FIRECRAWL_API_KEY: optionalString,

  /** Character media. Keys are read server-side only; the browser never sees them. */
  ELEVENLABS_API_KEY: optionalString,
  ELEVENLABS_MODEL_ID: z.string().default('eleven_multilingual_v2'),
  /** HeyGen API (avatar video segments). */
  HEYGEN_API_KEY: optionalString,
  /** JoggAI API (rendered avatar video with a transparent background). */
  JOGGAI_API_KEY: optionalString,
  /** Which provider renders avatar video when MEDIA_AVATAR_MODE=video. */
  MEDIA_VIDEO_AVATAR_PROVIDER: z.enum(['heygen', 'joggai']).default('heygen'),
  /** HeyGen LiveAvatar (real-time avatars) has its own key. */
  LIVEAVATAR_API_KEY: optionalString,
  /** live: real-time LiveAvatar sessions; video: rendered HeyGen segments; off: voice and portraits only. */
  MEDIA_AVATAR_MODE: z.enum(['live', 'video', 'off']).default('live'),
  /** Prepare missing avatars/voices automatically when a character is first selected (spends provider credits once per character). */
  MEDIA_AUTO_PREPARE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  MEDIA_MAX_LIVE_SESSIONS: z.coerce.number().int().min(0).max(100).default(4),
  POSTHOG_KEY: optionalString,
  POSTHOG_HOST: z.string().default('https://us.i.posthog.com'),
  SENTRY_DSN: optionalString,
});

export type Env = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Parses and validates environment variables. Throws a ConfigError listing every
 * invalid variable (names only — values are never echoed, they may be secrets).
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new ConfigError(`Invalid environment configuration:\n${problems}`);
  }
  const env = result.data;
  if (env.NODE_ENV === 'production') {
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      throw new ConfigError('SESSION_SECRET must be set to at least 32 characters in production');
    }
    if (env.CORS_ORIGINS.length === 0) {
      throw new ConfigError('CORS_ORIGINS must be set in production');
    }
  }
  return env;
}

/** Minimal .env loader (KEY=VALUE lines) so local development needs no extra tooling. */
export { loadDotEnv } from './dotenv';
