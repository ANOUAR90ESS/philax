import type {
  CreateChallengeRequest,
  CreateDebateRequest,
  DebateListItem,
  DebateStreamEvent,
  DebateView,
} from '@philax/types';
import { apiRequest } from './client';
import { streamEvents } from './sse';

type Input = Omit<CreateDebateRequest, 'mode'> & { mode?: CreateDebateRequest['mode'] };

export const debatesApi = {
  create: (body: Input) => apiRequest<{ debate: DebateView }>('POST', '/api/debates', body),
  createChallenge: (body: CreateChallengeRequest) =>
    apiRequest<{ debate: DebateView }>('POST', '/api/challenges', body),
  get: (id: string) => apiRequest<{ debate: DebateView }>('GET', `/api/debates/${id}`),
  list: () => apiRequest<{ debates: DebateListItem[] }>('GET', '/api/debates'),
  setSaved: (id: string, saved: boolean) =>
    apiRequest<{ saved: boolean }>('POST', `/api/debates/${id}/save`, { saved }),
  remove: (id: string) => apiRequest<undefined>('DELETE', `/api/debates/${id}`),
  trackSourceOpened: (id: string) =>
    apiRequest<undefined>('POST', `/api/debates/${id}/events`, { event: 'source_opened' }),
  /** Advances the state machine one step (prepare → rounds → synthesis), streaming progress. */
  advance: (id: string, onEvent: (e: DebateStreamEvent) => void, signal?: AbortSignal) =>
    streamEvents(`/api/debates/${id}/advance`, {}, onEvent, signal),
  sendMessage: (
    id: string,
    content: string,
    onEvent: (e: DebateStreamEvent) => void,
    signal?: AbortSignal,
  ) => streamEvents(`/api/debates/${id}/messages`, { content }, onEvent, signal),
};
