import { CharacterStyleRegistry, type AvatarAppearance, type Presentation } from '@philax/media';

export interface CharacterPortrait {
  appearance: AvatarAppearance;
  presentation: Presentation;
  age: number;
}

const registry = new CharacterStyleRegistry();

/**
 * A character's illustrated portrait from its validated identity brief, or
 * null when none may be shown (no brief, or one that failed validation).
 */
export function characterPortrait(slug: string | undefined): CharacterPortrait | null {
  if (!slug) return null;
  const brief = registry.resolve(slug);
  if (brief.status !== 'ready') return null;
  return {
    appearance: brief.style.portrait,
    presentation: brief.style.visualIdentity.presentation,
    age: brief.style.visualIdentity.approximateAge ?? 50,
  };
}

export function useCharacterPortrait(slug: string | undefined): CharacterPortrait | null {
  return characterPortrait(slug);
}
