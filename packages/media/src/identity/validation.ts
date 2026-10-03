import type {
  AttireStyle,
  AvatarAppearance,
  CharacterIdentity,
  CharacterMediaConfig,
  CharacterStyle,
  HairStyle,
  Headwear,
  Presentation,
  VoicePace,
  ProviderAssetFacts,
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
  | 'voice_settings_inconsistent'
  | 'identity_reuse'
  | 'avatar_not_configured'
  | 'voice_not_configured'
  | 'invalid_provider';

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

/** Allowed voice speed per pace (ElevenLabs accepts 0.7–1.2). */
export const PACE_SPEED: Record<VoicePace, [number, number]> = {
  slow: [0.75, 0.9],
  deliberate: [0.86, 0.96],
  measured: [0.94, 1.04],
  brisk: [1.04, 1.2],
};

const within = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi;

type Add = (code: IdentityIssueCode, detail: string) => void;

function collector(characterId: string): { issues: IdentityIssue[]; add: Add } {
  const issues: IdentityIssue[] = [];
  return { issues, add: (code, detail) => issues.push({ characterId, code, detail }) };
}

/**
 * Checks a character's identity brief against its canonical identity:
 * character → visual identity → voice identity.
 */
export function validateStyle(
  identity: CharacterIdentity | undefined,
  style: CharacterStyle,
): IdentityIssue[] {
  const { issues, add } = collector(style.characterId);
  if (!identity) {
    add('unknown_character', 'No canonical identity is recorded for this character.');
    return issues;
  }
  if (identity.characterSlug !== style.characterId)
    add('character_mismatch', `Brief is for ${style.characterId}, not ${identity.characterSlug}.`);
  if (identity.presentation === 'unknown') {
    add('identity_uncertain', 'Presentation is not documented; no avatar or voice is assigned.');
    return issues;
  }

  const visual = style.visualIdentity;
  const voice = style.voiceIdentity;
  if (visual.presentation !== identity.presentation)
    add(
      'avatar_presentation_mismatch',
      `Avatar presents as ${visual.presentation}; character is ${identity.presentation}.`,
    );
  const features = appearancePresentation(style.portrait);
  if (features !== 'unknown' && features !== identity.presentation)
    add(
      'avatar_features_mismatch',
      `Portrait features read as ${features}; character is ${identity.presentation}.`,
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
  for (const lang of MEDIA_LANGUAGES)
    if (!voice.languageProfiles.includes(lang))
      add('missing_language_voice', `No ${lang} voice profile.`);
  if (!within(style.voiceSettings.speed, PACE_SPEED[voice.pace]))
    add(
      'voice_settings_inconsistent',
      `Speed ${style.voiceSettings.speed} does not match a ${voice.pace} pace.`,
    );
  return issues;
}

function normalizeGender(g: string | null | undefined): Presentation | null {
  const v = g?.trim().toLowerCase();
  if (v === 'male' || v === 'man') return 'male';
  if (v === 'female' || v === 'woman') return 'female';
  return null;
}

export interface ConfigValidationOptions {
  avatarProviders: readonly string[];
  voiceProviders: readonly string[];
  /** What the providers report about the configured assets, when known. */
  facts?: ProviderAssetFacts;
}

/**
 * Checks the provider assets configured for a character against its identity.
 * Missing assets are reported as not configured; nothing is ever substituted.
 */
export function validateMediaConfig(
  identity: CharacterIdentity | undefined,
  config: CharacterMediaConfig,
  opts: ConfigValidationOptions,
): IdentityIssue[] {
  const { issues, add } = collector(config.characterId);
  if (!identity) {
    add('unknown_character', 'No canonical identity is recorded for this character.');
    return issues;
  }
  if (identity.presentation === 'unknown') {
    add('identity_uncertain', 'Presentation is not documented; no avatar or voice is assigned.');
    return issues;
  }
  if (!opts.avatarProviders.includes(config.avatar.provider))
    add('invalid_provider', `Unknown avatar provider ${config.avatar.provider}.`);
  if (!opts.voiceProviders.includes(config.voice.provider))
    add('invalid_provider', `Unknown voice provider ${config.voice.provider}.`);

  if (!config.avatar.avatarId && !config.avatar.liveAvatarId)
    add('avatar_not_configured', 'No avatar is configured for this character.');
  else if (config.avatar.presentation !== identity.presentation)
    add(
      'avatar_presentation_mismatch',
      `Configured avatar presents as ${config.avatar.presentation}; character is ${identity.presentation}.`,
    );
  const avatarGender = normalizeGender(opts.facts?.avatarGender);
  if (avatarGender && avatarGender !== identity.presentation)
    add(
      'avatar_presentation_mismatch',
      `The provider lists this avatar as ${avatarGender}; character is ${identity.presentation}.`,
    );

  if (!config.voice.voiceId && Object.keys(config.voice.languageVoices).length === 0)
    add('voice_not_configured', 'No voice is configured for this character.');
  else if (config.voice.presentation !== identity.presentation)
    add(
      'voice_presentation_mismatch',
      `Configured voice presents as ${config.voice.presentation}; character is ${identity.presentation}.`,
    );
  const voiceGender = normalizeGender(opts.facts?.voiceGender);
  if (voiceGender && voiceGender !== identity.presentation)
    add(
      'voice_presentation_mismatch',
      `The provider lists this voice as ${voiceGender}; character is ${identity.presentation}.`,
    );
  return issues;
}

function portraitSignature(a: AvatarAppearance): string {
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

function uniqueness(): {
  issues: IdentityIssue[];
  claim: (key: string, characterId: string, what: string) => void;
} {
  const issues: IdentityIssue[] = [];
  const owners = new Map<string, string>();
  return {
    issues,
    claim(key, characterId, what) {
      const owner = owners.get(key);
      if (owner && owner !== characterId)
        issues.push({
          characterId,
          code: 'identity_reuse',
          detail: `${what} is already used by ${owner}.`,
        });
      else owners.set(key, characterId);
    },
  };
}

/** Validates every brief, and that no two characters share a look. */
export function validateStyles(
  identities: readonly CharacterIdentity[],
  styles: readonly CharacterStyle[],
): IdentityIssue[] {
  const bySlug = new Map(identities.map((i) => [i.characterSlug, i]));
  const issues = styles.flatMap((s) => validateStyle(bySlug.get(s.characterId), s));
  const { issues: reuse, claim } = uniqueness();
  const seen = new Set<string>();
  for (const s of styles) {
    if (seen.has(s.characterId))
      issues.push({
        characterId: s.characterId,
        code: 'identity_reuse',
        detail: 'Character has more than one identity brief.',
      });
    seen.add(s.characterId);
    claim(`look:${portraitSignature(s.portrait)}`, s.characterId, 'Portrait');
  }
  return [...issues, ...reuse];
}

/** No avatar or voice asset may be configured for two different characters. */
export function validateConfigReuse(configs: readonly CharacterMediaConfig[]): IdentityIssue[] {
  const { issues, claim } = uniqueness();
  for (const c of configs) {
    if (c.avatar.avatarId)
      claim(`avatar:${c.avatar.provider}:${c.avatar.avatarId}`, c.characterId, 'Avatar');
    if (c.avatar.liveAvatarId)
      claim(`live:${c.avatar.provider}:${c.avatar.liveAvatarId}`, c.characterId, 'Live avatar');
    if (c.voice.voiceId)
      claim(`voice:${c.voice.provider}:${c.voice.voiceId}`, c.characterId, 'Voice');
    for (const [lang, v] of Object.entries(c.voice.languageVoices))
      if (v !== c.voice.voiceId)
        claim(`voice:${c.voice.provider}:${v}`, c.characterId, `Voice (${lang})`);
  }
  return issues;
}
