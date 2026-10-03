import { AppError, type MediaUnavailableDetails } from '@philax/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaProviderError } from './errors';
import type {
  AssetFacts,
  AvatarProvider,
  AvatarSpeakInput,
  VoiceProvider,
  VoiceSynthesisInput,
} from './ports';
import type { MediaProfileRepository, MediaProfileRow } from './repository';
import { CharacterMediaService, type TurnInput } from './service';

// Provider and repository doubles: automated tests only.
const MARX = { id: '00000000-0000-4000-8000-000000000002', slug: 'karl-marx' };
const ARENDT = { id: '00000000-0000-4000-8000-000000000003', slug: 'hannah-arendt' };

function row(
  c: { id: string; slug: string },
  patch: Partial<MediaProfileRow> = {},
): MediaProfileRow {
  return {
    characterId: c.id,
    slug: c.slug,
    avatarProvider: 'heygen',
    avatarId: null,
    liveAvatarId: null,
    avatarPresentation: null,
    voiceProvider: 'elevenlabs',
    voiceId: null,
    voicePresentation: null,
    presentation: 'unknown',
    ageProfile: null,
    voiceStyle: {},
    visualNotes: '',
    languageConfiguration: {},
    status: 'not_ready',
    avatarStatus: null,
    voiceStatus: null,
    version: 1,
    updatedAt: '',
    ...patch,
  };
}

const arendtRow = row(ARENDT, {
  presentation: 'female',
  voiceId: 'v-arendt',
  voicePresentation: 'female',
  liveAvatarId: 'la-arendt',
  avatarPresentation: 'female',
  languageConfiguration: { voices: { ar: 'v-arendt-ar' } },
});

function repo(rows: MediaProfileRow[]): MediaProfileRepository {
  return {
    get: (id: string) => Promise.resolve(rows.find((r) => r.characterId === id) ?? null),
    list: () => Promise.resolve(rows),
  } as unknown as MediaProfileRepository;
}

function voiceProvider(facts: Record<string, AssetFacts> = {}, configured = true) {
  const synthesize = vi.fn((input: VoiceSynthesisInput) =>
    Promise.resolve({
      audio: new Uint8Array([1, 2, 3]),
      format: input.format,
      mimeType: input.format === 'pcm_24000' ? 'audio/pcm' : 'audio/mpeg',
      alignment: {
        characters: [...input.text],
        character_start_times_seconds: [...input.text].map((_, i) => i * 0.05),
        character_end_times_seconds: [...input.text].map((_, i) => (i + 1) * 0.05),
      },
      durationMs: input.text.length * 50,
    }),
  );
  const describeVoice = vi.fn((id: string) =>
    facts[id]
      ? Promise.resolve(facts[id])
      : Promise.reject(new MediaProviderError('elevenlabs', 'invalid_voice', 'HTTP 404')),
  );
  const provider: VoiceProvider = { name: 'elevenlabs', configured, synthesize, describeVoice };
  return { provider, synthesize, describeVoice };
}

function liveAvatar() {
  const speak = vi.fn((input: AvatarSpeakInput) => {
    input.onEvent?.({ type: 'speak_started' });
    input.onEvent?.({ type: 'speak_ended' });
    return Promise.resolve({
      kind: 'live' as const,
      eventId: input.eventId,
      outcome: 'ended' as const,
    });
  });
  let n = 0;
  const createSession = vi.fn(() =>
    Promise.resolve({
      sessionId: `s-${++n}`,
      provider: 'liveavatar' as const,
      kind: 'live' as const,
      viewer: { livekitUrl: 'wss://room', livekitToken: 'viewer' },
      maxDurationSeconds: null,
    }),
  );
  const stopSession = vi.fn(() => Promise.resolve());
  const provider: AvatarProvider = {
    name: 'liveavatar',
    kind: 'live',
    configured: true,
    audioFormat: 'pcm_24000',
    createSession,
    speak,
    stopSession,
    describeAvatar: () => Promise.resolve(null),
  };
  return { provider, speak, createSession, stopSession };
}

const femaleVoices = {
  'v-arendt': { name: 'A', gender: 'female' },
  'v-arendt-ar': { name: 'A-ar', gender: 'female' },
};

function service(
  rows: MediaProfileRow[],
  voice = voiceProvider(femaleVoices),
  avatar = liveAvatar(),
) {
  return {
    media: new CharacterMediaService({
      repository: repo(rows),
      voice: voice.provider,
      avatar: avatar.provider,
      voiceModel: 'eleven_multilingual_v2',
      idleSessionMs: 1000,
    }),
    voice,
    avatar,
  };
}

function turn(character: { id: string; slug: string }, patch: Partial<TurnInput> = {}): TurnInput {
  return {
    character,
    content: 'Thinking matters [E1]. Action begins.',
    language: 'en',
    speed: 'normal',
    fromSegment: 0,
    ...patch,
  };
}

async function unavailable(p: Promise<unknown>): Promise<MediaUnavailableDetails> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError && err.code === 'MEDIA_UNAVAILABLE')
      return err.details as MediaUnavailableDetails;
    throw err;
  }
  throw new Error('expected MEDIA_UNAVAILABLE');
}

afterEach(() => vi.useRealTimers());

describe('CharacterMediaService: identity', () => {
  it('resolves Hannah Arendt to her own female voice and avatar', async () => {
    const { media } = service([arendtRow]);
    const { view, voiceId, avatarId } = await media.resolve(ARENDT, 'en');
    expect(view).toEqual({
      characterId: ARENDT.id,
      voice: { status: 'ready' },
      avatar: { status: 'ready' },
    });
    expect(voiceId).toBe('v-arendt');
    expect(avatarId).toBe('la-arendt');
  });

  it('keeps the character when the language changes (per-language voice of the same character)', async () => {
    const { media, voice } = service([arendtRow]);
    expect((await media.resolve(ARENDT, 'ar')).voiceId).toBe('v-arendt-ar');
    expect((await media.resolve(ARENDT, 'es-MX')).voiceId).toBe('v-arendt');
    await media.speech(turn(ARENDT, { language: 'ar' }));
    expect(voice.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ voiceId: 'v-arendt-ar', language: 'ar' }),
    );
  });

  it('fails Marx safely when no voice is configured, and never borrows another voice', async () => {
    const { media, voice } = service([arendtRow, row(MARX, { presentation: 'male' })]);
    const { view } = await media.resolve(MARX, 'en');
    expect(view.voice).toEqual({ status: 'unavailable', reason: 'not_configured' });
    expect(view.avatar).toEqual({ status: 'unavailable', reason: 'not_configured' });
    expect(await unavailable(media.speech(turn(MARX)))).toMatchObject({
      kind: 'voice',
      reason: 'not_configured',
    });
    expect(voice.synthesize).not.toHaveBeenCalled();
  });

  it('refuses a voice declared female for Marx', async () => {
    const marx = row(MARX, { presentation: 'male', voiceId: 'v-x', voicePresentation: 'female' });
    const { media, voice } = service(
      [marx],
      voiceProvider({ 'v-x': { name: 'x', gender: 'male' } }),
    );
    expect((await media.resolve(MARX, 'en')).view.voice).toEqual({
      status: 'unavailable',
      reason: 'identity_mismatch',
    });
    await unavailable(media.speech(turn(MARX)));
    expect(voice.synthesize).not.toHaveBeenCalled();
  });

  it('refuses a voice the provider lists as female for Marx, even if declared male', async () => {
    const marx = row(MARX, { presentation: 'male', voiceId: 'v-f', voicePresentation: 'male' });
    const { media } = service([marx], voiceProvider({ 'v-f': { name: 'f', gender: 'female' } }));
    expect((await media.resolve(MARX, 'en')).view.voice).toMatchObject({
      reason: 'identity_mismatch',
    });
  });

  it('refuses a voice that is assigned to another character', async () => {
    const marx = row(MARX, {
      presentation: 'male',
      voiceId: 'v-arendt',
      voicePresentation: 'male',
    });
    const { media } = service([arendtRow, marx]);
    expect((await media.resolve(MARX, 'en')).view.voice).toMatchObject({
      reason: 'identity_mismatch',
    });
  });

  it('reports an unknown provider as invalid configuration', async () => {
    const bad = { ...arendtRow, voiceProvider: 'acme' };
    const { media } = service([bad]);
    expect((await media.resolve(ARENDT, 'en')).view.voice).toEqual({
      status: 'unavailable',
      reason: 'invalid_provider',
    });
  });

  it('reports a voice id the provider does not know', async () => {
    const { media } = service([arendtRow], voiceProvider({}));
    expect((await media.resolve(ARENDT, 'en')).view.voice).toMatchObject({
      reason: 'invalid_voice',
    });
  });

  it('says "provider not configured" when the server has no key', async () => {
    const { media } = service([arendtRow], voiceProvider(femaleVoices, false));
    expect((await media.resolve(ARENDT, 'en')).view.voice).toMatchObject({
      reason: 'provider_not_configured',
    });
    expect(media.status().voice.configured).toBe(false);
  });

  it('gives nothing to a character whose identity is not recorded yet', async () => {
    const { media } = service([]);
    const { view } = await media.resolve({ id: 'x', slug: 'new-thinker' }, 'en');
    expect(view.voice).toMatchObject({ reason: 'not_configured' });
  });
});

describe('CharacterMediaService: speech', () => {
  it('voices the cleaned turn text and returns timing for subtitles', async () => {
    const { media, voice } = service([arendtRow]);
    const speech = await media.speech(turn(ARENDT));
    expect(speech.text).toBe('Thinking matters. Action begins.');
    expect(speech.mimeType).toBe('audio/mpeg');
    expect(speech.alignment?.characters.join('')).toBe(speech.text);
    expect(voice.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'mp3_44100_128', text: speech.text }),
    );
  });

  it('caches by character, text, language and voice settings', async () => {
    const { media, voice } = service([arendtRow]);
    await media.speech(turn(ARENDT));
    await media.speech(turn(ARENDT));
    expect(voice.synthesize).toHaveBeenCalledTimes(1);
    await media.speech(turn(ARENDT, { speed: 'fast' }));
    await media.speech(turn(ARENDT, { language: 'ar' }));
    expect(voice.synthesize).toHaveBeenCalledTimes(3);
  });

  it('resumes from a subtitle segment', async () => {
    const { media } = service([arendtRow]);
    expect((await media.speech(turn(ARENDT, { fromSegment: 1 }))).text).toBe('Action begins.');
  });

  it.each(['rate_limited', 'timeout', 'quota_exceeded', 'invalid_api_key', 'unavailable'] as const)(
    'turns a provider %s into "voice unavailable" with the reason',
    async (code) => {
      const voice = voiceProvider(femaleVoices);
      voice.synthesize.mockRejectedValueOnce(
        new MediaProviderError('elevenlabs', code, 'x', {
          retryAfterMs: code === 'rate_limited' ? 2000 : null,
        }),
      );
      const { media } = service([arendtRow], voice);
      expect(await unavailable(media.speech(turn(ARENDT)))).toEqual({
        kind: 'voice',
        reason: code,
        retryAfterMs: code === 'rate_limited' ? 2000 : null,
      });
    },
  );
});

describe('CharacterMediaService: real-time avatar', () => {
  it('opens one session per user and speaks with synchronized events', async () => {
    const { media, avatar, voice } = service([arendtRow]);
    const first = await media.openSession('u1', ARENDT, 'en');
    const second = await media.openSession('u1', ARENDT, 'en');
    expect(avatar.stopSession).toHaveBeenCalledWith(first.sessionId);

    const events: string[] = [];
    await media.speakInSession('u1', second.sessionId, turn(ARENDT), (e) => events.push(e.type));
    expect(events).toEqual(['alignment', 'speak_started', 'speak_ended']);
    expect(voice.synthesize).toHaveBeenCalledWith(expect.objectContaining({ format: 'pcm_24000' }));
    expect(avatar.speak).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: second.sessionId,
        audio: expect.objectContaining({ format: 'pcm_24000' }),
      }),
    );
  });

  it('does not let another user or another character use a session', async () => {
    const marx = row(MARX, {
      presentation: 'male',
      voiceId: 'v-m',
      voicePresentation: 'male',
      liveAvatarId: 'la-m',
      avatarPresentation: 'male',
    });
    const { media } = service(
      [arendtRow, marx],
      voiceProvider({ ...femaleVoices, 'v-m': { name: 'm', gender: 'male' } }),
    );
    const s = await media.openSession('u1', ARENDT, 'en');
    await expect(
      media.speakInSession('u2', s.sessionId, turn(ARENDT), () => undefined),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      media.speakInSession('u1', s.sessionId, turn(MARX), () => undefined),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('refuses to open an avatar for a character without one', async () => {
    const { media, avatar } = service([
      { ...arendtRow, liveAvatarId: null, avatarPresentation: null },
    ]);
    expect(await unavailable(media.openSession('u1', ARENDT, 'en'))).toMatchObject({
      kind: 'avatar',
      reason: 'not_configured',
    });
    expect(avatar.createSession).not.toHaveBeenCalled();
  });

  it('closes idle sessions', async () => {
    vi.useFakeTimers();
    const { media, avatar } = service([arendtRow]);
    const s = await media.openSession('u1', ARENDT, 'en');
    await vi.advanceTimersByTimeAsync(1500);
    expect(avatar.stopSession).toHaveBeenCalledWith(s.sessionId);
  });
});
