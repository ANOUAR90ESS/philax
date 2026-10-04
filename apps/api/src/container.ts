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
  CharacterMediaService,
  ElevenLabsVoiceGateway,
  ElevenLabsVoiceProvider,
  HeyGenAvatarGateway,
  JoggAIAvatarGateway,
  JoggAIVideoAvatarProvider,
  HeyGenVideoAvatarProvider,
  LiveAvatarProvider,
  MediaOrchestrator,
  MediaProfileRepository,
  unavailableAvatarGateway,
  type AvatarGateway,
  type AvatarProvider,
  type VoiceGateway,
  type VoiceProvider,
} from '@philax/media-service';
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
  media: CharacterMediaService;
  close(): Promise<void>;
}

export interface ContainerOverrides {
  db?: PoolDb;
  analytics?: Analytics;
  llmProviders?: LLMProvider[];
  embeddings?: EmbeddingProvider | null;
  extractor?: ContentExtractor;
  /** Media providers; tests substitute these (mocks are for automated tests only). */
  voice?: VoiceProvider;
  avatar?: AvatarProvider | null;
  voiceGateway?: VoiceGateway;
  avatarGateway?: AvatarGateway;
}

function avatarProvider(env: Env): AvatarProvider | null {
  if (env.MEDIA_AVATAR_MODE === 'live')
    return new LiveAvatarProvider({ apiKey: env.LIVEAVATAR_API_KEY });
  if (env.MEDIA_AVATAR_MODE === 'video')
    return env.MEDIA_VIDEO_AVATAR_PROVIDER === 'joggai'
      ? new JoggAIVideoAvatarProvider({ apiKey: env.JOGGAI_API_KEY })
      : new HeyGenVideoAvatarProvider({ apiKey: env.HEYGEN_API_KEY });
  return null;
}

function videoAvatarGateway(env: Env): AvatarGateway {
  return env.MEDIA_VIDEO_AVATAR_PROVIDER === 'joggai'
    ? new JoggAIAvatarGateway({ apiKey: env.JOGGAI_API_KEY, enabled: env.MEDIA_AUTO_PREPARE })
    : new HeyGenAvatarGateway({ apiKey: env.HEYGEN_API_KEY, enabled: env.MEDIA_AUTO_PREPARE });
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

  const mediaProfiles = new MediaProfileRepository(db);
  const elevenlabs = new ElevenLabsVoiceProvider({
    apiKey: env.ELEVENLABS_API_KEY,
    modelId: env.ELEVENLABS_MODEL_ID,
  });
  const media = new CharacterMediaService({
    repository: mediaProfiles,
    voice: overrides.voice ?? elevenlabs,
    avatar: overrides.avatar !== undefined ? overrides.avatar : avatarProvider(env),
    voiceModel: env.ELEVENLABS_MODEL_ID,
    maxLiveSessions: env.MEDIA_MAX_LIVE_SESSIONS,
  });
  // Prepares each selected participant's avatar and voice before a debate starts.
  const orchestrator = new MediaOrchestrator({
    repository: mediaProfiles,
    media,
    voices:
      overrides.voiceGateway ?? new ElevenLabsVoiceGateway(elevenlabs, env.MEDIA_AUTO_PREPARE),
    avatars:
      overrides.avatarGateway ??
      (env.MEDIA_AVATAR_MODE === 'video'
        ? videoAvatarGateway(env)
        : // LiveAvatar has no API for creating avatars: real-time avatars are configured by an operator.
          unavailableAvatarGateway()),
    // Internal states are for operators only (never sent to users); no provider ids or secrets.
    onState: (characterId, state, detail) => {
      if (state === 'MEDIA_FAILED' && env.LOG_LEVEL !== 'silent')
        console.warn(`[media] ${characterId} ${state}${detail ? ` ${detail}` : ''}`);
      else if (env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace')
        console.info(`[media] ${characterId} ${state}${detail ? ` ${detail}` : ''}`);
    },
  });

  const debates = new DebateService({
    db,
    gateway,
    retrieval,
    inputs: new InputService(db, extractor),
    usage,
    lock: new PgAdvisoryLock(db),
    participants: orchestrator,
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
    media,
    close: async () => {
      await media.close();
      if (ownsPool) await db.close();
    },
  };
}
