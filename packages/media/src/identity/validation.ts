import type {
  AttireStyle,
  AvatarAppearance,
  CharacterIdentity,
  CharacterMediaProfile,
  HairStyle,
  Headwear,
  Presentation,
  VoicePace,
  AgeProfile,
} from './types';
import { AGE_PROFILES, MEDIA_LANGUAGES, ageProfileFor } from './types';

export type IdentityIssueCode =
  | 'unknown_character'
  | 'identity_uncertain'
  | 'character_mismatch'
  | 'avatar_presentation_mismatch'
  | 'avatar_features_mismatch'
  | 'voice_presentation_mismatch'
  | 'age_mismatch'
  | 'missing_language_voice'
  | 'voice_rendering_inconsistent'
  | 'identity_reuse';

export interface IdentityIssue {
  characterId: string;
  code: IdentityIssueCode;
  detail: string;
}

/** Period dress and grooming that read as one presentation in their era. */
const FEMALE_CUES: { attire: AttireStyle[]; hair: HairStyle[]; headwear: Headwear[] } = {
  attire: ['regency-gown', '20c-blouse'],
  hair: ['updo'],
  headwear: ['turban'],
};
const MALE_CUES: { attire: AttireStyle[] } = {
  attire: [
    '18c-coat',
    'periwig-coat',
    '19c-frockcoat',
    'puritan-collar',
    'loden-jacket',
    '20c-suit',
  ],
};

/** Presentation a procedural appearance actually reads as, from its features alone. */
export function appearancePresentation(a: AvatarAppearance): Presentation {
  const female =
    FEMALE_CUES.attire.includes(a.attire.style) ||
    FEMALE_CUES.hair.includes(a.hair.style) ||
    FEMALE_CUES.headwear.includes(a.headwear);
  const male = a.facialHair.style !== 'none' || MALE_CUES.attire.includes(a.attire.style);
  if (female && male) return 'androgynous';
  if (female) return 'female';
  if (male) return 'male';
  return 'unknown';
}

/** Allowed TTS rate multiplier per pace. */
export const PACE_RATE: Record<VoicePace, [number, number]> = {
  slow: [0.75, 0.9],
  deliberate: [0.86, 0.96],
  measured: [0.94, 1.04],
  brisk: [1.04, 1.25],
};

/** Allowed TTS pitch multiplier per age profile. */
export const AGE_PITCH: Record<AgeProfile, [number, number]> = {
  young: [1.0, 1.3],
  adult: [0.95, 1.2],
  mature: [0.85, 1.08],
  elder: [0.75, 0.95],
};

const within = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi;

/**
 * Checks one profile against the character's canonical identity:
 * Character identity → avatar identity → voice identity.
 */
export function validateProfile(
  identity: CharacterIdentity | undefined,
  profile: CharacterMediaProfile,
): IdentityIssue[] {
  const issues: IdentityIssue[] = [];
  const add = (code: IdentityIssueCode, detail: string) =>
    issues.push({ characterId: profile.characterId, code, detail });

  if (!identity) {
    add('unknown_character', 'No canonical identity is recorded for this character.');
    return issues;
  }
  if (identity.characterSlug !== profile.characterId)
    add(
      'character_mismatch',
      `Profile is for ${profile.characterId}, not ${identity.characterSlug}.`,
    );
  if (identity.presentation === 'unknown') {
    add('identity_uncertain', 'Presentation is not documented; no avatar or voice is assigned.');
    return issues;
  }

  const visual = profile.visualIdentity;
  const voice = profile.voiceIdentity;
  if (visual.presentation !== identity.presentation)
    add(
      'avatar_presentation_mismatch',
      `Avatar presents as ${visual.presentation}; character is ${identity.presentation}.`,
    );
  const features = appearancePresentation(profile.avatar.appearance);
  if (features !== 'unknown' && features !== identity.presentation)
    add(
      'avatar_features_mismatch',
      `Avatar features read as ${features}; character is ${identity.presentation}.`,
    );
  if (voice.presentation !== identity.presentation)
    add(
      'voice_presentation_mismatch',
      `Voice presents as ${voice.presentation}; character is ${identity.presentation}.`,
    );

  if (visual.approximateAge !== undefined && voice.ageProfile) {
    const expected = AGE_PROFILES.indexOf(ageProfileFor(visual.approximateAge));
    const actual = AGE_PROFILES.indexOf(voice.ageProfile);
    if (Math.abs(expected - actual) > 1)
      add(
        'age_mismatch',
        `Voice age ${voice.ageProfile} does not fit an avatar aged ${visual.approximateAge}.`,
      );
  }

  for (const lang of MEDIA_LANGUAGES) {
    if (!profile.voice.languageVoices[lang] || !voice.languageProfiles.includes(lang))
      add('missing_language_voice', `No ${lang} voice.`);
  }

  const { pitch, rate } = profile.voice.rendering;
  if (!within(rate, PACE_RATE[voice.pace]))
    add('voice_rendering_inconsistent', `Rate ${rate} does not match a ${voice.pace} pace.`);
  if (voice.ageProfile && !within(pitch, AGE_PITCH[voice.ageProfile]))
    add('voice_rendering_inconsistent', `Pitch ${pitch} does not fit a ${voice.ageProfile} voice.`);

  return issues;
}

function appearanceSignature(a: AvatarAppearance): string {
  return [
    a.hair.style,
    a.hair.color,
    a.facialHair.style,
    a.glasses,
    a.headwear,
    a.attire.style,
    a.attire.color,
  ].join('|');
}

/**
 * Validates a whole catalog: every profile individually, plus the rule that no
 * avatar, voice or look is shared between two characters.
 */
export function validateCatalog(
  identities: readonly CharacterIdentity[],
  profiles: readonly CharacterMediaProfile[],
): IdentityIssue[] {
  const bySlug = new Map(identities.map((i) => [i.characterSlug, i]));
  const issues = profiles.flatMap((p) => validateProfile(bySlug.get(p.characterId), p));

  const owners = new Map<string, string>();
  const claim = (key: string, characterId: string, what: string) => {
    const owner = owners.get(key);
    if (owner && owner !== characterId)
      issues.push({
        characterId,
        code: 'identity_reuse',
        detail: `${what} is already used by ${owner}.`,
      });
    else owners.set(key, characterId);
  };
  const seen = new Set<string>();
  for (const p of profiles) {
    if (seen.has(p.characterId))
      issues.push({
        characterId: p.characterId,
        code: 'identity_reuse',
        detail: 'Character has more than one media profile.',
      });
    seen.add(p.characterId);
    claim(`avatar:${p.avatar.provider}:${p.avatar.avatarId}`, p.characterId, 'Avatar');
    claim(`look:${appearanceSignature(p.avatar.appearance)}`, p.characterId, 'Appearance');
    claim(`voice:${p.voice.provider}:${p.voice.voiceId}`, p.characterId, 'Voice');
    for (const v of Object.values(p.voice.languageVoices))
      claim(`voice:${p.voice.provider}:${v}`, p.characterId, `Language voice ${v}`);
    const { pitch, rate } = p.voice.rendering;
    claim(
      `rendering:${p.voiceIdentity.presentation}:${pitch}:${rate}`,
      p.characterId,
      'Voice rendering (pitch and rate)',
    );
  }
  return issues;
}
