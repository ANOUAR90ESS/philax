import {
  AvatarGateway,
  BrowserSpeechVoiceProvider,
  ElevenLabsVoiceProvider,
  HeyGenAvatarProvider,
  MediaProfileRegistry,
  ProceduralAvatarProvider,
  VoiceGateway,
  createWebSpeechEngine,
  type ClipPlayer,
} from '@philax/media';
import { createContext, useContext } from 'react';

/** Everything the UI needs to present characters; providers stay behind the gateways. */
export interface MediaServices {
  registry: MediaProfileRegistry;
  avatars: AvatarGateway;
  voices: VoiceGateway;
  playClip?: ClipPlayer;
}

const playClip: ClipPlayer = (url, handlers) => {
  const audio = new Audio(url);
  audio.onended = () => handlers.onEnd();
  audio.onerror = () => handlers.onError(new Error('audio playback failed'));
  audio.play().catch((err: unknown) => handlers.onError(err as Error));
  return {
    cancel() {
      audio.pause();
    },
  };
};

export function createBrowserMediaServices(): MediaServices {
  return {
    registry: new MediaProfileRegistry(),
    // Remote adapters are registered but unconfigured: a profile that names them
    // is reported unavailable rather than silently drawn or voiced by another provider.
    avatars: new AvatarGateway([new ProceduralAvatarProvider(), new HeyGenAvatarProvider()]),
    voices: new VoiceGateway([
      new BrowserSpeechVoiceProvider(
        typeof window === 'undefined' ? null : createWebSpeechEngine(window),
      ),
      new ElevenLabsVoiceProvider(),
    ]),
    playClip,
  };
}

let shared: MediaServices | null = null;

export const MediaServicesContext = createContext<MediaServices | null>(null);

export function useMediaServices(): MediaServices {
  const injected = useContext(MediaServicesContext);
  if (injected) return injected;
  shared ??= createBrowserMediaServices();
  return shared;
}
