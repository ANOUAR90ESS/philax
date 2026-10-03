import { PROCEDURAL_AVATAR_PROVIDER } from '../profiles/catalog';
import type {
  AvatarProvider,
  AvatarRequest,
  AvatarResult,
  AvatarVideoResult,
  ProviderCapabilities,
} from './types';

/**
 * Vector portrait rendered and animated on the device from the profile's
 * appearance. No video is generated: the mouth is driven in real time by the
 * voice's word boundaries, so a turn costs nothing to present.
 */
export class ProceduralAvatarProvider implements AvatarProvider {
  readonly id = PROCEDURAL_AVATAR_PROVIDER;
  readonly capabilities: ProviderCapabilities = {
    delivery: 'realtime',
    typicalLatencyMs: 0,
    costPerMinuteUsd: 0,
    quality: 2,
    requiresNetwork: false,
  };

  async generateAvatar({ profile }: AvatarRequest): Promise<AvatarResult> {
    return {
      provider: this.id,
      avatarId: profile.avatar.avatarId,
      // The renderer draws the face geometry for the profile's visual presentation.
      presentation: profile.visualIdentity.presentation,
      kind: 'procedural',
      appearance: profile.avatar.appearance,
    };
  }

  async renderSpeech(): Promise<AvatarVideoResult> {
    return { kind: 'realtime' };
  }
}
