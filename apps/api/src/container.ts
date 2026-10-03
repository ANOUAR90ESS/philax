import {
  createEmbeddingProvider,
  createGateway,
  createProviders,
  type EmbeddingProvider,
  type LLMCallRecord,
  type LLMGateway,
  type LLMProvider,
} from '@philax/ai';
import { UsageService } from '@philax/billing';
import { CharacterRepository } from '@philax/characters';
import type { Env } from '@philax/config';
import { PoolDb } from '@philax/database';
import { AiCallRepository, DebateService, PgAdvisoryLock } from '@philax/debates';
import { RetrievalService } from '@philax/knowledge';
import {
  FirecrawlExtractor,
  InputService,
  ReadabilityExtractor,
  type ContentExtractor,
} from '@philax/sources';
import { PasswordAuthService, type AuthService } from '@philax/users';
import {
  NoopAnalytics,
  PostHogAnalytics,
  type Analytics,
  type AnalyticsEvent,
} from './services/analytics';

/**
 * Composition root: the only place concrete implementations are chosen.
 * Tests pass `overrides` to swap infrastructure (LLM providers, embeddings, the
 * extractor) through the same interfaces production uses (ADR-013).
 */
export interface Container {
  env: Env;
  db: PoolDb;
  auth: AuthService;
  usage: UsageService;
  analytics: Analytics;
  gateway: LLMGateway;
  embeddings: EmbeddingProvider | null;
  retrieval: RetrievalService;
  debates: DebateService;
  characters: CharacterRepository;
  close(): Promise<void>;
}

export interface ContainerOverrides {
  db?: PoolDb;
  analytics?: Analytics;
  llmProviders?: LLMProvider[];
  embeddings?: EmbeddingProvider | null;
  extractor?: ContentExtractor;
}

export function createContainer(env: Env, overrides: ContainerOverrides = {}): Container {
  const ownsPool = !overrides.db;
  const db = overrides.db ?? new PoolDb(env.DATABASE_URL);
  const warn = (msg: string) => (err: unknown) => console.warn(`[${msg}]`, (err as Error).message);
  const analytics =
    overrides.analytics ??
    (env.POSTHOG_KEY
      ? new PostHogAnalytics(env.POSTHOG_KEY, env.POSTHOG_HOST, warn('analytics'))
      : new NoopAnalytics());

  const aiCalls = new AiCallRepository(db);
  const aiConfig = {
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    googleApiKey: env.GOOGLE_AI_API_KEY,
    tiers: { fast: env.LLM_TIER_FAST, strong: env.LLM_TIER_STRONG, premium: env.LLM_TIER_PREMIUM },
    embeddingModel: env.EMBEDDING_MODEL,
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
    // Telemetry (§52) is persisted without content; failures never affect requests.
    onCall: (r: LLMCallRecord) => void aiCalls.insert(r).catch(warn('telemetry')),
  };
  const gateway = createGateway(aiConfig, overrides.llmProviders ?? createProviders(aiConfig));
  const embeddings =
    overrides.embeddings !== undefined ? overrides.embeddings : createEmbeddingProvider(aiConfig);
  const retrieval = new RetrievalService(db, embeddings, warn('embeddings'));
  const extractor =
    overrides.extractor ??
    (env.FIRECRAWL_API_KEY
      ? new FirecrawlExtractor(env.FIRECRAWL_API_KEY)
      : new ReadabilityExtractor());
  const usage = new UsageService(db);

  const debates = new DebateService({
    db,
    gateway,
    retrieval,
    inputs: new InputService(db, extractor),
    usage,
    lock: new PgAdvisoryLock(db),
    track: (userId, event, props) => analytics.capture(userId, event as AnalyticsEvent, props),
  });

  return {
    env,
    db,
    auth: new PasswordAuthService(db),
    usage,
    analytics,
    gateway,
    embeddings,
    retrieval,
    debates,
    characters: new CharacterRepository(db),
    close: async () => {
      if (ownsPool) await db.close();
    },
  };
}
