import type { AvatarAppearance, CharacterMediaProfile, Presentation } from '../identity/types';
import type { SubtitleSegment } from '../lipsync/visemes';

/**
 * What a provider costs and how it delivers, so the gateways can choose a
 * rendering path from latency, cost and quality rather than from a name.
 */
export interface ProviderCapabilities {
  delivery: 'realtime' | 'streaming' | 'prerendered';
  typicalLatencyMs: number;
  /** Approximate spend per minute of output; 0 for on-device rendering. */
  costPerMinuteUsd: number;
  quality: 1 | 2 | 3 | 4 | 5;
  requiresNetwork: boolean;
}

export interface AvatarResult {
  provider: string;
  avatarId: string;
  /** Presentation of the asset itself, checked against the character identity. */
  presentation: Presentation;
  kind: 'procedural' | 'image' | 'video-avatar';
  appearance?: AvatarAppearance;
  imageUrl?: string;
}

export type AvatarVideoResult =
  /** Animated on the client from the voice's word boundaries. */
  | { kind: 'realtime' }
  | { kind: 'video'; url: string; durationMs: number }
  /** Cost or latency budget excluded video: show the character's still avatar. */
  | { kind: 'still' };

export interface AvatarRequest {
  profile: CharacterMediaProfile;
}

export interface SpeechRenderRequest {
  profile: CharacterMediaProfile;
  segment: SubtitleSegment;
  audio: AudioResult;
  language: string;
}

export interface AvatarProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  generateAvatar(req: AvatarRequest): Promise<AvatarResult>;
  renderSpeech(req: SpeechRenderRequest): Promise<AvatarVideoResult>;
}

export interface SpeechHandlers {
  /** Character offset (within the synthesized text) of the word being spoken. */
  onBoundary(charIndex: number): void;
  onEnd(): void;
  onError(error: Error): void;
}

/** Live speech that plays as it is synthesized (device or streaming voice). */
export interface SpeechPlayback {
  start(handlers: SpeechHandlers): void;
  cancel(): void;
}

export type AudioResult =
  | { kind: 'stream'; playback: SpeechPlayback }
  | {
      kind: 'clip';
      url: string;
      durationMs: number;
      /** Word timing, when the provider returns it. */
      boundaries?: { charIndex: number; timeMs: number }[];
    };

export interface SynthesisRequest {
  profile: CharacterMediaProfile;
  /** Provider voice id for this language, from `languageVoices`. */
  voiceId: string;
  text: string;
  language: string;
}

export interface VoiceProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  synthesize(req: SynthesisRequest): Promise<AudioResult>;
}

export type VoiceUnavailableReason =
  'not_configured' | 'unsupported' | 'no_compatible_voice' | 'provider_error';

/** Thrown by providers that cannot produce an identity-compatible voice. */
export class VoiceUnavailableError extends Error {
  constructor(
    readonly reason: VoiceUnavailableReason,
    message: string,
  ) {
    super(message);
    this.name = 'VoiceUnavailableError';
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider} is not configured`);
    this.name = 'ProviderNotConfiguredError';
  }
}
