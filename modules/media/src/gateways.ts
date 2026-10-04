import type { Presentation } from '@philax/media';
import { MediaProviderError } from './errors';

/**
 * Preparation gateways: how the Media Orchestrator obtains a character's
 * avatar and voice assets. Each provider sits behind one adapter, so a
 * provider can be replaced without touching characters, debates or topics.
 */

export interface PrepareVoiceInput {
  characterSlug: string;
  /** Library name for the asset (no personal data). */
  name: string;
  /** What the voice must sound like, from the character's identity. */
  description: string;
  presentation: Presentation;
}

export interface PreparedVoice {
  voiceId: string;
  /** Gender the provider records for the voice, when it reports one. */
  gender: string | null;
}

export interface VoiceGateway {
  readonly provider: 'elevenlabs';
  /** Whether this deployment can create voices (provider configured, preparation enabled). */
  readonly canPrepare: boolean;
  prepareCharacterVoice(input: PrepareVoiceInput): Promise<PreparedVoice>;
}

export interface PrepareAvatarInput {
  characterSlug: string;
  name: string;
  /** Visual description: presentation, age, era, period dress, likeness notes. */
  description: string;
  presentation: Presentation;
}

export interface PreparedAvatar {
  avatarId: string;
  /** Which configured slot the asset fills. */
  slot: 'avatarId' | 'liveAvatarId';
  gender: string | null;
}

export interface AvatarGateway {
  readonly provider: 'heygen';
  readonly canPrepare: boolean;
  prepareCharacterAvatar(input: PrepareAvatarInput): Promise<PreparedAvatar>;
}

/** A gateway for a provider that cannot create assets through its API. */
export function unavailableAvatarGateway(): AvatarGateway {
  return {
    provider: 'heygen',
    canPrepare: false,
    prepareCharacterAvatar: () =>
      Promise.reject(
        new MediaProviderError('heygen', 'not_configured', 'avatar preparation is not available'),
      ),
  };
}

export function unavailableVoiceGateway(): VoiceGateway {
  return {
    provider: 'elevenlabs',
    canPrepare: false,
    prepareCharacterVoice: () =>
      Promise.reject(
        new MediaProviderError(
          'elevenlabs',
          'not_configured',
          'voice preparation is not available',
        ),
      ),
  };
}
