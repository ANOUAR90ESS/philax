import { MediaProviderError } from '../errors';
import { call, callJson, malformed, type FetchLike } from '../http';
import type {
  AssetFacts,
  AvatarProvider,
  AvatarSession,
  AvatarSessionInput,
  AvatarSpeakInput,
  AvatarSpeakResult,
} from '../ports';

/** The subset of the WebSocket API this adapter uses (the Node 22 global satisfies it). */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}
export type SocketFactory = (url: string) => SocketLike;

export interface LiveAvatarOptions {
  apiKey: string | undefined;
  fetch?: FetchLike;
  socket?: SocketFactory;
  timeoutMs?: number;
  /** How long to wait for the session to report `connected`. */
  connectTimeoutMs?: number;
  baseUrl?: string;
}

interface Envelope<T> {
  code?: number;
  message?: string;
  data?: T | null;
}

interface ServerEvent {
  type?: string;
  state?: string;
  error?: { type?: string; message?: string };
}

interface Live {
  socket: SocketLike;
  listeners: Set<(event: ServerEvent) => void>;
  closed: boolean;
}

const OPEN = 1;
/** ≈1 s of 16-bit mono PCM at 24 kHz per `agent.speak` command (limit is 1 MB). */
const CHUNK_BYTES = 48_000;

/**
 * HeyGen LiveAvatar in LITE mode: LiveAvatar renders and lip-syncs the avatar
 * in real time; the speech audio is ours (ElevenLabs), sent over the session's
 * command WebSocket. The browser only receives the LiveKit room URL and a
 * session-scoped viewer token, never the API key.
 */
export class LiveAvatarProvider implements AvatarProvider {
  readonly name = 'liveavatar' as const;
  readonly kind = 'live' as const;
  readonly audioFormat = 'pcm_24000' as const;
  private readonly fetch: FetchLike;
  private readonly socket: SocketFactory;
  private readonly timeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly baseUrl: string;
  private readonly live = new Map<string, Live>();

  constructor(private readonly opts: LiveAvatarOptions) {
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.socket = opts.socket ?? ((url) => new WebSocket(url) as unknown as SocketLike);
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 20_000;
    this.baseUrl = opts.baseUrl ?? 'https://api.liveavatar.com';
  }

  get configured(): boolean {
    return Boolean(this.opts.apiKey);
  }

  private key(): string {
    if (!this.opts.apiKey)
      throw new MediaProviderError(this.name, 'not_configured', 'LIVEAVATAR_API_KEY is not set');
    return this.opts.apiKey;
  }

  private callOpts(signal?: AbortSignal) {
    return {
      provider: this.name,
      fetch: this.fetch,
      timeoutMs: this.timeoutMs,
      notFound: 'invalid_avatar' as const,
      signal,
    };
  }

  async createSession(input: AvatarSessionInput): Promise<AvatarSession> {
    const token = await callJson<Envelope<{ session_id?: string; session_token?: string }>>(
      `${this.baseUrl}/v1/sessions/token`,
      {
        method: 'POST',
        headers: { 'X-API-KEY': this.key(), 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'LITE',
          avatar_id: input.avatarId,
          is_sandbox: false,
          video_settings: { quality: 'high', encoding: 'H264' },
        }),
      },
      this.callOpts(input.signal),
    );
    const sessionToken = token.data?.session_token;
    if (!sessionToken) throw malformed(this.name, 'no session token');

    const started = await callJson<
      Envelope<{
        session_id?: string;
        livekit_url?: string;
        livekit_client_token?: string;
        max_session_duration?: number;
        ws_url?: string;
      }>
    >(
      `${this.baseUrl}/v1/sessions/start`,
      { method: 'POST', headers: { authorization: `Bearer ${sessionToken}` } },
      this.callOpts(input.signal),
    );
    const data = started.data;
    const sessionId = data?.session_id ?? token.data?.session_id;
    if (!data?.livekit_url || !data.livekit_client_token || !sessionId)
      throw malformed(this.name, 'no LiveKit room');
    if (!data.ws_url) {
      await this.stopSession(sessionId).catch(() => undefined);
      throw malformed(this.name, 'no command channel for a LITE session');
    }
    try {
      await this.connect(sessionId, data.ws_url, input.signal);
    } catch (err) {
      await this.stopSession(sessionId).catch(() => undefined);
      throw err;
    }
    return {
      sessionId,
      provider: this.name,
      kind: 'live',
      viewer: { livekitUrl: data.livekit_url, livekitToken: data.livekit_client_token },
      maxDurationSeconds: data.max_session_duration ?? null,
    };
  }

  /** Opens the command channel and waits until the session reports `connected`. */
  private connect(sessionId: string, url: string, signal?: AbortSignal): Promise<void> {
    const socket = this.socket(url);
    const live: Live = { socket, listeners: new Set(), closed: false };
    this.live.set(sessionId, live);
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      let parsed: ServerEvent;
      try {
        parsed = JSON.parse(event.data) as ServerEvent;
      } catch {
        return;
      }
      for (const l of [...live.listeners]) l(parsed);
    });
    socket.addEventListener('close', () => {
      live.closed = true;
      for (const l of [...live.listeners]) l({ type: 'socket.closed' });
    });
    return new Promise<void>((resolve, reject) => {
      const done = (err?: MediaProviderError) => {
        clearTimeout(timer);
        live.listeners.delete(listener);
        signal?.removeEventListener('abort', onAbort);
        if (err) reject(err);
        else resolve();
      };
      const listener = (e: ServerEvent) => {
        if (e.type === 'session.state_updated' && e.state === 'connected') done();
        else if (e.type === 'socket.closed' || e.state === 'disconnected')
          done(
            new MediaProviderError(this.name, 'unavailable', 'session closed before connecting'),
          );
        else if (e.type === 'error')
          done(new MediaProviderError(this.name, 'generation_failed', e.error?.type ?? 'error'));
      };
      const onAbort = () =>
        done(new MediaProviderError(this.name, 'timeout', 'session start cancelled'));
      const timer = setTimeout(
        () => done(new MediaProviderError(this.name, 'timeout', 'session did not connect')),
        this.connectTimeoutMs,
      );
      live.listeners.add(listener);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async speak(input: AvatarSpeakInput): Promise<AvatarSpeakResult> {
    const live = this.live.get(input.sessionId);
    if (!live || live.closed || live.socket.readyState !== OPEN)
      throw new MediaProviderError(this.name, 'unavailable', 'session is not connected');
    if (input.audio.format !== this.audioFormat)
      throw new MediaProviderError(this.name, 'generation_failed', 'audio must be 24 kHz PCM');

    const outcome = new Promise<'ended' | 'interrupted'>((resolve, reject) => {
      const finish = (result: 'ended' | 'interrupted' | MediaProviderError) => {
        clearTimeout(timer);
        live.listeners.delete(listener);
        input.signal?.removeEventListener('abort', onAbort);
        if (result instanceof MediaProviderError) reject(result);
        else resolve(result);
      };
      const listener = (e: ServerEvent) => {
        switch (e.type) {
          case 'agent.speak_started':
            input.onEvent?.({ type: 'speak_started' });
            return;
          case 'agent.speak_ended':
            input.onEvent?.({ type: 'speak_ended' });
            return finish('ended');
          case 'agent.speak_interrupted':
            input.onEvent?.({ type: 'speak_interrupted' });
            return finish('interrupted');
          case 'error':
            return finish(
              new MediaProviderError(this.name, 'generation_failed', e.error?.type ?? 'error'),
            );
          case 'socket.closed':
            return finish(new MediaProviderError(this.name, 'unavailable', 'session closed'));
        }
      };
      const onAbort = () => {
        this.interrupt(input.sessionId);
        finish('interrupted');
      };
      // Speaking takes as long as the audio; anything well past that is a stall.
      const timer = setTimeout(
        () => finish(new MediaProviderError(this.name, 'timeout', 'avatar did not finish')),
        input.audio.durationMs + 30_000,
      );
      live.listeners.add(listener);
      input.signal?.addEventListener('abort', onAbort, { once: true });
    });

    const { audio } = input.audio;
    for (let offset = 0; offset < audio.byteLength; offset += CHUNK_BYTES) {
      const chunk = Buffer.from(audio.subarray(offset, offset + CHUNK_BYTES)).toString('base64');
      live.socket.send(
        JSON.stringify({ type: 'agent.speak', event_id: input.eventId, audio: chunk }),
      );
    }
    live.socket.send(JSON.stringify({ type: 'agent.speak_end', event_id: input.eventId }));
    return { kind: 'live', eventId: input.eventId, outcome: await outcome };
  }

  interrupt(sessionId: string): void {
    const live = this.live.get(sessionId);
    if (live && !live.closed && live.socket.readyState === OPEN)
      live.socket.send(JSON.stringify({ type: 'agent.interrupt' }));
  }

  async stopSession(sessionId: string): Promise<void> {
    const live = this.live.get(sessionId);
    this.live.delete(sessionId);
    if (live && !live.closed) live.socket.close(1000, 'stopped');
    await call(
      `${this.baseUrl}/v1/sessions/stop`,
      {
        method: 'POST',
        headers: { 'X-API-KEY': this.key(), 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, reason: 'USER_CLOSED' }),
      },
      this.callOpts(),
    );
  }

  /** LiveAvatar does not document per-avatar gender; identity relies on the declared configuration. */
  describeAvatar(): Promise<AssetFacts | null> {
    return Promise.resolve(null);
  }
}
