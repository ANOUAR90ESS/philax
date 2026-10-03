import { CHARACTER_STYLES } from '@philax/media';
import {
  CharacterMediaService,
  MediaOrchestrator,
  MediaProfileRepository,
  MediaProviderError,
  type AvatarGateway,
  type AvatarProvider,
  type PreparableCharacter,
  type PrepareVoiceInput,
  type VoiceGateway,
  type VoiceProvider,
} from '@philax/media-service';
import { AppError, type DebateView } from '@philax/types';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, resetUserData } from '../support/db';
import { advance, createHarness, lastState, register } from '../support/debate-harness';

// Provider and gateway doubles: automated tests only.
const db = createTestDb();
const repository = new MediaProfileRepository(db);
afterAll(() => db.close());

const DYNAMIC_SLUG = 'test-dynamic-thinker';

beforeEach(async () => {
  await resetUserData(db);
  await db.query('DELETE FROM character_media_profiles');
  await db.query('DELETE FROM characters WHERE slug = $1', [DYNAMIC_SLUG]);
  await repository.syncBriefs(CHARACTER_STYLES);
});

async function character(slug: string): Promise<PreparableCharacter> {
  const { rows } = await db.query<PreparableCharacter>(
    `SELECT id, slug, display_name AS "displayName", era, birth_year AS "birthYear", death_year AS "deathYear"
     FROM characters WHERE slug = $1`,
    [slug],
  );
  const c = rows[0];
  if (!c) throw new Error(`no character ${slug}`);
  return c;
}

/** Voices the provider "knows": id → gender. */
function voiceWorld() {
  const genders = new Map<string, string>();
  let n = 0;
  const provider: VoiceProvider = {
    name: 'elevenlabs',
    configured: true,
    synthesize: () => Promise.reject(new Error('not used')),
    describeVoice: (id) => {
      const gender = genders.get(id);
      return gender
        ? Promise.resolve({ name: id, gender })
        : Promise.reject(new MediaProviderError('elevenlabs', 'invalid_voice', 'HTTP 404'));
    },
  };
  const prepare = vi.fn((input: PrepareVoiceInput) => {
    const voiceId = `designed-${input.characterSlug}-${++n}`;
    genders.set(voiceId, input.presentation);
    return Promise.resolve({ voiceId, gender: input.presentation });
  });
  const gateway: VoiceGateway = {
    provider: 'elevenlabs',
    canPrepare: true,
    prepareCharacterVoice: prepare,
  };
  return { provider, gateway, prepare, genders };
}

const videoAvatar: AvatarProvider = {
  name: 'heygen',
  kind: 'video',
  configured: true,
  audioFormat: 'mp3_44100_128',
  createSession: () => Promise.reject(new Error('not used')),
  speak: () => Promise.reject(new Error('not used')),
  stopSession: () => Promise.resolve(),
  describeAvatar: () => Promise.resolve(null),
};

function avatarGateway(
  gender = (p: string) => p,
): AvatarGateway & { prepare: ReturnType<typeof vi.fn> } {
  let n = 0;
  const prepare = vi.fn((input: { characterSlug: string; presentation: string }) =>
    Promise.resolve({
      avatarId: `look-${input.characterSlug}-${++n}`,
      slot: 'avatarId' as const,
      gender: gender(input.presentation),
    }),
  );
  return { provider: 'heygen', canPrepare: true, prepareCharacterAvatar: prepare, prepare };
}

function orchestrator(opts: {
  voice: ReturnType<typeof voiceWorld>;
  avatar?: AvatarProvider | null;
  avatars?: AvatarGateway;
}) {
  const media = new CharacterMediaService({
    repository,
    voice: opts.voice.provider,
    avatar: opts.avatar ?? null,
    voiceModel: 'eleven_multilingual_v2',
  });
  const unavailable: AvatarGateway = {
    provider: 'heygen',
    canPrepare: false,
    prepareCharacterAvatar: () => Promise.reject(new Error('unavailable')),
  };
  return new MediaOrchestrator({
    repository,
    media,
    voices: opts.voice.gateway,
    avatars: opts.avatars ?? unavailable,
    sleep: () => Promise.resolve(),
    pollMs: 1,
  });
}

describe('MediaOrchestrator', () => {
  it('prepares a missing voice once, validates it, saves it and reuses it in later debates', async () => {
    const voice = voiceWorld();
    const o = orchestrator({ voice });
    const arendt = await character('hannah-arendt');
    const [outcome] = await o.prepareParticipants({
      debateId: 'd1',
      language: 'ar',
      characters: [arendt],
    });
    expect(outcome?.voice).toEqual({ status: 'ready', prepared: true });
    expect(voice.prepare).toHaveBeenCalledTimes(1);
    expect(voice.prepare.mock.calls[0]?.[0]).toMatchObject({ presentation: 'female' });
    expect(voice.prepare.mock.calls[0]?.[0].description).toMatch(/female/);

    const row = await repository.get(arendt.id);
    expect(row).toMatchObject({ voiceStatus: 'ready', voicePresentation: 'female' });
    expect(row?.voiceId).toMatch(/^designed-hannah-arendt/);

    const [again] = await o.prepareParticipants({
      debateId: 'd2',
      language: 'es',
      characters: [arendt],
    });
    expect(again?.voice).toEqual({ status: 'ready', prepared: false });
    expect(voice.prepare).toHaveBeenCalledTimes(1);
  });

  it('refuses a prepared voice that does not match the character and never borrows another', async () => {
    const voice = voiceWorld();
    const o = orchestrator({ voice });
    const arendt = await character('hannah-arendt');
    const marx = await character('karl-marx');
    await o.prepareParticipants({ debateId: 'd', language: 'en', characters: [arendt] });
    voice.prepare.mockImplementationOnce(() => {
      voice.genders.set('wrong', 'female');
      return Promise.resolve({ voiceId: 'wrong', gender: 'female' });
    });

    const err = await o
      .prepareParticipants({ debateId: 'd', language: 'en', characters: [marx, arendt] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({
      code: 'PARTICIPANTS_NOT_READY',
      message: "We couldn't prepare one of the participants. Please try again.",
    });
    const row = await repository.get(marx.id);
    expect(row).toMatchObject({ voiceId: null, voiceStatus: 'failed', status: 'failed' });
  });

  it('does not block or guess when nothing can be prepared (no provider)', async () => {
    const voice = voiceWorld();
    const o = orchestrator({
      voice: { ...voice, gateway: { ...voice.gateway, canPrepare: false } },
    });
    const [outcome] = await o.prepareParticipants({
      debateId: 'd',
      language: 'en',
      characters: [await character('karl-marx')],
    });
    expect(outcome?.voice).toEqual({ status: 'unavailable', reason: 'not_configured' });
    expect(voice.prepare).not.toHaveBeenCalled();
  });

  it('retries a transient provider failure once', async () => {
    const voice = voiceWorld();
    voice.prepare.mockRejectedValueOnce(
      new MediaProviderError('elevenlabs', 'rate_limited', 'HTTP 429'),
    );
    const o = orchestrator({ voice });
    const [outcome] = await o.prepareParticipants({
      debateId: 'd',
      language: 'en',
      characters: [await character('karl-marx')],
    });
    expect(outcome?.voice.status).toBe('ready');
    expect(voice.prepare).toHaveBeenCalledTimes(2);
  });

  it('prepares each character only once when debates start at the same time', async () => {
    const voice = voiceWorld();
    const o = orchestrator({ voice });
    const marx = await character('karl-marx');
    await Promise.all([
      o.prepareParticipants({ debateId: 'a', language: 'en', characters: [marx] }),
      o.prepareParticipants({ debateId: 'b', language: 'en', characters: [marx] }),
    ]);
    expect(voice.prepare).toHaveBeenCalledTimes(1);
  });

  it('prepares a video avatar look matching the character', async () => {
    const voice = voiceWorld();
    const avatars = avatarGateway();
    const o = orchestrator({ voice, avatar: videoAvatar, avatars });
    const arendt = await character('hannah-arendt');
    const [outcome] = await o.prepareParticipants({
      debateId: 'd',
      language: 'en',
      characters: [arendt],
    });
    expect(outcome).toMatchObject({ avatar: { status: 'ready' }, voice: { status: 'ready' } });
    expect(avatars.prepare.mock.calls[0]?.[0].description).toMatch(/female thinker/);
    expect(await repository.get(arendt.id)).toMatchObject({
      avatarPresentation: 'female',
      avatarStatus: 'ready',
      status: 'ready',
    });
  });

  it('rejects an avatar the provider reports with another gender', async () => {
    const voice = voiceWorld();
    const avatars = avatarGateway(() => 'male');
    const o = orchestrator({ voice, avatar: videoAvatar, avatars });
    const arendt = await character('hannah-arendt');
    await expect(
      o.prepareParticipants({ debateId: 'd', language: 'en', characters: [arendt] }),
    ).rejects.toMatchObject({ code: 'PARTICIPANTS_NOT_READY' });
    expect(await repository.get(arendt.id)).toMatchObject({
      avatarId: null,
      avatarStatus: 'failed',
    });
  });

  it('handles characters added later: no guessing until their identity is recorded', async () => {
    await db.query(
      `INSERT INTO characters (slug, name, display_name, type, birth_year, death_year, era, representation, worldview_summary, biography)
       VALUES ($1, 'Test Thinker', 'Test Thinker', 'thinker', 1856, 1939, 'Vienna, early 20th century', 'historical', 'x', 'x')`,
      [DYNAMIC_SLUG],
    );
    const voice = voiceWorld();
    const o = orchestrator({ voice });
    const dynamic = await character(DYNAMIC_SLUG);

    const [unknown] = await o.prepareParticipants({
      debateId: 'd',
      language: 'en',
      characters: [dynamic],
    });
    expect(unknown?.voice).toEqual({ status: 'unavailable', reason: 'not_configured' });
    expect(voice.prepare).not.toHaveBeenCalled();
    expect(await repository.get(dynamic.id)).toMatchObject({
      presentation: 'unknown',
      ageProfile: 'elder',
    });

    await repository.setPresentation(DYNAMIC_SLUG, 'male');
    const [prepared] = await o.prepareParticipants({
      debateId: 'd',
      language: 'en',
      characters: [dynamic],
    });
    expect(prepared?.voice).toEqual({ status: 'ready', prepared: true });
    expect(voice.prepare.mock.calls[0]?.[0]).toMatchObject({ presentation: 'male' });
  });

  it('versions asset changes and keeps the replaced assets', async () => {
    const before = await repository.assign('karl-marx', {
      voiceId: 'v1',
      voicePresentation: 'male',
    });
    const after = await repository.assign('karl-marx', { voiceId: 'v2' });
    expect(after?.version).toBe((before?.version ?? 0) + 1);
    const { rows } = await db.query<{ asset_history: { voiceId: string }[] }>(
      `SELECT asset_history FROM character_media_profiles WHERE character_id = $1`,
      [after?.characterId],
    );
    expect(rows[0]?.asset_history.at(-1)?.voiceId).toBe('v1');
  });
});

describe('debate pipeline', () => {
  it('prepares participants after planning and does not start the debate until they are ready', async () => {
    const voice = voiceWorld();
    let failing = true;
    const gateway: VoiceGateway = {
      provider: 'elevenlabs',
      canPrepare: true,
      prepareCharacterVoice: (input) =>
        failing
          ? Promise.reject(new MediaProviderError('elevenlabs', 'unavailable', 'HTTP 503'))
          : voice.gateway.prepareCharacterVoice(input),
    };
    const { app } = await createHarness(db, { voice: voice.provider, voiceGateway: gateway });
    const cookie = await register(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/debates',
      headers: { cookie },
      payload: {
        input: { type: 'text', content: 'Will artificial intelligence make people less creative?' },
      },
    });
    const id = (res.json().debate as DebateView).id;

    const prepared = await advance(app, cookie, id);
    const error = prepared.events.find((e) => e.type === 'error');
    expect(error).toMatchObject({
      code: 'PARTICIPANTS_NOT_READY',
      message: "We couldn't prepare one of the participants. Please try again.",
    });
    // Nothing about providers reaches the user.
    expect(prepared.body).not.toMatch(/elevenlabs|heygen|voice_id|avatar_id/i);

    // The next attempt prepares the participants again before the first round.
    const blocked = await advance(app, cookie, id);
    expect(blocked.events.some((e) => e.type === 'round_started')).toBe(false);
    failing = false;
    const started = await advance(app, cookie, id);
    const steps = started.events
      .filter((e) => e.type === 'step')
      .map((e) => e.type === 'step' && `${e.step}:${e.status}`);
    expect(steps).toEqual(['participants:started', 'participants:completed']);
    expect(started.events.some((e) => e.type === 'round_started')).toBe(true);
    expect(lastState(started.events).messages.length).toBeGreaterThan(0);
  });
});
