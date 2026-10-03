import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MEDIA_PROFILES, defineProfile } from '../profiles/catalog';
import { MediaProfileRegistry } from '../registry';
import { CHARACTER_IDENTITIES } from './character-identities';
import type { CharacterMediaProfile } from './types';
import { MEDIA_LANGUAGES } from './types';
import { appearancePresentation, validateCatalog, validateProfile } from './validation';

const seedDir = join(import.meta.dirname, '../../../../database/seeds/characters');
const seedSlugs = readdirSync(seedDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => (JSON.parse(readFileSync(join(seedDir, f), 'utf8')) as { slug: string }).slug);

const identity = (slug: string) => CHARACTER_IDENTITIES.find((i) => i.characterSlug === slug);
const profile = (slug: string) => {
  const p = MEDIA_PROFILES.find((m) => m.characterId === slug);
  if (!p) throw new Error(slug);
  return structuredClone(p) as CharacterMediaProfile;
};

describe('media catalog', () => {
  it('passes identity validation with no issues', () => {
    expect(validateCatalog(CHARACTER_IDENTITIES, MEDIA_PROFILES)).toEqual([]);
  });

  it('gives every seeded character an identity and a ready profile', () => {
    const registry = new MediaProfileRegistry();
    expect(seedSlugs.length).toBeGreaterThan(0);
    for (const slug of seedSlugs) {
      expect(identity(slug), slug).toBeDefined();
      expect(registry.resolve(slug).status, slug).toBe('ready');
    }
  });

  it('keeps presentation consistent across character, avatar and voice', () => {
    const female = MEDIA_PROFILES.filter((p) => identity(p.characterId)?.presentation === 'female');
    expect(female.map((p) => p.characterId).sort()).toEqual([
      'hannah-arendt',
      'mary-wollstonecraft',
      'simone-de-beauvoir',
    ]);
    for (const p of MEDIA_PROFILES) {
      const expected = identity(p.characterId)?.presentation;
      expect(p.visualIdentity.presentation, p.characterId).toBe(expected);
      expect(p.voiceIdentity.presentation, p.characterId).toBe(expected);
      const features = appearancePresentation(p.avatar.appearance);
      expect(['unknown', expected], p.characterId).toContain(features);
    }
  });

  it('gives every character a full visual identity and voice profile in en, es and ar', () => {
    for (const p of MEDIA_PROFILES) {
      expect(p.visualIdentity.approximateAge).toBeGreaterThan(0);
      expect(p.visualIdentity.appearanceReference).toBeTruthy();
      expect(p.visualIdentity.era).toBeTruthy();
      expect(p.voiceIdentity.ageProfile).toBeTruthy();
      expect(p.voiceIdentity.tone.length).toBeGreaterThan(5);
      expect(p.voiceIdentity.speechStyle.length).toBeGreaterThan(10);
      expect(p.disclosure).toBe('ai_reconstruction');
      for (const lang of MEDIA_LANGUAGES) expect(p.voice.languageVoices[lang]).toBeTruthy();
    }
  });

  it('never shares an avatar, look or voice between two characters', () => {
    const ids = MEDIA_PROFILES.flatMap((p) => [
      p.avatar.avatarId,
      p.voice.voiceId,
      ...Object.values(p.voice.languageVoices),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('identity validation', () => {
  it('rejects Hannah Arendt with a male avatar and voice', () => {
    const p = profile('hannah-arendt');
    p.visualIdentity.presentation = 'male';
    p.voiceIdentity.presentation = 'male';
    const codes = validateProfile(identity('hannah-arendt'), p).map((i) => i.code);
    expect(codes).toContain('avatar_presentation_mismatch');
    expect(codes).toContain('voice_presentation_mismatch');
  });

  it('rejects Karl Marx with a female avatar and voice', () => {
    const p = profile('karl-marx');
    p.visualIdentity.presentation = 'female';
    p.voiceIdentity.presentation = 'female';
    const codes = validateProfile(identity('karl-marx'), p).map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining(['avatar_presentation_mismatch', 'voice_presentation_mismatch']),
    );
  });

  it('checks the avatar features themselves, not only the declared label', () => {
    const p = profile('simone-de-beauvoir');
    p.avatar.appearance.facialHair = { style: 'full-beard', color: '#333' };
    p.avatar.appearance.headwear = 'none';
    p.avatar.appearance.hair.style = 'short';
    p.avatar.appearance.attire.style = '20c-suit';
    expect(validateProfile(identity('simone-de-beauvoir'), p).map((i) => i.code)).toContain(
      'avatar_features_mismatch',
    );
  });

  it('rejects an elder voice on a young avatar and missing languages', () => {
    const p = profile('soren-kierkegaard');
    p.voiceIdentity.ageProfile = 'elder';
    delete p.voice.languageVoices.ar;
    const codes = validateProfile(identity('soren-kierkegaard'), p).map((i) => i.code);
    expect(codes).toContain('age_mismatch');
    expect(codes).toContain('missing_language_voice');
  });

  it('rejects a rendering that contradicts the voice profile', () => {
    const p = profile('friedrich-nietzsche');
    p.voice.rendering.rate = 1.3;
    expect(validateProfile(identity('friedrich-nietzsche'), p).map((i) => i.code)).toContain(
      'voice_rendering_inconsistent',
    );
  });

  it('assigns nothing when a presentation is undocumented', () => {
    const issues = validateProfile(
      {
        characterSlug: 'hannah-arendt',
        presentation: 'unknown',
        presentationBasis: 'test',
        likeness: 'conjectural',
      },
      profile('hannah-arendt'),
    );
    expect(issues.map((i) => i.code)).toEqual(['identity_uncertain']);
  });

  it('detects the same avatar or voice reused by another character', () => {
    const nietzsche = profile('friedrich-nietzsche');
    const marx = profile('karl-marx');
    marx.avatar.avatarId = nietzsche.avatar.avatarId;
    const arendt = profile('hannah-arendt');
    const beauvoir = profile('simone-de-beauvoir');
    beauvoir.voice.languageVoices.en = arendt.voice.languageVoices.en ?? '';
    const issues = validateCatalog(CHARACTER_IDENTITIES, [nietzsche, marx, arendt, beauvoir]);
    expect(issues.filter((i) => i.code === 'identity_reuse').map((i) => i.characterId)).toEqual([
      'karl-marx',
      'simone-de-beauvoir',
    ]);
  });

  it('withholds invalid or unknown profiles instead of falling back', () => {
    const broken = profile('hannah-arendt');
    broken.voiceIdentity.presentation = 'male';
    const registry = new MediaProfileRegistry(CHARACTER_IDENTITIES, [
      broken,
      profile('karl-marx'),
      defineProfile('not-a-character', {
        visual: { presentation: 'male', approximateAge: 50, era: 'x', appearanceReference: 'x' },
        appearance: profile('karl-marx').avatar.appearance,
        voice: {
          presentation: 'male',
          ageProfile: 'mature',
          tone: 'x',
          pace: 'measured',
          speechStyle: 'x',
        },
        rendering: { pitch: 0.9, rate: 1, sentencePauseMs: 400 },
      }),
    ]);
    expect(registry.resolve('hannah-arendt')).toMatchObject({
      status: 'unavailable',
      reason: 'invalid_profile',
    });
    expect(registry.resolve('karl-marx').status).toBe('ready');
    expect(registry.resolve('not-a-character').status).toBe('unavailable');
    expect(registry.resolve('someone-new')).toMatchObject({
      status: 'unavailable',
      reason: 'no_profile',
    });
  });
});
