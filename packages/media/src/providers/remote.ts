import type {
  AudioResult,
  AvatarProvider,
  AvatarRequest,
  AvatarResult,
  AvatarVideoResult,
  ProviderCapabilities,
  SpeechRenderRequest,
  SynthesisRequest,
  VoiceProvider,
} from './types';
import { ProviderNotConfiguredError } from './types';

/**
 * Remote providers are reached through Philax's own backend, which holds the
 * vendor credentials; the browser never talks to a vendor directly. Until an
 * endpoint is configured these adapters refuse every call, and the gateways
 * report the media as unavailable instead of substituting another identity.
 */
export interface RemoteProviderOptions {
  /** Base URL of the backend media proxy, e.g. `/api/media`. */
  endpoint?: string;
  fetch?: typeof fetch;
}

async function post<T>(opts: RemoteProviderOptions, id: string, path: string, body: unknown) {
  if (!opts.endpoint) throw new ProviderNotConfiguredError(id);
  const res = await (opts.fetch ?? fetch)(`${opts.endpoint}/${id}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${id} ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

/** HeyGen streaming/pre-rendered video avatars (adapter; requires a backend proxy). */
export class HeyGenAvatarProvider implements AvatarProvider {
  readonly id = 'heygen';
  readonly capabilities: ProviderCapabilities = {
    delivery: 'streaming',
    typicalLatencyMs: 1500,
    costPerMinuteUsd: 1,
    quality: 5,
    requiresNetwork: true,
  };

  constructor(private readonly opts: RemoteProviderOptions = {}) {}

  generateAvatar({ profile }: AvatarRequest): Promise<AvatarResult> {
    return post<AvatarResult>(this.opts, this.id, 'avatar', { avatarId: profile.avatar.avatarId });
  }

  renderSpeech(req: SpeechRenderRequest): Promise<AvatarVideoResult> {
    return post<AvatarVideoResult>(this.opts, this.id, 'speech', {
      avatarId: req.profile.avatar.avatarId,
      text: req.segment.text,
      language: req.language,
      audioUrl: req.audio.kind === 'clip' ? req.audio.url : null,
    });
  }
}

/** ElevenLabs text-to-speech (adapter; requires a backend proxy). */
export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly id = 'elevenlabs';
  readonly capabilities: ProviderCapabilities = {
    delivery: 'streaming',
    typicalLatencyMs: 400,
    costPerMinuteUsd: 0.2,
    quality: 5,
    requiresNetwork: true,
  };

  constructor(private readonly opts: RemoteProviderOptions = {}) {}

  async synthesize(req: SynthesisRequest): Promise<AudioResult> {
    const clip = await post<{
      url: string;
      durationMs: number;
      boundaries?: { charIndex: number; timeMs: number }[];
    }>(this.opts, this.id, 'synthesize', {
      voiceId: req.voiceId,
      text: req.text,
      language: req.language,
    });
    return { kind: 'clip', ...clip };
  }
}
