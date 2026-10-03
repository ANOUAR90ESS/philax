import { randomUUID } from 'node:crypto';
import { MediaProviderError } from '../errors';
import { callJson, malformed, type FetchLike } from '../http';
import type {
  AssetFacts,
  AvatarProvider,
  AvatarSession,
  AvatarSessionInput,
  AvatarSpeakInput,
  AvatarSpeakResult,
  VideoStatus,
} from '../ports';

export interface HeyGenVideoOptions {
  apiKey: string | undefined;
  fetch?: FetchLike;
  timeoutMs?: number;
  baseUrl?: string;
}

type Wrapped<T> = { data?: T | null } & Partial<T>;

function unwrap<T>(body: Wrapped<T>): Partial<T> {
  return body.data ?? body;
}

/**
 * HeyGen avatar video segments (v3): the turn's ElevenLabs audio is uploaded
 * as an asset and rendered, lip-synced, by the character's avatar look. Used
 * when real-time sessions are not wanted; renders are cached per turn.
 */
export class HeyGenVideoAvatarProvider implements AvatarProvider {
  readonly name = 'heygen' as const;
  readonly kind = 'video' as const;
  readonly audioFormat = 'mp3_44100_128' as const;
  private readonly fetch: FetchLike;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  /** A "session" here only binds a character's avatar look; nothing is open at HeyGen. */
  private readonly sessions = new Map<string, string>();

  constructor(private readonly opts: HeyGenVideoOptions) {
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.baseUrl = opts.baseUrl ?? 'https://api.heygen.com';
  }

  get configured(): boolean {
    return Boolean(this.opts.apiKey);
  }

  private key(): string {
    if (!this.opts.apiKey)
      throw new MediaProviderError(this.name, 'not_configured', 'HEYGEN_API_KEY is not set');
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

  createSession(input: AvatarSessionInput): Promise<AvatarSession> {
    this.key();
    const sessionId = randomUUID();
    this.sessions.set(sessionId, input.avatarId);
    return Promise.resolve({
      sessionId,
      provider: this.name,
      kind: 'video',
      viewer: null,
      maxDurationSeconds: null,
    });
  }

  async speak(input: AvatarSpeakInput): Promise<AvatarSpeakResult> {
    const avatarId = this.sessions.get(input.sessionId);
    if (!avatarId) throw new MediaProviderError(this.name, 'unavailable', 'unknown session');
    if (input.audio.format !== this.audioFormat)
      throw new MediaProviderError(this.name, 'generation_failed', 'audio must be mp3');

    const form = new FormData();
    form.append(
      'file',
      new Blob([Buffer.from(input.audio.audio)], { type: 'audio/mpeg' }),
      'speech.mp3',
    );
    const asset = unwrap(
      await callJson<Wrapped<{ asset_id: string }>>(
        `${this.baseUrl}/v3/assets`,
        {
          method: 'POST',
          headers: { 'x-api-key': this.key(), 'idempotency-key': input.eventId },
          body: form,
        },
        this.callOpts(input.signal),
      ),
    );
    if (!asset.asset_id) throw malformed(this.name, 'no asset_id');

    const video = unwrap(
      await callJson<Wrapped<{ video_id: string }>>(
        `${this.baseUrl}/v3/videos`,
        {
          method: 'POST',
          headers: { 'x-api-key': this.key(), 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'avatar',
            avatar_id: avatarId,
            audio_asset_id: asset.asset_id,
            resolution: '720p',
          }),
        },
        this.callOpts(input.signal),
      ),
    );
    if (!video.video_id) throw malformed(this.name, 'no video_id');
    return { kind: 'video', videoId: video.video_id };
  }

  async videoStatus(videoId: string, signal?: AbortSignal): Promise<VideoStatus> {
    const v = unwrap(
      await callJson<
        Wrapped<{
          status: string;
          video_url: string | null;
          duration: number | null;
          failure_code: string | null;
          failure_message: string | null;
        }>
      >(
        `${this.baseUrl}/v3/videos/${encodeURIComponent(videoId)}`,
        { method: 'GET', headers: { 'x-api-key': this.key() } },
        { ...this.callOpts(signal), notFound: 'generation_failed' },
      ),
    );
    if (v.status === 'completed') {
      if (!v.video_url) throw malformed(this.name, 'completed video without url');
      return { status: 'completed', videoUrl: v.video_url, durationSeconds: v.duration ?? null };
    }
    if (v.status === 'failed')
      return { status: 'failed', reason: v.failure_code ?? v.failure_message ?? 'failed' };
    return { status: v.status === 'processing' ? 'processing' : 'pending' };
  }

  stopSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    return Promise.resolve();
  }

  async describeAvatar(avatarId: string, signal?: AbortSignal): Promise<AssetFacts | null> {
    const look = unwrap(
      await callJson<Wrapped<{ name: string | null; gender: string | null }>>(
        `${this.baseUrl}/v3/avatars/looks/${encodeURIComponent(avatarId)}`,
        { method: 'GET', headers: { 'x-api-key': this.key() } },
        this.callOpts(signal),
      ),
    );
    return { name: look.name ?? null, gender: look.gender ?? null };
  }
}
