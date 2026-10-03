/**
 * E2E API server: the real API and database with the deterministic fixture LLM
 * (no paid provider keys). Uses TEST_DATABASE_URL, rebuilt from migrations + seed.
 */
import { buildApp, createContainer } from '@philax/api';
import { migrate, MIGRATIONS_DIR, PoolDb, readMigrations } from '@philax/database';
import { testEnv } from '../support/env';
import { FixtureLLM } from '../support/fixture-llm';
import { seedTestDatabase } from '../support/seed';

const PORT = Number(process.env.E2E_API_PORT ?? 4100);
const WEB = process.env.E2E_WEB_ORIGIN ?? 'http://localhost:5174';

const env = testEnv({
  CORS_ORIGINS: WEB,
  LLM_TIER_FAST: 'fixture:f',
  LLM_TIER_STRONG: 'fixture:s',
  LLM_TIER_PREMIUM: 'fixture:p',
});
const db = new PoolDb(env.DATABASE_URL);
await db.query('DROP SCHEMA IF EXISTS public CASCADE');
await db.query('CREATE SCHEMA public');
await migrate(db, await readMigrations(MIGRATIONS_DIR));
await seedTestDatabase(db);

const llm = new FixtureLLM();
const app = await buildApp(
  createContainer(env, { db, llmProviders: [llm.provider], embeddings: null }),
  { logger: false },
);
await app.listen({ host: '127.0.0.1', port: PORT });
console.info(`[e2e] API listening on ${PORT}`);
