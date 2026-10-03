import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTER_STYLES } from '../profiles/catalog';
import { CharacterStyleRegistry } from '../registry';
import { CHARACTER_IDENTITIES } from './character-identities';
import type { CharacterMediaConfig, CharacterStyle } from './types';
import { MEDIA_LANGUAGES } from './types';
import {
  appearancePresentation,
  validateConfigReuse,
  validateMediaConfig,
  validateStyle,
  validateStyles,
} from './validation';

const seedDir = join(import.meta.dirname, '../../../../database/seeds/characters');
const seedSlugs = readdirSync(seedDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => (JSON.parse(readFileSync(join(seedDir, f), 'utf8')) as { slug: string }).slug);

const identity = (slug: string) => CHARACTER_IDENTITIES.find((i) => i.characterSlug === slug);
const style = (slug: string) => {
  const s = CHARACTER_STYLES.find((m) => m.characterId === slug);
  if (!s) throw new Error(slug);
  return structuredClone(s) as CharacterStyle;
};

function config(slug: string, over: Partial<CharacterMediaConfig> = {}): CharacterMediaConfig {
  const presentation = identity(slug)?.presentation ?? 'unknown';
  return {
    characterId: slug,
    avatar: {
      provider: 'heygen',
      avatarId: `look-${slug}`,
      liveAvatarId: `live-${slug}`,
      presentation,
    },
    voice: { provider: 'elevenlabs', voiceId: `voice-${slug}`, languageVoices: {}, presentation },
    ...over,
  };
}
const providers = { avatarProviders: ['heygen'], voiceProviders: ['elevenlabs'] };

describe('identity briefs', () => {
  it('pass validation for every character with no issues', () => {
    expect(validateStyles(CHARACTER_IDENTITIES, CHARACTER_STYLES)).toEqual([]);
  });

  it('exist for every seeded character', () => {
    const registry = new CharacterStyleRegistry();
    expect(seedSlugs.length).toBeGreaterThan(0);
    for (const slug of seedSlugs) expect(registry.resolve(slug).status, slug).toBe('ready');
  });

  it('keep presentation consistent across character, portrait and voice', () => {
    const female = CHARACTER_STYLES.filter(
      (s) => identity(s.characterId)?.presentation === 'female',
    );
    expect(female.map((s) => s.characterId).sort()).toEqual([
      'hannah-arendt',
      'mary-wollstonecraft',
      'simone-de-beauvoir',
    ]);
    for (const s of CHARACTER_STYLES) {
      const expected = identity(s.characterId)?.presentation;
      expect(s.visualIdentity.presentation, s.characterId).toBe(expected);
      expect(s.voiceIdentity.presentation, s.characterId).toBe(expected);
      expect(['unknown', expected]).toContain(appearancePresentation(s.portrait));
    }
  });

  it('carry a full visual identity and voice profile in en, es and ar', () => {
    for (const s of CHARACTER_STYLES) {
      expect(s.visualIdentity.approximateAge).toBeGreaterThan(0);
      expect(s.visualIdentity.appearanceReference).toBeTruthy();
      expect(s.voiceIdentity.tone.length).toBeGreaterThan(5);
      expect(s.voiceIdentity.speechStyle.length).toBeGreaterThan(10);
      expect(s.voiceSettings.speed).toBeGreaterThanOrEqual(0.7);
      expect(s.voiceSettings.speed).toBeLessThanOrEqual(1.2);
      expect(s.disclosure).toBe('ai_reconstruction');
      for (const lang of MEDIA_LANGUAGES) expect(s.voiceIdentity.languageProfiles).toContain(lang);
    }
  });

  it('reject a brief that contradicts the character', () => {
    const arendt = style('hannah-arendt');
    arendt.visualIdentity.presentation = 'male';
    arendt.voiceIdentity.presentation = 'male';
    arendt.voiceSettings.speed = 1.2;
    const codes = validateStyle(identity('hannah-arendt'), arendt).map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'avatar_presentation_mismatch',
        'voice_presentation_mismatch',
        'voice_settings_inconsistent',
      ]),
    );
    const kierkegaard = style('soren-kierkegaard');
    kierkegaard.voiceIdentity.ageProfile = 'elder';
    expect(validateStyle(identity('soren-kierkegaard'), kierkegaard).map((i) => i.code)).toContain(
      'age_mismatch',
    );
  });
});

describe('provider asset configuration', () => {
  it('accepts Hannah Arendt with female-presenting assets', () => {
    expect(
      validateMediaConfig(identity('hannah-arendt'), config('hannah-arendt'), {
        ...providers,
        facts: { voiceGender: 'female', avatarGender: 'Female' },
      }),
    ).toEqual([]);
  });

  it('rejects Karl Marx configured with a female avatar and voice', () => {
    const codes = validateMediaConfig(
      identity('karl-marx'),
      config('karl-marx', {
        avatar: { provider: 'heygen', avatarId: 'a', liveAvatarId: null, presentation: 'female' },
        voice: { provider: 'elevenlabs', voiceId: 'v', languageVoices: {}, presentation: 'female' },
      }),
      providers,
    ).map((i) => i.code);
    expect(codes).toEqual(['avatar_presentation_mismatch', 'voice_presentation_mismatch']);
  });

  it('rejects assets the provider itself lists with another gender', () => {
    const codes = validateMediaConfig(identity('hannah-arendt'), config('hannah-arendt'), {
      ...providers,
      facts: { voiceGender: 'male', avatarGender: 'male' },
    }).map((i) => i.code);
    expect(codes).toEqual(['avatar_presentation_mismatch', 'voice_presentation_mismatch']);
  });

  it('reports missing assets and unknown providers instead of substituting', () => {
    const codes = validateMediaConfig(
      identity('friedrich-nietzsche'),
      config('friedrich-nietzsche', {
        avatar: { provider: 'other', avatarId: null, liveAvatarId: null, presentation: 'male' },
        voice: { provider: 'elevenlabs', voiceId: null, languageVoices: {}, presentation: 'male' },
      }),
      providers,
    ).map((i) => i.code);
    expect(codes).toEqual(['invalid_provider', 'avatar_not_configured', 'voice_not_configured']);
  });

  it('assigns nothing to a character whose presentation is undocumented', () => {
    expect(
      validateMediaConfig(
        {
          characterSlug: 'x',
          presentation: 'unknown',
          presentationBasis: '',
          likeness: 'conjectural',
        },
        config('x'),
        providers,
      ).map((i) => i.code),
    ).toEqual(['identity_uncertain']);
  });

  it('never lets two characters share an avatar or a voice', () => {
    const marx = config('karl-marx');
    const nietzsche = config('friedrich-nietzsche', {
      avatar: { ...marx.avatar },
      voice: {
        ...config('friedrich-nietzsche').voice,
        languageVoices: { ar: marx.voice.voiceId ?? '' },
      },
    });
    const arendt = config('hannah-arendt');
    const beauvoir = config('simone-de-beauvoir', { voice: { ...arendt.voice } });
    const issues = validateConfigReuse([marx, nietzsche, arendt, beauvoir]);
    expect(issues.map((i) => [i.characterId, i.detail])).toEqual([
      ['friedrich-nietzsche', 'Avatar is already used by karl-marx.'],
      ['friedrich-nietzsche', 'Live avatar is already used by karl-marx.'],
      ['friedrich-nietzsche', 'Voice (ar) is already used by karl-marx.'],
      ['simone-de-beauvoir', 'Voice is already used by hannah-arendt.'],
    ]);
  });
});
