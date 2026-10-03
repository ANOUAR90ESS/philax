import type { SubtitleSegment } from './lipsync/visemes';
import type {
  AudioResult,
  AvatarProvider,
  AvatarResult,
  AvatarVideoResult,
  ProviderCapabilities,
  VoiceProvider,
} from './providers/types';
import { ProviderNotConfiguredError, VoiceUnavailableError } from './providers/types';
import type { ProfileResolution } from './registry';

type ReadyProfile = Extract<ProfileResolution, { status: 'ready' }>;

/** Small LRU used to reuse rendered media instead of paying for it twice. */
export class MediaCache<T> {
  private readonly entries = new Map<string, T>();
  constructor(private readonly max = 200) {}

  get(key: string): T | undefined {
    const v = this.entries.get(key);
    if (v !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, v);
    }
    return v;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.max) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

export function mediaCacheKey(...parts: string[]): string {
  let h = 2166136261;
  const s = parts.join('\u0000');
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${parts.slice(0, -1).join('|')}|${(h >>> 0).toString(36)}`;
}

export interface RenderBudget {
  /** Longest acceptable wait before the character starts speaking. */
  maxLatencyMs: number;
  /** Highest acceptable spend per minute of presented speech. */
  maxCostPerMinuteUsd: number;
}

export const DEFAULT_RENDER_BUDGET: RenderBudget = { maxLatencyMs: 2500, maxCostPerMinuteUsd: 0 };

/**
 * Chooses how to present speech from a provider's measured properties:
 * real-time or streaming when it fits the latency budget, pre-rendered
 * segments only for reusable text, and the still avatar otherwise.
 */
export function planDelivery(
  caps: ProviderCapabilities,
  budget: RenderBudget,
  reusable: boolean,
): 'realtime' | 'streaming' | 'prerendered' | 'still' {
  if (caps.costPerMinuteUsd > budget.maxCostPerMinuteUsd) return 'still';
  if (caps.delivery === 'prerendered')
    return reusable || caps.typicalLatencyMs <= budget.maxLatencyMs ? 'prerendered' : 'still';
  return caps.typicalLatencyMs <= budget.maxLatencyMs ? caps.delivery : 'still';
}

export type VoiceOutcome =
  | { status: 'ready'; audio: AudioResult; provider: string }
  | {
      status: 'unavailable';
      reason:
        | 'no_provider'
        | 'no_language_voice'
        | 'no_compatible_voice'
        | 'not_configured'
        | 'provider_error';
    };

const baseLanguage = (tag: string) => tag.toLowerCase().split(/[-_]/)[0] ?? '';

/** Application entry point for voices. UI code never touches a provider. */
export class VoiceGateway {
  private readonly providers: Map<string, VoiceProvider>;
  private readonly cache = new MediaCache<AudioResult>();

  constructor(providers: VoiceProvider[]) {
    this.providers = new Map(providers.map((p) => [p.id, p]));
  }

  async synthesize(ready: ReadyProfile, text: string, language: string): Promise<VoiceOutcome> {
    const { profile } = ready;
    const provider = this.providers.get(profile.voice.provider);
    if (!provider) return { status: 'unavailable', reason: 'no_provider' };
    const lang = baseLanguage(language);
    const voiceId = profile.voice.languageVoices[lang];
    if (!voiceId) return { status: 'unavailable', reason: 'no_language_voice' };

    const key = mediaCacheKey(provider.id, voiceId, lang, text);
    const cached = this.cache.get(key);
    if (cached) return { status: 'ready', audio: cached, provider: provider.id };
    try {
      const audio = await provider.synthesize({ profile, voiceId, text, language: lang });
      // Only finished clips are reusable; live streams are consumed once.
      if (audio.kind === 'clip') this.cache.set(key, audio);
      return { status: 'ready', audio, provider: provider.id };
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError)
        return { status: 'unavailable', reason: 'not_configured' };
      if (err instanceof VoiceUnavailableError)
        return {
          status: 'unavailable',
          reason: err.reason === 'no_compatible_voice' ? 'no_compatible_voice' : 'provider_error',
        };
      return { status: 'unavailable', reason: 'provider_error' };
    }
  }
}

export type AvatarOutcome =
  | { status: 'ready'; avatar: AvatarResult }
  | {
      status: 'unavailable';
      reason: 'no_provider' | 'avatar_identity_mismatch' | 'not_configured' | 'provider_error';
    };

/** Application entry point for avatars. UI code never touches a provider. */
export class AvatarGateway {
  private readonly providers: Map<string, AvatarProvider>;
  private readonly avatars = new MediaCache<AvatarResult>(100);
  private readonly videos = new MediaCache<AvatarVideoResult>();

  constructor(
    providers: AvatarProvider[],
    private readonly budget: RenderBudget = DEFAULT_RENDER_BUDGET,
  ) {
    this.providers = new Map(providers.map((p) => [p.id, p]));
  }

  async avatarFor(ready: ReadyProfile): Promise<AvatarOutcome> {
    const { profile, identity } = ready;
    const provider = this.providers.get(profile.avatar.provider);
    if (!provider) return { status: 'unavailable', reason: 'no_provider' };
    const key = `${provider.id}|${profile.avatar.avatarId}`;
    let avatar = this.avatars.get(key);
    if (!avatar) {
      try {
        avatar = await provider.generateAvatar({ profile });
      } catch (err) {
        return {
          status: 'unavailable',
          reason: err instanceof ProviderNotConfiguredError ? 'not_configured' : 'provider_error',
        };
      }
      this.avatars.set(key, avatar);
    }
    // The asset itself must present as the character does, whatever the profile claims.
    if (
      avatar.presentation !== identity.presentation ||
      avatar.avatarId !== profile.avatar.avatarId
    )
      return { status: 'unavailable', reason: 'avatar_identity_mismatch' };
    return { status: 'ready', avatar };
  }

  async renderSpeech(
    ready: ReadyProfile,
    segment: SubtitleSegment,
    audio: AudioResult,
    language: string,
    reusable = false,
  ): Promise<AvatarVideoResult> {
    const provider = this.providers.get(ready.profile.avatar.provider);
    if (!provider) return { kind: 'still' };
    const plan = planDelivery(provider.capabilities, this.budget, reusable);
    if (plan === 'still') return { kind: 'still' };
    const key = mediaCacheKey(provider.id, ready.profile.avatar.avatarId, language, segment.text);
    const cached = this.videos.get(key);
    if (cached) return cached;
    try {
      const result = await provider.renderSpeech({
        profile: ready.profile,
        segment,
        audio,
        language,
      });
      if (result.kind === 'video') this.videos.set(key, result);
      return result;
    } catch {
      return { kind: 'still' };
    }
  }
}
