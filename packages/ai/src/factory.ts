import { CachedEmbeddingProvider } from './embeddings/cached';
import { GoogleEmbeddingProvider, OpenAIEmbeddingProvider } from './embeddings/providers';
import type { EmbeddingProvider } from './embeddings/types';
import { DefaultLLMGateway, type ModelTarget } from './gateway';
import { AnthropicProvider } from './providers/anthropic';
import { GoogleProvider } from './providers/google';
import { OpenAIProvider } from './providers/openai';
import type { LLMCallRecord, LLMProvider, LLMTier } from './types';

export interface AIConfig {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
  /** "provider:model" strings per tier; empty = defaults for configured providers. */
  tiers: Record<LLMTier, string[]>;
  embeddingModel?: string;
  timeoutMs: number;
  maxRetries: number;
  onCall?: (record: LLMCallRecord) => void;
}

/**
 * Default models per provider and tier. Anthropic IDs are current as of 2026-09.
 * OpenAI/Google defaults should be checked against the vendors' model lists and
 * overridden with LLM_TIER_* when they change.
 */
export const DEFAULT_TIER_MODELS: Record<string, Record<LLMTier, string>> = {
  anthropic: { fast: 'claude-haiku-4-5', strong: 'claude-sonnet-5-5', premium: 'claude-opus-5-5' },
  openai: { fast: 'gpt-5-mini', strong: 'gpt-5', premium: 'gpt-5' },
  google: { fast: 'gemini-2.5-flash', strong: 'gemini-2.5-pro', premium: 'gemini-2.5-pro' },
};

export function parseTarget(spec: string): ModelTarget {
  const idx = spec.indexOf(':');
  if (idx <= 0 || idx === spec.length - 1)
    throw new Error(`Invalid model target "${spec}" (expected provider:model)`);
  return { provider: spec.slice(0, idx), model: spec.slice(idx + 1) };
}

export function resolveTiers(
  configured: Record<LLMTier, string[]>,
  availableProviders: string[],
): Record<LLMTier, ModelTarget[]> {
  const out = {} as Record<LLMTier, ModelTarget[]>;
  for (const tier of ['fast', 'strong', 'premium'] as const) {
    const explicit = configured[tier];
    out[tier] =
      explicit.length > 0
        ? explicit.map(parseTarget)
        : availableProviders.map((p) => ({
            provider: p,
            model: (DEFAULT_TIER_MODELS[p] as Record<LLMTier, string>)[tier],
          }));
  }
  return out;
}

export function createProviders(
  cfg: Pick<AIConfig, 'anthropicApiKey' | 'openaiApiKey' | 'googleApiKey'>,
): LLMProvider[] {
  const providers: LLMProvider[] = [];
  if (cfg.anthropicApiKey) providers.push(new AnthropicProvider(cfg.anthropicApiKey));
  if (cfg.openaiApiKey) providers.push(new OpenAIProvider(cfg.openaiApiKey));
  if (cfg.googleApiKey) providers.push(new GoogleProvider(cfg.googleApiKey));
  return providers;
}

export function createGateway(
  cfg: AIConfig,
  providers: LLMProvider[] = createProviders(cfg),
): DefaultLLMGateway {
  return new DefaultLLMGateway({
    providers,
    tiers: resolveTiers(
      cfg.tiers,
      providers.map((p) => p.name),
    ),
    timeoutMs: cfg.timeoutMs,
    maxRetries: cfg.maxRetries,
    onCall: cfg.onCall,
  });
}

/** Returns null when no embedding model is configured (retrieval is then lexical only). */
export function createEmbeddingProvider(cfg: AIConfig): EmbeddingProvider | null {
  if (!cfg.embeddingModel) return null;
  const { provider, model } = parseTarget(cfg.embeddingModel);
  let inner: EmbeddingProvider;
  if (provider === 'openai') {
    if (!cfg.openaiApiKey)
      throw new Error('EMBEDDING_MODEL uses openai but OPENAI_API_KEY is not set');
    inner = new OpenAIEmbeddingProvider(cfg.openaiApiKey, model);
  } else if (provider === 'google') {
    if (!cfg.googleApiKey)
      throw new Error('EMBEDDING_MODEL uses google but GOOGLE_AI_API_KEY is not set');
    inner = new GoogleEmbeddingProvider(cfg.googleApiKey, model);
  } else {
    throw new Error(`Unsupported embedding provider "${provider}"`);
  }
  return new CachedEmbeddingProvider(inner);
}
