/**
 * Identity model for how a debate character is seen and heard.
 *
 * The chain is: Character → canonical identity (who the figure was) →
 * visual identity (how the avatar presents) → voice identity (how the voice
 * presents) → speech style. Every link is structured data so it can be
 * validated; nothing is inferred from a display name.
 */

export const PRESENTATIONS = ['male', 'female', 'androgynous', 'unknown'] as const;
export type Presentation = (typeof PRESENTATIONS)[number];

export const AGE_PROFILES = ['young', 'adult', 'mature', 'elder'] as const;
export type AgeProfile = (typeof AGE_PROFILES)[number];

/** Languages every media profile must carry a voice for. */
export const MEDIA_LANGUAGES = ['en', 'es', 'ar'] as const;
export type MediaLanguage = (typeof MEDIA_LANGUAGES)[number];

export const VOICE_PACES = ['slow', 'deliberate', 'measured', 'brisk'] as const;
export type VoicePace = (typeof VOICE_PACES)[number];

/**
 * How much a visual reconstruction can lean on period evidence.
 * - `photographic`: photographs of the person exist.
 * - `portrait`: painted or sculpted portraits from life (or close to it).
 * - `traditional`: later conventional depictions; no likeness from life.
 * - `conjectural`: no reliable depiction; only era-appropriate appearance.
 */
export type LikenessEvidence = 'photographic' | 'portrait' | 'traditional' | 'conjectural';

/**
 * Canonical identity of a character, independent of any avatar or voice.
 * This is the authority media profiles are validated against.
 */
export interface CharacterIdentity {
  /** Matches the character's seed slug. */
  characterSlug: string;
  presentation: Presentation;
  /** Basis for `presentation`, e.g. the historical record. */
  presentationBasis: string;
  likeness: LikenessEvidence;
}

export interface CharacterVisualIdentity {
  presentation: Presentation;
  /** Age the avatar depicts (the age of the reference likeness). */
  approximateAge?: number;
  /** The visual sources the reconstruction follows. */
  appearanceReference?: string;
  era?: string;
}

export interface CharacterVoiceIdentity {
  presentation: Presentation;
  ageProfile?: AgeProfile;
  /** Short descriptors, e.g. "intense, dramatic but controlled". */
  tone: string;
  pace: VoicePace;
  languageProfiles: string[];
  /** Rhetorical register the delivery should carry. */
  speechStyle: string;
}

export const HAIR_STYLES = [
  'bald',
  'balding',
  'receding',
  'short',
  'swept-back',
  'wavy',
  'curly',
  'long',
  'tied-wig',
  'powdered-wig',
  'updo',
  'quiff',
  'topknot',
  'loose-curls',
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const FACIAL_HAIR_STYLES = [
  'none',
  'mustache',
  'walrus-mustache',
  'short-beard',
  'full-beard',
  'long-beard',
  'mustache-tuft',
] as const;
export type FacialHairStyle = (typeof FACIAL_HAIR_STYLES)[number];

export const ATTIRE_STYLES = [
  'himation',
  'scholar-robe',
  'puritan-collar',
  'periwig-coat',
  '18c-coat',
  'regency-gown',
  '19c-frockcoat',
  '20c-suit',
  '20c-open-collar',
  '20c-blouse',
  'loden-jacket',
] as const;
export type AttireStyle = (typeof ATTIRE_STYLES)[number];

export type Glasses = 'none' | 'round' | 'round-thick' | 'rectangular';
export type Headwear = 'none' | 'fur-cap' | 'scholar-cap' | 'turban';

/**
 * Parameters of a procedural (vector) portrait. Real-time providers render it
 * directly; video providers use it as a brief for their own asset.
 */
export interface AvatarAppearance {
  skinTone: string;
  faceShape: 'oval' | 'long' | 'round' | 'square';
  hair: { style: HairStyle; color: string };
  facialHair: { style: FacialHairStyle; color: string };
  glasses: Glasses;
  headwear: Headwear;
  attire: { style: AttireStyle; color: string; accent: string };
}

/** Provider-independent identity brief for one character. */
export interface CharacterStyle {
  /** The character's seed slug. */
  characterId: string;
  visualIdentity: CharacterVisualIdentity;
  voiceIdentity: CharacterVoiceIdentity;
  /** Illustrated portrait used for cast lists and cards (not a speaking avatar). */
  portrait: AvatarAppearance;
  /** Delivery settings passed to the voice provider. */
  voiceSettings: { speed: number; stability: number; style: number };
  /** Neither images nor voices are historical recordings. */
  disclosure: 'ai_reconstruction';
}

/**
 * Provider assets configured for one character (stored in the database,
 * changeable without code). Each declares the presentation of the asset so it
 * can be checked against the character before use.
 */
export interface CharacterMediaConfig {
  characterId: string;
  avatar: {
    provider: string;
    /** Avatar look used for generated video segments. */
    avatarId: string | null;
    /** Avatar used for real-time sessions. */
    liveAvatarId: string | null;
    presentation: Presentation;
  };
  voice: {
    provider: string;
    voiceId: string | null;
    /** Language → voice id when a language needs its own voice. */
    languageVoices: Record<string, string>;
    presentation: Presentation;
  };
}

/** What a provider reports about an asset, when it reports anything. */
export interface ProviderAssetFacts {
  voiceGender?: string | null;
  avatarGender?: string | null;
}

/** A character's identity, brief and provider assets, after validation. */
export interface CharacterMediaProfile {
  characterId: string;
  avatar: { provider: string; avatarId: string | null; liveAvatarId: string | null };
  voice: { provider: string; voiceId: string | null; languageVoices: Record<string, string> };
  identity: { presentation: Presentation; ageProfile: AgeProfile | undefined };
  speech: { tone: string; pace: VoicePace; style: string };
  style: CharacterStyle;
}

export function ageProfileFor(age: number): AgeProfile {
  if (age < 30) return 'young';
  if (age < 40) return 'adult';
  if (age < 65) return 'mature';
  return 'elder';
}
