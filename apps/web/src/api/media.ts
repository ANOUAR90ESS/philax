import type {
  AvatarSessionRequest,
  AvatarSessionResponse,
  AvatarSpeakEvent,
  CharacterMediaView,
  MediaStatus,
  SpeechRequest,
  SpeechResponse,
  VideoSegmentResponse,
} from '@philax/types';
import { apiRequest } from './client';
import { streamEvents } from './sse';

/**
 * Character media goes through the Philax API only. The browser never holds a
 * provider key: it receives audio, a rendered video URL, or a session-scoped
 * real-time viewer token.
 */
export const mediaApi = {
  status: () => apiRequest<{ status: MediaStatus }>('GET', '/api/media/status'),
  cast: (debateId: string) =>
    apiRequest<{ status: MediaStatus; cast: CharacterMediaView[] }>(
      'GET',
      `/api/media/debates/${debateId}/cast`,
    ),
  speech: (body: SpeechRequest, signal?: AbortSignal) =>
    apiRequest<{ speech: SpeechResponse }>('POST', '/api/media/speech', body, signal),
  openSession: (body: AvatarSessionRequest) =>
    apiRequest<{ session: AvatarSessionResponse }>('POST', '/api/media/avatar/sessions', body),
  speak: (
    sessionId: string,
    body: SpeechRequest,
    onEvent: (e: AvatarSpeakEvent) => void,
    signal?: AbortSignal,
  ) =>
    streamEvents<AvatarSpeakEvent>(
      `/api/media/avatar/sessions/${encodeURIComponent(sessionId)}/speak`,
      body,
      onEvent,
      signal,
    ),
  interrupt: (sessionId: string) =>
    apiRequest<undefined>(
      'POST',
      `/api/media/avatar/sessions/${encodeURIComponent(sessionId)}/interrupt`,
    ),
  closeSession: (sessionId: string) =>
    apiRequest<undefined>('DELETE', `/api/media/avatar/sessions/${encodeURIComponent(sessionId)}`),
  renderVideo: (body: SpeechRequest) =>
    apiRequest<{ video: VideoSegmentResponse }>('POST', '/api/media/videos', body),
  videoStatus: (jobId: string) =>
    apiRequest<{ video: VideoSegmentResponse }>('GET', `/api/media/videos/${jobId}`),
};

export type MediaApi = typeof mediaApi;
