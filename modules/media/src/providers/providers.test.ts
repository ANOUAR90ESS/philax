import { describe, expect, it } from 'vitest';
import { MediaProviderError } from '../errors';
import type { FetchLike } from '../http';
import { ElevenLabsVoiceGateway, ElevenLabsVoiceProvider } from './elevenlabs';
import { HeyGenAvatarGateway, HeyGenVideoAvatarProvider } from './heygen-video';
import { LiveAvatarProvider, type SocketLike } from './liveavatar';

// Mocked transports: automated tests only.
function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function fetchMock(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fn: FetchLike = (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { fn, calls };
}

async function failure(p: Promise<unknown>): Promise<MediaProviderError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof MediaProviderError) return err;
    throw err;
  }
  throw new Error('expected a provider error');
}

const settings = { speed: 0.9, stability: 0.55, style: 0.3 };
const alignment = {
  characters: ['H', 'i'],
  character_start_times_seconds: [0, 0.1],
  character_end_times_seconds: [0.1, 0.4],
};

describe('ElevenLabsVoiceProvider', () => {
  it('calls text-to-speech with timestamps and returns audio with its alignment', async () => {
    const { fn, calls } = fetchMock(
      json({ audio_base64: Buffer.from('mp3-bytes').toString('base64'), alignment }),
    );
    const voice = new ElevenLabsVoiceProvider({
      apiKey: 'k',
      modelId: 'eleven_multilingual_v2',
      fetch: fn,
    });
    const result = await voice.synthesize({
      voiceId: 'voice-1',
      text: 'Hi',
      language: 'ar',
      format: 'mp3_44100_128',
      settings,
    });
    expect(Buffer.from(result.audio).toString()).toBe('mp3-bytes');
    expect(result.alignment).toEqual(alignment);
    expect(result.durationMs).toBe(400);
    const call = calls[0];
    expect(call?.url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/voice-1/with-timestamps?output_format=mp3_44100_128',
    );
    expect(new Headers(call?.init?.headers).get('xi-api-key')).toBe('k');
    expect(JSON.parse(String(call?.init?.body))).toMatchObject({
      text: 'Hi',
      model_id: 'eleven_multilingual_v2',
      language_code: 'ar',
      voice_settings: { speed: 0.9, stability: 0.55, style: 0.3 },
    });
  });

  it('reports a missing key as not configured without calling the API', async () => {
    const { fn, calls } = fetchMock();
    const voice = new ElevenLabsVoiceProvider({ apiKey: undefined, modelId: 'm', fetch: fn });
    expect(voice.configured).toBe(false);
    const err = await failure(voice.describeVoice('v'));
    expect(err.code).toBe('not_configured');
    expect(calls).toHaveLength(0);
  });

  it.each([
    [json({ detail: { status: 'invalid_api_key' } }, 401), 'invalid_api_key'],
    [json({ detail: { status: 'quota_exceeded' } }, 401), 'quota_exceeded'],
    [json({ detail: { status: 'voice_not_found' } }, 404), 'invalid_voice'],
    [json({}, 503), 'unavailable'],
    [json({ detail: 'bad' }, 422), 'generation_failed'],
  ] as const)('classifies provider errors (%#)', async (res, code) => {
    const voice = new ElevenLabsVoiceProvider({
      apiKey: 'k',
      modelId: 'm',
      fetch: fetchMock(res).fn,
    });
    const err = await failure(
      voice.synthesize({
        voiceId: 'v',
        text: 't',
        language: 'en',
        format: 'mp3_44100_128',
        settings,
      }),
    );
    expect(err.code).toBe(code);
  });

  it('honours Retry-After on rate limits', async () => {
    const voice = new ElevenLabsVoiceProvider({
      apiKey: 'k',
      modelId: 'm',
      fetch: fetchMock(json({}, 429, { 'retry-after': '3' })).fn,
    });
    const err = await failure(voice.describeVoice('v'));
    expect(err.code).toBe('rate_limited');
    expect(err.retryAfterMs).toBe(3000);
    expect(err.retryable).toBe(true);
  });

  it('times out a provider that does not answer', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    const voice = new ElevenLabsVoiceProvider({
      apiKey: 'k',
      modelId: 'm',
      fetch: hang,
      timeoutMs: 20,
    });
    expect((await failure(voice.describeVoice('v'))).code).toBe('timeout');
  });

  it('maps network failures to unavailable', async () => {
    const voice = new ElevenLabsVoiceProvider({
      apiKey: 'k',
      modelId: 'm',
      fetch: fetchMock(new TypeError('fetch failed')).fn,
    });
    expect((await failure(voice.describeVoice('v'))).code).toBe('unavailable');
  });

  it('reads the gender label of a voice', async () => {
    const voice = new ElevenLabsVoiceProvider({
      apiKey: 'k',
      modelId: 'm',
      fetch: fetchMock(json({ name: 'Archivist', labels: { gender: 'female' } })).fn,
    });
    expect(await voice.describeVoice('v')).toEqual({ name: 'Archivist', gender: 'female' });
  });
});

class FakeSocket implements SocketLike {
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  private listeners: Record<string, ((e: { data: unknown }) => void)[]> = {};
  addEventListener(type: string, l: (e: { data: unknown }) => void) {
    (this.listeners[type] ??= []).push(l);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close() {
    this.readyState = 3;
    this.emit('close', {});
  }
  emit(type: string, payload: unknown) {
    for (const l of this.listeners[type] ?? [])
      l({ data: type === 'message' ? JSON.stringify(payload) : undefined });
  }
}

describe('LiveAvatarProvider (LITE)', () => {
  function setup() {
    const socket = new FakeSocket();
    const { fn, calls } = fetchMock(
      json({ code: 100, data: { session_id: 's-1', session_token: 'tok' } }),
      json(
        {
          code: 100,
          data: {
            session_id: 's-1',
            livekit_url: 'wss://room',
            livekit_client_token: 'viewer',
            ws_url: 'wss://cmd',
          },
        },
        201,
      ),
      json({ code: 100, data: null }),
    );
    const provider = new LiveAvatarProvider({
      apiKey: 'la-key',
      fetch: fn,
      socket: () => {
        // The session reports `connected` once its command channel is open.
        setTimeout(
          () => socket.emit('message', { type: 'session.state_updated', state: 'connected' }),
          0,
        );
        return socket;
      },
    });
    return { provider, socket, calls };
  }

  it('starts a session, waits for connected, and hands out only the viewer credentials', async () => {
    const { provider, calls } = setup();
    const session = await provider.createSession({ characterId: 'c', avatarId: 'avatar-1' });
    expect(session).toEqual({
      sessionId: 's-1',
      provider: 'liveavatar',
      kind: 'live',
      viewer: { livekitUrl: 'wss://room', livekitToken: 'viewer' },
      maxDurationSeconds: null,
    });
    expect(calls[0]?.url).toBe('https://api.liveavatar.com/v1/sessions/token');
    expect(new Headers(calls[0]?.init?.headers).get('x-api-key')).toBe('la-key');
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      mode: 'LITE',
      avatar_id: 'avatar-1',
    });
    expect(new Headers(calls[1]?.init?.headers).get('authorization')).toBe('Bearer tok');
  });

  it('streams PCM in ≈1 s chunks and resolves when the avatar finishes speaking', async () => {
    const { provider, socket } = setup();
    await provider.createSession({ characterId: 'c', avatarId: 'a' });

    const events: string[] = [];
    const audio = new Uint8Array(100_000);
    const speaking = provider.speak({
      sessionId: 's-1',
      audio: {
        audio,
        format: 'pcm_24000',
        mimeType: 'audio/pcm',
        alignment: null,
        durationMs: 2083,
      },
      eventId: 'e-1',
      onEvent: (e) => events.push(e.type),
    });
    expect(socket.sent.map((m) => m.type)).toEqual([
      'agent.speak',
      'agent.speak',
      'agent.speak',
      'agent.speak_end',
    ]);
    expect(socket.sent[0]?.event_id).toBe('e-1');
    socket.emit('message', { type: 'agent.speak_started' });
    socket.emit('message', { type: 'agent.speak_ended' });
    await expect(speaking).resolves.toEqual({ kind: 'live', eventId: 'e-1', outcome: 'ended' });
    expect(events).toEqual(['speak_started', 'speak_ended']);

    await provider.stopSession('s-1');
    expect(socket.readyState).toBe(3);
  });

  it('refuses mp3 audio and fails when the session reports an error', async () => {
    const { provider, socket } = setup();
    await provider.createSession({ characterId: 'c', avatarId: 'a' });
    const mp3 = {
      audio: new Uint8Array(4),
      format: 'mp3_44100_128' as const,
      mimeType: 'audio/mpeg',
      alignment: null,
      durationMs: 1,
    };
    expect(
      (await failure(provider.speak({ sessionId: 's-1', audio: mp3, eventId: 'x' }))).code,
    ).toBe('generation_failed');
    const pcm = { ...mp3, format: 'pcm_24000' as const };
    const speaking = provider.speak({ sessionId: 's-1', audio: pcm, eventId: 'y' });
    socket.emit('message', { type: 'error', error: { type: 'server_error', message: 'x' } });
    expect((await failure(speaking)).code).toBe('generation_failed');
  });

  it('treats an unknown avatar as invalid', async () => {
    const provider = new LiveAvatarProvider({
      apiKey: 'k',
      fetch: fetchMock(json({ code: 404 }, 404)).fn,
      socket: () => new FakeSocket(),
    });
    expect(
      (await failure(provider.createSession({ characterId: 'c', avatarId: 'nope' }))).code,
    ).toBe('invalid_avatar');
  });
});

describe('HeyGenVideoAvatarProvider (v3)', () => {
  it('uploads the voice audio, renders it with the avatar look and reports the result', async () => {
    const { fn, calls } = fetchMock(
      json({ data: { asset_id: 'asset-1', url: 'u' } }),
      json({ data: { video_id: 'video-1', status: 'waiting' } }),
      json({ data: { status: 'completed', video_url: 'https://cdn/v.mp4', duration: 3.2 } }),
    );
    const provider = new HeyGenVideoAvatarProvider({ apiKey: 'hg', fetch: fn });
    const session = await provider.createSession({ characterId: 'c', avatarId: 'look-1' });
    const result = await provider.speak({
      sessionId: session.sessionId,
      audio: {
        audio: new Uint8Array([1, 2]),
        format: 'mp3_44100_128',
        mimeType: 'audio/mpeg',
        alignment: null,
        durationMs: 10,
      },
      eventId: 'e',
    });
    expect(result).toEqual({ kind: 'video', videoId: 'video-1' });
    expect(calls[0]?.url).toBe('https://api.heygen.com/v3/assets');
    expect(calls[0]?.init?.body).toBeInstanceOf(FormData);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      type: 'avatar',
      avatar_id: 'look-1',
      audio_asset_id: 'asset-1',
      resolution: '720p',
    });
    expect(await provider.videoStatus('video-1')).toEqual({
      status: 'completed',
      videoUrl: 'https://cdn/v.mp4',
      durationSeconds: 3.2,
    });
  });

  it('reads the gender of an avatar look', async () => {
    const provider = new HeyGenVideoAvatarProvider({
      apiKey: 'hg',
      fetch: fetchMock(json({ data: { name: 'Look', gender: 'male' } })).fn,
    });
    expect(await provider.describeAvatar('look-1')).toEqual({ name: 'Look', gender: 'male' });
  });
});

describe('preparation gateways', () => {
  it('designs, saves and checks a character voice with ElevenLabs', async () => {
    const { fn, calls } = fetchMock(
      json({ previews: [{ generated_voice_id: 'gen-1', audio_base_64: 'AA==' }] }),
      json({ voice_id: 'voice-9' }),
      json({ name: 'Philax · karl-marx', labels: { gender: 'male' } }),
    );
    const gateway = new ElevenLabsVoiceGateway(
      new ElevenLabsVoiceProvider({ apiKey: 'k', modelId: 'm', fetch: fn }),
    );
    expect(gateway.canPrepare).toBe(true);
    const voice = await gateway.prepareCharacterVoice({
      characterSlug: 'karl-marx',
      name: 'Philax · karl-marx',
      description: 'A mature male speaker, forceful and sardonic.',
      presentation: 'male',
    });
    expect(voice).toEqual({ voiceId: 'voice-9', gender: 'male' });
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.elevenlabs.io/v1/text-to-voice/design',
      'https://api.elevenlabs.io/v1/text-to-voice',
      'https://api.elevenlabs.io/v1/voices/voice-9',
    ]);
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({
      generated_voice_id: 'gen-1',
      labels: { gender: 'male' },
    });
  });

  it('cannot prepare voices without a key or when disabled', () => {
    expect(
      new ElevenLabsVoiceGateway(new ElevenLabsVoiceProvider({ apiKey: undefined, modelId: 'm' }))
        .canPrepare,
    ).toBe(false);
    expect(
      new ElevenLabsVoiceGateway(new ElevenLabsVoiceProvider({ apiKey: 'k', modelId: 'm' }), false)
        .canPrepare,
    ).toBe(false);
  });

  it('generates a HeyGen avatar look from a prompt and waits until it is ready', async () => {
    const { fn, calls } = fetchMock(
      json({
        data: { avatar_item: { id: 'look-1', status: 'processing' }, avatar_group: { id: 'g' } },
      }),
      json({ data: { id: 'look-1', status: 'processing', gender: null } }),
      json({ data: { id: 'look-1', status: 'completed', gender: 'female' } }),
    );
    const gateway = new HeyGenAvatarGateway({
      apiKey: 'hg',
      fetch: fn,
      sleep: () => Promise.resolve(),
    });
    const avatar = await gateway.prepareCharacterAvatar({
      characterSlug: 'hannah-arendt',
      name: 'Philax · hannah-arendt',
      description: 'Photorealistic portrait of a female thinker around 60 years old.',
      presentation: 'female',
    });
    expect(avatar).toEqual({ avatarId: 'look-1', slot: 'avatarId', gender: 'female' });
    expect(calls[0]?.url).toBe('https://api.heygen.com/v3/avatars');
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      type: 'prompt',
      name: 'Philax · hannah-arendt',
    });
    expect(calls[2]?.url).toBe('https://api.heygen.com/v3/avatars/looks/look-1');
  });

  it('reports a failed avatar generation', async () => {
    const { fn } = fetchMock(
      json({ data: { avatar_item: { id: 'look-1' } } }),
      json({ data: { id: 'look-1', status: 'failed' } }),
    );
    const gateway = new HeyGenAvatarGateway({
      apiKey: 'hg',
      fetch: fn,
      sleep: () => Promise.resolve(),
    });
    const err = await failure(
      gateway.prepareCharacterAvatar({
        characterSlug: 'x',
        name: 'x',
        description: 'x',
        presentation: 'male',
      }),
    );
    expect(err.code).toBe('generation_failed');
  });
});
