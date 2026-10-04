import { randomUUID } from 'node:crypto';
import type { Presentation } from '@philax/media';
import { MediaProviderError, type MediaFailure } from '../errors';
import type { AvatarGateway, PreparedAvatar, PrepareAvatarInput } from '../gateways';
import { call, callJson, malformed, type FetchLike } from '../http';
import type {
  AssetFacts,
  AvatarProvider,
  AvatarSession,
  AvatarSessionInput,
  AvatarSpeakInput,
  AvatarSpeakResult,
  VideoStatus,
} from '../ports';

export interface JoggAIOptions {
  apiKey: string | undefined;
  fetch?: FetchLike;
  timeoutMs?: number;
  baseUrl?: string;
}

/** JoggAI answers HTTP 200 with a business `code`; 0 is success. */
interface Envelope<T> {
  code?: number;
  msg?: string;
  data?: T | null;
}

const CODE_FAILURES: Record<number, MediaFailure> = {
  10105: 'invalid_api_key',
  18025: 'invalid_api_key',
  18020: 'quota_exceeded',
  40000: 'generation_failed',
  50000: 'unavailable',
};

/**
 * JoggAI stores avatar ids with their library: `public:<id>` (avatar_type 0) or
 * `custom:<id>` (avatar_type 1, which includes photo avatars). A bare number is
 * a custom avatar.
 */
export function parseJoggAvatarId(id: string): { avatarType: 0 | 1; avatarId: number } | null {
  const m = /^(?:(public|custom):)?(\d+)$/.exec(id.trim());
  if (!m) return null;
  return { avatarType: m[1] === 'public' ? 0 : 1, avatarId: Number(m[2]) };
}

class JoggAIClient {
  readonly fetch: FetchLike;
  readonly baseUrl: string;
  readonly timeoutMs: number;

  constructor(private readonly opts: JoggAIOptions) {
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.baseUrl = opts.baseUrl ?? 'https://api.jogg.ai';
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  get configured(): boolean {
    return Boolean(this.opts.apiKey);
  }

  private headers(json: boolean): Record<string, string> {
    if (!this.opts.apiKey)
      throw new MediaProviderError('joggai', 'not_configured', 'JOGGAI_API_KEY is not set');
    return json
      ? { 'x-api-key': this.opts.apiKey, 'content-type': 'application/json' }
      : { 'x-api-key': this.opts.apiKey };
  }

  async request<T>(
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: unknown; notFound?: MediaFailure; signal?: AbortSignal } = {},
  ): Promise<T> {
    const res = await callJson<Envelope<T> & Partial<T>>(
      `${this.baseUrl}${path}`,
      {
        method,
        headers: this.headers(opts.body !== undefined),
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      },
      {
        provider: 'joggai',
        fetch: this.fetch,
        timeoutMs: this.timeoutMs,
        notFound: opts.notFound ?? 'unavailable',
        signal: opts.signal,
      },
    );
    if (res.code !== undefined && res.code !== 0) {
      const failure =
        res.code === 10104 ? (opts.notFound ?? 'unavailable') : CODE_FAILURES[res.code];
      throw new MediaProviderError('joggai', failure ?? 'generation_failed', `code ${res.code}`);
    }
    // Most responses wrap the result in `data`; some return fields at the top level.
    return (res.data ?? res) as T;
  }

  /** A JoggAI voice id: required by the API even when the audio is supplied. */
  private voices = new Map<string, Promise<string>>();
  voiceFor(gender: 'male' | 'female' | null, signal?: AbortSignal): Promise<string> {
    const key = gender ?? 'any';
    let found = this.voices.get(key);
    if (!found) {
      found = this.request<{ voices?: { voice_id?: string }[] } | { voice_id?: string }[]>(
        'GET',
        `/v2/voices${gender ? `?gender=${gender}` : ''}`,
        { signal },
      ).then((data) => {
        const list = Array.isArray(data) ? data : (data.voices ?? []);
        const id = list.find((v) => v.voice_id)?.voice_id;
        if (!id) throw malformed('joggai', 'no voices listed');
        return id;
      });
      found.catch(() => this.voices.delete(key));
      this.voices.set(key, found);
    }
    return found;
  }
}

/**
 * JoggAI rendered avatar video: the turn's ElevenLabs audio is uploaded and
 * lip-synced by the character's avatar on a transparent background (WebM with
 * alpha), so the stage can place the speaker into its scene.
 */
export class JoggAIVideoAvatarProvider implements AvatarProvider {
  readonly name = 'joggai' as const;
  readonly kind = 'video' as const;
  readonly audioFormat = 'mp3_44100_128' as const;
  readonly transparent = true;
  private readonly client: JoggAIClient;
  /** A "session" only binds a character's avatar; nothing is open at JoggAI. */
  private readonly sessions = new Map<string, string>();

  constructor(opts: JoggAIOptions) {
    this.client = new JoggAIClient(opts);
  }

  get configured(): boolean {
    return this.client.configured;
  }

  createSession(input: AvatarSessionInput): Promise<AvatarSession> {
    if (!this.configured)
      throw new MediaProviderError(this.name, 'not_configured', 'JOGGAI_API_KEY is not set');
    if (!parseJoggAvatarId(input.avatarId))
      throw new MediaProviderError(this.name, 'invalid_avatar', 'not a JoggAI avatar id');
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
    const stored = this.sessions.get(input.sessionId);
    const avatar = stored ? parseJoggAvatarId(stored) : null;
    if (!avatar) throw new MediaProviderError(this.name, 'unavailable', 'unknown session');
    if (input.audio.format !== this.audioFormat)
      throw new MediaProviderError(this.name, 'generation_failed', 'audio must be mp3');

    // 1. A signed upload URL, then the audio itself.
    const upload = await this.client.request<{ sign_url?: string; asset_url?: string }>(
      'POST',
      '/v2/upload/asset',
      {
        body: {
          filename: `${input.eventId}.mp3`,
          content_type: 'audio/mpeg',
          file_size: input.audio.audio.byteLength,
        },
        signal: input.signal,
      },
    );
    if (!upload.sign_url || !upload.asset_url) throw malformed(this.name, 'no upload url');
    await call(
      upload.sign_url,
      {
        method: 'PUT',
        headers: { 'content-type': 'audio/mpeg' },
        body: Buffer.from(input.audio.audio),
      },
      {
        provider: this.name,
        fetch: this.client.fetch,
        timeoutMs: this.client.timeoutMs,
        signal: input.signal,
      },
    );

    // 2. The lip-synced render, transparent (screen_style 3: WebM with alpha).
    const video = await this.client.request<{ video_id?: string }>(
      'POST',
      '/v2/create_video_from_avatar',
      {
        body: {
          avatar: { avatar_type: avatar.avatarType, avatar_id: avatar.avatarId },
          voice: {
            type: 'audio',
            audio_url: upload.asset_url,
            voice_id: await this.client.voiceFor(null, input.signal),
          },
          aspect_ratio: 'landscape',
          screen_style: 3,
          caption: false,
        },
        notFound: 'invalid_avatar',
        signal: input.signal,
      },
    );
    if (!video.video_id) throw malformed(this.name, 'no video_id');
    return { kind: 'video', videoId: video.video_id };
  }

  async videoStatus(videoId: string, signal?: AbortSignal): Promise<VideoStatus> {
    const v = await this.client.request<{ status?: string; video_url?: string | null }>(
      'GET',
      `/v2/avatar_video/${encodeURIComponent(videoId)}`,
      { notFound: 'generation_failed', signal },
    );
    if (v.status === 'completed') {
      if (!v.video_url) throw malformed(this.name, 'completed video without url');
      return { status: 'completed', videoUrl: v.video_url, durationSeconds: null };
    }
    if (v.status === 'failed') return { status: 'failed', reason: 'failed' };
    return { status: v.status === 'processing' ? 'processing' : 'pending' };
  }

  stopSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    return Promise.resolve();
  }

  /** JoggAI does not report an avatar's gender; the recorded presentation is checked instead. */
  describeAvatar(): Promise<AssetFacts | null> {
    return Promise.resolve(null);
  }
}

function ageBand(age: number | null | undefined): string {
  if (!age) return 'Adult';
  if (age < 20) return 'Teenager';
  if (age < 35) return 'Young adult';
  if (age < 60) return 'Adult';
  return 'Elderly';
}

/**
 * Avatar preparation through JoggAI: a photo avatar is generated from the
 * character's visual identity (`/v2/photo_avatar/photo/generate`), then
 * animated (`/v2/photo_avatar/add_motion`), which yields the avatar id used for
 * rendered video. JoggAI only generates male or female photo avatars.
 */
export class JoggAIAvatarGateway implements AvatarGateway {
  readonly provider = 'joggai' as const;
  private readonly client: JoggAIClient;
  private readonly pollMs: number;
  private readonly maxWaitMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly opts: JoggAIOptions & {
      enabled?: boolean;
      pollMs?: number;
      maxWaitMs?: number;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {
    this.client = new JoggAIClient(opts);
    this.pollMs = opts.pollMs ?? 5000;
    this.maxWaitMs = opts.maxWaitMs ?? 10 * 60_000;
    this.sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  }

  get canPrepare(): boolean {
    return (this.opts.enabled ?? true) && this.client.configured;
  }

  supports(presentation: Presentation): boolean {
    return presentation === 'male' || presentation === 'female';
  }

  private async poll<T>(check: () => Promise<T | null>): Promise<T> {
    for (let waited = 0; waited <= this.maxWaitMs; waited += this.pollMs) {
      const done = await check();
      if (done !== null) return done;
      await this.sleep(this.pollMs);
    }
    throw new MediaProviderError('joggai', 'timeout', 'avatar generation did not finish');
  }

  async prepareCharacterAvatar(input: PrepareAvatarInput): Promise<PreparedAvatar> {
    if (!this.supports(input.presentation))
      throw new MediaProviderError('joggai', 'not_configured', 'presentation not supported');
    const gender = input.presentation as 'male' | 'female';

    const generated = await this.client.request<{ photo_id?: string }>(
      'POST',
      '/v2/photo_avatar/photo/generate',
      {
        body: {
          age: ageBand(input.approximateAge),
          gender: gender === 'male' ? 'Male' : 'Female',
          avatar_style: 'Professional',
          model: 'classic',
          aspect_ratio: 'landscape',
          background: 'plain neutral studio background',
          appearance: input.description.slice(0, 1000),
        },
      },
    );
    if (!generated.photo_id) throw malformed('joggai', 'no photo_id');
    const photoId = generated.photo_id;

    const imageUrl = await this.poll(async () => {
      const p = await this.client.request<{ status?: string; image_url_list?: string[] }>(
        'GET',
        `/v2/photo_avatar/photo?photo_id=${encodeURIComponent(photoId)}`,
      );
      if (p.status === 'error')
        throw new MediaProviderError('joggai', 'generation_failed', 'photo generation failed');
      if (p.status !== 'success') return null;
      const url = p.image_url_list?.[0];
      if (!url) throw malformed('joggai', 'photo without image');
      return url;
    });

    const motion = await this.client.request<{ motion_id?: string; avatar_id?: number }>(
      'POST',
      '/v2/photo_avatar/add_motion',
      {
        body: {
          photo_id: photoId,
          image_url: imageUrl,
          name: input.name,
          voice_id: await this.client.voiceFor(gender),
          model: '2.0-Pro',
        },
      },
    );
    if (!motion.motion_id) throw malformed('joggai', 'no motion_id');
    const motionId = motion.motion_id;

    const avatarId = await this.poll(async () => {
      const m = await this.client.request<{ status?: string; avatar_id?: number }>(
        'GET',
        `/v2/photo_avatar?motion_id=${encodeURIComponent(motionId)}`,
      );
      if (m.status === 'failed')
        throw new MediaProviderError('joggai', 'generation_failed', 'avatar motion failed');
      if (m.status !== 'completed') return null;
      const id = m.avatar_id ?? motion.avatar_id;
      if (typeof id !== 'number') throw malformed('joggai', 'no avatar_id');
      return id;
    });

    // Generated with the character's presentation; JoggAI reports no gender of its own.
    return { avatarId: `custom:${avatarId}`, slot: 'avatarId', gender };
  }
}
