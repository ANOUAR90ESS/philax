import { buildApp, createContainer } from '@philax/api';
import type { PoolDb } from '@philax/database';
import type { DebateStreamEvent } from '@philax/types';
import type { ContentExtractor } from '@philax/sources';
import { testEnv } from './env';
import { FixtureLLM, type FixtureOptions } from './fixture-llm';
import { HashingEmbeddingProvider } from './hashing-embeddings';

export type App = Awaited<ReturnType<typeof buildApp>>;

export async function createHarness(
  db: PoolDb,
  opts: FixtureOptions & { embeddings?: boolean; extractor?: ContentExtractor } = {},
) {
  const llm = new FixtureLLM(opts);
  const container = createContainer(
    testEnv({
      LLM_TIER_FAST: 'fixture:fast',
      LLM_TIER_STRONG: 'fixture:strong',
      LLM_TIER_PREMIUM: 'fixture:premium',
    }),
    {
      db,
      llmProviders: [llm.provider],
      embeddings: opts.embeddings ? new HashingEmbeddingProvider() : null,
      extractor: opts.extractor,
    },
  );
  const app = await buildApp(container, { logger: false });
  return { app, llm, container };
}

export async function register(
  app: App,
  email = `${crypto.randomUUID()}@test.dev`,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'a-long-password' },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  const raw = res.headers['set-cookie'];
  return String(Array.isArray(raw) ? raw[0] : raw).split(';')[0] as string;
}

export function parseSse(body: string): DebateStreamEvent[] {
  return body
    .split('\n\n')
    .map((f) => f.split('\n').find((l) => l.startsWith('data:')))
    .filter((l): l is string => Boolean(l))
    .map((l) => JSON.parse(l.slice(5).trim()) as DebateStreamEvent);
}

export async function advance(app: App, cookie: string, id: string) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/debates/${id}/advance`,
    headers: { cookie },
    payload: {},
  });
  return {
    status: res.statusCode,
    events: res.statusCode === 200 ? parseSse(res.body) : [],
    body: res.body,
  };
}

export function lastState(events: DebateStreamEvent[]) {
  const s = [...events].reverse().find((e) => e.type === 'state');
  if (!s || s.type !== 'state')
    throw new Error(`no state event: ${JSON.stringify(events.filter((e) => e.type === 'error'))}`);
  return s.debate;
}
