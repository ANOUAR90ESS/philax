import type { CharacterAlignment } from '@philax/media';
import type { MediaProviderName } from './errors';

/**
 * Provider ports. Concrete providers (ElevenLabs, HeyGen) live behind these;
 * the rest of the system — and the Debate Engine above it — never sees a vendor.
 */

/** `pcm_24000` is raw 16-bit mono PCM at 24 kHz (what real-time avatars consume). */
export type AudioFormat = 'mp3_44100_128' | 'pcm_24000';

export interface VoiceSettings {
  speed: number;
  stability: number;
  style: number;
}

export interface VoiceSynthesisInput {
  voiceId: string;
  text: string;
  /** ISO 639-1 code of the text. */
  language: string;
  format: AudioFormat;
  settings: VoiceSettings;
  signal?: AbortSignal;
}

export interface VoiceResult {
  audio: Uint8Array;
  format: AudioFormat;
  mimeType: string;
  /** Per-character timing of `text` in the audio, when the provider returns it. */
  alignment: CharacterAlignment | null;
  durationMs: number;
}

/** What a provider says about a voice or avatar asset (used for identity checks). */
export interface AssetFacts {
  name: string | null;
  gender: string | null;
}

export interface VoiceProvider {
  readonly name: MediaProviderName;
  readonly configured: boolean;
  synthesize(input: VoiceSynthesisInput): Promise<VoiceResult>;
  describeVoice(voiceId: string, signal?: AbortSignal): Promise<AssetFacts>;
}

export type AvatarKind = 'live' | 'video';

export interface AvatarSessionInput {
  characterId: string;
  avatarId: string;
  signal?: AbortSignal;
}

export interface AvatarSession {
  sessionId: string;
  provider: MediaProviderName;
  kind: AvatarKind;
  /** How the browser watches a real-time session (short-lived, session-scoped credentials). */
  viewer: { livekitUrl: string; livekitToken: string } | null;
  /** Upper bound the provider set for the session, if any. */
  maxDurationSeconds: number | null;
}

export type AvatarEvent =
  { type: 'speak_started' } | { type: 'speak_ended' } | { type: 'speak_interrupted' };

export interface AvatarSpeakInput {
  sessionId: string;
  /** Audio from the voice provider, in the avatar provider's `audioFormat`. */
  audio: VoiceResult;
  eventId: string;
  onEvent?: (event: AvatarEvent) => void;
  signal?: AbortSignal;
}

export type AvatarSpeakResult =
  | { kind: 'live'; eventId: string; outcome: 'ended' | 'interrupted' }
  | { kind: 'video'; videoId: string };

export type VideoStatus =
  | { status: 'pending' | 'processing' }
  | { status: 'completed'; videoUrl: string; durationSeconds: number | null }
  | { status: 'failed'; reason: string };

export interface AvatarProvider {
  readonly name: MediaProviderName;
  readonly kind: AvatarKind;
  readonly configured: boolean;
  /** Audio format `speak` needs. */
  readonly audioFormat: AudioFormat;
  /** Rendered video has a transparent background (the speaker can be placed into a scene). */
  readonly transparent?: boolean;
  createSession(input: AvatarSessionInput): Promise<AvatarSession>;
  speak(input: AvatarSpeakInput): Promise<AvatarSpeakResult>;
  stopSession(sessionId: string): Promise<void>;
  /** Stops the current utterance (real-time only). */
  interrupt?(sessionId: string): void;
  /** Status of a rendered segment (video only). */
  videoStatus?(videoId: string, signal?: AbortSignal): Promise<VideoStatus>;
  /** Provider facts about an avatar; null when the provider does not expose them. */
  describeAvatar(avatarId: string, signal?: AbortSignal): Promise<AssetFacts | null>;
}
