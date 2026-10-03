import { z } from 'zod';

/**
 * Contract between the web app and the server's character media endpoints.
 * Provider credentials never cross it: the browser gets audio, a video URL or a
 * session-scoped real-time viewer token, nothing else.
 */

export const MEDIA_UNAVAILABLE_REASONS = [
  /** The provider's API key is not set on the server. */
  'provider_not_configured',
  /** No avatar/voice asset is configured for this character. */
  'not_configured',
  /** The configured asset does not match the character's identity. */
  'identity_mismatch',
  'invalid_provider',
  'invalid_api_key',
  'quota_exceeded',
  'rate_limited',
  'timeout',
  'unavailable',
  'invalid_avatar',
  'invalid_voice',
  'generation_failed',
  /** Too many real-time sessions are open on the server. */
  'busy',
] as const;
export type MediaUnavailableReason = (typeof MEDIA_UNAVAILABLE_REASONS)[number];

export type MediaAvailability =
  { status: 'ready' } | { status: 'unavailable'; reason: MediaUnavailableReason };

export type AvatarMode = 'live' | 'video' | 'off';

export interface MediaStatus {
  voice: { provider: 'elevenlabs'; configured: boolean };
  avatar: { provider: 'heygen'; mode: AvatarMode; configured: boolean };
}

export interface CharacterMediaView {
  characterId: string;
  voice: MediaAvailability;
  avatar: MediaAvailability;
}

export interface MediaUnavailableDetails {
  kind: 'voice' | 'avatar';
  reason: MediaUnavailableReason;
  retryAfterMs: number | null;
}

export const VOICE_SPEEDS = ['slow', 'normal', 'fast'] as const;
export const VoiceSpeedSchema = z.enum(VOICE_SPEEDS);
export type VoiceSpeed = z.infer<typeof VoiceSpeedSchema>;

/** A debate turn to voice: the server reads the text itself (never sent by the client). */
export const SpeechRequestSchema = z.object({
  debateId: z.uuid(),
  messageId: z.uuid(),
  speed: VoiceSpeedSchema.default('normal'),
  /** Resume from this subtitle segment of the turn. */
  fromSegment: z.number().int().min(0).max(500).default(0),
});
export type SpeechRequest = z.input<typeof SpeechRequestSchema>;

export interface SpeechAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface SpeechResponse {
  /** Spoken text (what the alignment refers to). */
  text: string;
  /** Base64 audio. */
  audio: string;
  mimeType: string;
  alignment: SpeechAlignment | null;
  durationMs: number;
}

export const AvatarSessionRequestSchema = z.object({
  debateId: z.uuid(),
  characterId: z.uuid(),
});
export type AvatarSessionRequest = z.infer<typeof AvatarSessionRequestSchema>;

export interface AvatarSessionResponse {
  sessionId: string;
  characterId: string;
  livekitUrl: string;
  livekitToken: string;
  maxDurationSeconds: number | null;
}

export type AvatarSpeakEvent =
  | { type: 'alignment'; text: string; alignment: SpeechAlignment | null; durationMs: number }
  | { type: 'speak_started' }
  | { type: 'speak_ended' }
  | { type: 'speak_interrupted' }
  | { type: 'error'; code: string; message: string; errorId: string; details?: unknown };

export interface VideoSegmentResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl: string | null;
}
