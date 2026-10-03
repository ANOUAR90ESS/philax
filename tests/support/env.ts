import { loadDotEnv, loadEnv, type Env } from '@philax/config';

/** Test environment: always the disposable TEST_DATABASE_URL, never the dev database. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  loadDotEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must be set for integration tests');
  if (url === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL (tests truncate tables)');
  }
  return loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: url,
    CORS_ORIGINS: 'http://localhost:5173',
    // Real provider keys are never used by tests.
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    GOOGLE_AI_API_KEY: '',
    FIRECRAWL_API_KEY: '',
    EMBEDDING_MODEL: '',
    POSTHOG_KEY: '',
    ...overrides,
  });
}
