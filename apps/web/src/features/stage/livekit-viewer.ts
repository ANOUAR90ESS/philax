import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import type { LiveViewer } from './playback';

/**
 * Watches a real-time avatar session: joins the provider's LiveKit room with
 * the session-scoped viewer token and shows the avatar's video and audio.
 */
export function createLiveKitViewer(): LiveViewer {
  const room = new Room({ adaptiveStream: true });
  let audio: HTMLMediaElement | null = null;
  let muted = false;
  let video: HTMLVideoElement | null = null;
  const attach = (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Video && video) track.attach(video);
    if (track.kind === Track.Kind.Audio) {
      audio = track.attach();
      audio.muted = muted;
    }
  };
  room.on(RoomEvent.TrackSubscribed, attach);
  return {
    async connect(url, token, element) {
      video = element;
      await room.connect(url, token);
      for (const p of room.remoteParticipants.values())
        for (const pub of p.trackPublications.values()) if (pub.track) attach(pub.track);
    },
    setMuted(value) {
      muted = value;
      if (audio) audio.muted = value;
    },
    async disconnect() {
      audio?.remove();
      audio = null;
      await room.disconnect();
    },
  };
}
