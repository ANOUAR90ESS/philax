import { randomUUID } from 'node:crypto';
import { MediaProviderError } from '../errors';
import type { AvatarGateway, PreparedAvatar, PrepareAvatarInput } from '../gateways';
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

interface AvatarLook {
  id: string;
  gender: string | null;
  status: string | null;
  error: unknown;
}

/**
 * Avatar preparation through HeyGen (v3): a synthetic avatar look is generated
 * from the character's visual identity (`POST /v3/avatars`, type `prompt`)
 * and polled until it is ready. The look is used for rendered segments.
 */
export class HeyGenAvatarGateway implements AvatarGateway {
  readonly provider = 'heygen' as const;
  private readonly fetch: FetchLike;
  private readonly baseUrl: string;
  private readonly pollMs: number;
  private readonly maxWaitMs: number;

  constructor(
    private readonly opts: HeyGenVideoOptions & {
      enabled?: boolean;
      pollMs?: number;
      maxWaitMs?: number;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.baseUrl = opts.baseUrl ?? 'https://api.heygen.com';
    this.pollMs = opts.pollMs ?? 5000;
    this.maxWaitMs = opts.maxWaitMs ?? 5 * 60_000;
  }

  get canPrepare(): boolean {
    return (this.opts.enabled ?? true) && Boolean(this.opts.apiKey);
  }

  private headers(): Record<string, string> {
    if (!this.opts.apiKey)
      throw new MediaProviderError('heygen', 'not_configured', 'HEYGEN_API_KEY is not set');
    return { 'x-api-key': this.opts.apiKey, 'content-type': 'application/json' };
  }

  private callOpts() {
    return {
      provider: 'heygen' as const,
      fetch: this.fetch,
      timeoutMs: this.opts.timeoutMs ?? 60_000,
      notFound: 'invalid_avatar' as const,
    };
  }

  async prepareCharacterAvatar(input: PrepareAvatarInput): Promise<PreparedAvatar> {
    const created = await callJson<{ data?: { avatar_item?: Partial<AvatarLook> } }>(
      `${this.baseUrl}/v3/avatars`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          type: 'prompt',
          name: input.name,
          prompt: input.description.slice(0, 1000),
          aspect_ratio: '16:9',
        }),
      },
      this.callOpts(),
    );
    const lookId = created.data?.avatar_item?.id;
    if (!lookId) throw malformed('heygen', 'no avatar look id');
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    for (let waited = 0; waited <= this.maxWaitMs; waited += this.pollMs) {
      const look = await callJson<{ data?: Partial<AvatarLook> }>(
        `${this.baseUrl}/v3/avatars/looks/${encodeURIComponent(lookId)}`,
        { method: 'GET', headers: this.headers() },
        this.callOpts(),
      );
      const status = look.data?.status ?? null;
      if (status === 'failed')
        throw new MediaProviderError('heygen', 'generation_failed', 'avatar generation failed');
      // Public or finished looks carry no training status.
      if (status === 'completed' || status === null)
        return { avatarId: lookId, slot: 'avatarId', gender: look.data?.gender ?? null };
      await sleep(this.pollMs);
    }
    throw new MediaProviderError('heygen', 'timeout', 'avatar generation did not finish');
  }
}
