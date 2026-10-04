import { CHARACTER_STYLES } from '@philax/media';
import {
  MediaProfileRepository,
  type VoiceProvider,
  type VoiceSynthesisInput,
} from '@philax/media-service';
import type { DebateView, MediaStatus } from '@philax/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, resetUserData } from '../support/db';
import { advance, createHarness, lastState, register, type App } from '../support/debate-harness';

const db = createTestDb();
const repository = new MediaProfileRepository(db);
afterAll(() => db.close());
beforeAll(async () => {
  await db.query('DELETE FROM character_media_profiles');
  await repository.syncBriefs(CHARACTER_STYLES);
});
beforeEach(() => resetUserData(db));

// Mocked voice provider: automated tests only. It reports genders the way ElevenLabs labels do.
function mockVoice() {
  const synthesize = vi.fn((input: VoiceSynthesisInput) =>
    Promise.resolve({
      audio: new Uint8Array([0x49, 0x44, 0x33]),
      format: input.format,
      mimeType: 'audio/mpeg',
      alignment: null,
      durationMs: 1000,
    }),
  );
  const provider: VoiceProvider = {
    name: 'elevenlabs',
    configured: true,
    synthesize,
    describeVoice: (id) =>
      Promise.resolve({ name: id, gender: id.startsWith('f-') ? 'female' : 'male' }),
  };
  return { provider, synthesize };
}

async function debateWithTurn(app: App, cookie: string): Promise<DebateView> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/debates',
    headers: { cookie },
    payload: {
      input: { type: 'text', content: 'Will artificial intelligence make people less creative?' },
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const id = (res.json().debate as DebateView).id;
  for (let i = 0; i < 12; i++) {
    const view = lastState((await advance(app, cookie, id)).events);
    if (view.messages.some((m) => m.speaker.type === 'character')) return view;
  }
  throw new Error('no character turn');
}

describe('character_media_profiles', () => {
  it('stores identity briefs for every seeded character without provider ids', async () => {
    const rows = await repository.list();
    expect(rows).toHaveLength(CHARACTER_STYLES.length);
    const arendt = rows.find((r) => r.slug === 'hannah-arendt');
    expect(arendt).toMatchObject({ presentation: 'female', voiceId: null, avatarId: null });
    expect(arendt?.languageConfiguration.languages).toEqual(['en', 'es', 'ar']);
    expect(rows.find((r) => r.slug === 'karl-marx')).toMatchObject({
      presentation: 'male',
      ageProfile: 'mature',
    });
  });

  it('keeps configured ids when briefs are re-synced, and never lets two characters share a voice', async () => {
    await repository.assign('hannah-arendt', { voiceId: 'f-arendt', voicePresentation: 'female' });
    await repository.syncBriefs(CHARACTER_STYLES);
    const arendt = (await repository.list()).find((r) => r.slug === 'hannah-arendt');
    expect(arendt?.voiceId).toBe('f-arendt');
    await expect(
      repository.assign('karl-marx', { voiceId: 'f-arendt', voicePresentation: 'male' }),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(repository.assign('karl-marx', { voiceId: 'm-marx' })).rejects.toMatchObject({
      code: '23514',
    });
    await repository.assign('hannah-arendt', { voiceId: null, voicePresentation: null });
  });
});

describe('media API', () => {
  it('reports providers as not configured when the server has no keys', async () => {
    const { app } = await createHarness(db);
    const cookie = await register(app);
    const res = await app.inject({ method: 'GET', url: '/api/media/status', headers: { cookie } });
    expect(res.json().status).toEqual({
      voice: { provider: 'elevenlabs', configured: false },
      avatar: { mode: 'live', configured: false, presentation: 'framed' },
    } satisfies MediaStatus);
    expect(res.body).not.toMatch(/api[_-]?key/i);
  });

  it('voices a turn with the speaker’s own voice and refuses one without a voice', async () => {
    const voice = mockVoice();
    const { app } = await createHarness(db, { voice: voice.provider });
    const cookie = await register(app);
    const debate = await debateWithTurn(app, cookie);
    const turn = debate.messages.find((m) => m.speaker.type === 'character');
    if (!turn || turn.speaker.type !== 'character') throw new Error('no turn');
    const speakerId = turn.speaker.characterId;
    const speaker = debate.participants.find((p) => p.character.id === speakerId);
    const other = debate.participants.find((p) => p.character.id !== speakerId);
    if (!speaker || !other) throw new Error('cast');
    const presentation = CHARACTER_STYLES.find((s) => s.characterId === speaker.character.slug)
      ?.visualIdentity.presentation;
    const voiceId = `${presentation === 'female' ? 'f' : 'm'}-${speaker.character.slug}`;
    await repository.assign(speaker.character.slug, {
      voiceId,
      voicePresentation: presentation === 'female' ? 'female' : 'male',
    });

    try {
      const cast = await app.inject({
        method: 'GET',
        url: `/api/media/debates/${debate.id}/cast`,
        headers: { cookie },
      });
      const views = cast.json().cast as { characterId: string; voice: unknown; avatar: unknown }[];
      expect(views.find((v) => v.characterId === speakerId)?.voice).toEqual({ status: 'ready' });
      expect(views.find((v) => v.characterId === other.character.id)?.voice).toEqual({
        status: 'unavailable',
        reason: 'not_configured',
      });
      // Avatar provider has no key in tests.
      expect(views.find((v) => v.characterId === speakerId)?.avatar).toMatchObject({
        status: 'unavailable',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/media/speech',
        headers: { cookie },
        payload: {
          debateId: debate.id,
          messageId: turn.id,
          text: 'ignored: text comes from the turn',
        },
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().speech).toMatchObject({ mimeType: 'audio/mpeg', audio: 'SUQz' });
      expect(voice.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ voiceId, text: expect.not.stringContaining('ignored') }),
      );

      // Another user cannot voice this debate.
      const stranger = await register(app);
      const denied = await app.inject({
        method: 'POST',
        url: '/api/media/speech',
        headers: { cookie: stranger },
        payload: { debateId: debate.id, messageId: turn.id },
      });
      expect(denied.statusCode).toBe(404);

      // A live avatar without a key is "provider not configured", not a substitute.
      const session = await app.inject({
        method: 'POST',
        url: '/api/media/avatar/sessions',
        headers: { cookie },
        payload: { debateId: debate.id, characterId: speakerId },
      });
      expect(session.statusCode).toBe(503);
      expect(session.json().error).toMatchObject({
        code: 'MEDIA_UNAVAILABLE',
        details: { kind: 'avatar' },
      });
    } finally {
      await repository.assign(speaker.character.slug, { voiceId: null, voicePresentation: null });
    }
  });
});
