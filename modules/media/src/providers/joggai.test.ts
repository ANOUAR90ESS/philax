import { describe, expect, it } from 'vitest';
import { MediaProviderError } from '../errors';
import type { FetchLike } from '../http';
import { JoggAIAvatarGateway, JoggAIVideoAvatarProvider, parseJoggAvatarId } from './joggai';

// Mocked transports: automated tests only.
const ok = (data: unknown) =>
  new Response(JSON.stringify({ code: 0, msg: 'success', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
const fail = (code: number) =>
  new Response(JSON.stringify({ code, msg: 'error', data: null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function fetchMock(...responses: Response[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fn: FetchLike = (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return Promise.resolve(next);
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

const audio = {
  audio: new Uint8Array([1, 2, 3]),
  format: 'mp3_44100_128' as const,
  mimeType: 'audio/mpeg',
  alignment: null,
  durationMs: 10,
};

describe('parseJoggAvatarId', () => {
  it('reads the avatar library from the stored id', () => {
    expect(parseJoggAvatarId('public:127')).toEqual({ avatarType: 0, avatarId: 127 });
    expect(parseJoggAvatarId('custom:9')).toEqual({ avatarType: 1, avatarId: 9 });
    expect(parseJoggAvatarId('42')).toEqual({ avatarType: 1, avatarId: 42 });
    expect(parseJoggAvatarId('look-1')).toBeNull();
  });
});

describe('JoggAIVideoAvatarProvider', () => {
  it('uploads the voice audio and renders it on a transparent background', async () => {
    const { fn, calls } = fetchMock(
      ok({ sign_url: 'https://upload.example/signed', asset_url: 'https://cdn.example/a.mp3' }),
      new Response(null, { status: 200 }),
      ok([{ voice_id: 'en-US-1', gender: 'male' }]),
      ok({ video_id: 'v-1' }),
      ok({ status: 'processing' }),
      ok({ status: 'completed', video_url: 'https://cdn.example/v.webm' }),
    );
    const provider = new JoggAIVideoAvatarProvider({ apiKey: 'jg', fetch: fn });
    expect(provider.transparent).toBe(true);
    const session = await provider.createSession({ characterId: 'c', avatarId: 'custom:77' });
    const result = await provider.speak({ sessionId: session.sessionId, audio, eventId: 'turn-1' });

    expect(result).toEqual({ kind: 'video', videoId: 'v-1' });
    expect(calls[0]?.url).toBe('https://api.jogg.ai/v2/upload/asset');
    expect((calls[0]?.init?.headers as Record<string, string>)['x-api-key']).toBe('jg');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      filename: 'turn-1.mp3',
      content_type: 'audio/mpeg',
      file_size: 3,
    });
    expect(calls[1]).toMatchObject({ url: 'https://upload.example/signed' });
    expect(calls[1]?.init?.method).toBe('PUT');
    // The signed upload URL never receives the API key.
    expect(JSON.stringify(calls[1]?.init?.headers)).not.toContain('jg');
    expect(calls[3]?.url).toBe('https://api.jogg.ai/v2/create_video_from_avatar');
    expect(JSON.parse(String(calls[3]?.init?.body))).toEqual({
      avatar: { avatar_type: 1, avatar_id: 77 },
      voice: { type: 'audio', audio_url: 'https://cdn.example/a.mp3', voice_id: 'en-US-1' },
      aspect_ratio: 'landscape',
      screen_style: 3,
      caption: false,
    });

    expect(await provider.videoStatus('v-1')).toEqual({ status: 'processing' });
    expect(await provider.videoStatus('v-1')).toEqual({
      status: 'completed',
      videoUrl: 'https://cdn.example/v.webm',
      durationSeconds: null,
    });
    expect(calls[4]?.url).toBe('https://api.jogg.ai/v2/avatar_video/v-1');
  });

  it('refuses ids that are not JoggAI avatars and works only with a key', async () => {
    const provider = new JoggAIVideoAvatarProvider({ apiKey: 'jg', fetch: fetchMock().fn });
    expect(() => provider.createSession({ characterId: 'c', avatarId: 'look-1' })).toThrow(
      expect.objectContaining({ code: 'invalid_avatar' }),
    );
    const unconfigured = new JoggAIVideoAvatarProvider({ apiKey: undefined });
    expect(unconfigured.configured).toBe(false);
    expect(() => unconfigured.createSession({ characterId: 'c', avatarId: '1' })).toThrow(
      expect.objectContaining({ code: 'not_configured' }),
    );
  });

  it('maps JoggAI error codes', async () => {
    const cases: [number, string][] = [
      [10105, 'invalid_api_key'],
      [18020, 'quota_exceeded'],
      [10104, 'generation_failed'],
      [50000, 'unavailable'],
    ];
    for (const [code, expected] of cases) {
      const { fn } = fetchMock(fail(code));
      const provider = new JoggAIVideoAvatarProvider({ apiKey: 'jg', fetch: fn });
      expect((await failure(provider.videoStatus('v'))).code).toBe(expected);
    }
  });

  it('reports a failed render', async () => {
    const { fn } = fetchMock(ok({ status: 'failed' }));
    const provider = new JoggAIVideoAvatarProvider({ apiKey: 'jg', fetch: fn });
    expect(await provider.videoStatus('v')).toEqual({ status: 'failed', reason: 'failed' });
  });
});

describe('JoggAIAvatarGateway', () => {
  const input = {
    characterSlug: 'hannah-arendt',
    name: 'Philax · hannah-arendt',
    description: 'Photorealistic portrait of a female thinker around 60 years old.',
    presentation: 'female' as const,
    approximateAge: 62,
  };

  it('generates a photo avatar, animates it and returns its custom avatar id', async () => {
    const { fn, calls } = fetchMock(
      ok({ photo_id: 'p-1' }),
      ok({ status: 'in_progress' }),
      ok({ status: 'success', image_url_list: ['https://cdn.example/p.png'] }),
      ok({ voices: [{ voice_id: 'f-1' }] }),
      ok({ motion_id: 'm-1' }),
      ok({ status: 'processing' }),
      ok({ status: 'completed', avatar_id: 501 }),
    );
    const gateway = new JoggAIAvatarGateway({
      apiKey: 'jg',
      fetch: fn,
      sleep: () => Promise.resolve(),
    });
    expect(gateway.canPrepare).toBe(true);
    expect(await gateway.prepareCharacterAvatar(input)).toEqual({
      avatarId: 'custom:501',
      slot: 'avatarId',
      gender: 'female',
    });
    expect(calls[0]?.url).toBe('https://api.jogg.ai/v2/photo_avatar/photo/generate');
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      age: 'Elderly',
      gender: 'Female',
      avatar_style: 'Professional',
      appearance: input.description,
    });
    expect(calls[1]?.url).toBe('https://api.jogg.ai/v2/photo_avatar/photo?photo_id=p-1');
    expect(calls[3]?.url).toBe('https://api.jogg.ai/v2/voices?gender=female');
    expect(JSON.parse(String(calls[4]?.init?.body))).toEqual({
      photo_id: 'p-1',
      image_url: 'https://cdn.example/p.png',
      name: 'Philax · hannah-arendt',
      voice_id: 'f-1',
      model: '2.0-Pro',
    });
    expect(calls[6]?.url).toBe('https://api.jogg.ai/v2/photo_avatar?motion_id=m-1');
  });

  it('reports a failed photo generation', async () => {
    const { fn } = fetchMock(ok({ photo_id: 'p-1' }), ok({ status: 'error' }));
    const gateway = new JoggAIAvatarGateway({
      apiKey: 'jg',
      fetch: fn,
      sleep: () => Promise.resolve(),
    });
    expect((await failure(gateway.prepareCharacterAvatar(input))).code).toBe('generation_failed');
  });

  it('only creates male or female avatars, and only when enabled with a key', async () => {
    const gateway = new JoggAIAvatarGateway({ apiKey: 'jg', fetch: fetchMock().fn });
    expect(gateway.supports('androgynous')).toBe(false);
    expect(gateway.supports('male')).toBe(true);
    expect(
      (await failure(gateway.prepareCharacterAvatar({ ...input, presentation: 'androgynous' })))
        .code,
    ).toBe('not_configured');
    expect(new JoggAIAvatarGateway({ apiKey: undefined }).canPrepare).toBe(false);
    expect(new JoggAIAvatarGateway({ apiKey: 'jg', enabled: false }).canPrepare).toBe(false);
  });
});
