import { CHARACTER_IDENTITIES } from './identity/character-identities';
import type { CharacterIdentity, CharacterMediaProfile } from './identity/types';
import { validateCatalog, type IdentityIssue } from './identity/validation';
import { MEDIA_PROFILES } from './profiles/catalog';

export type ProfileResolution =
  | { status: 'ready'; profile: CharacterMediaProfile; identity: CharacterIdentity }
  | { status: 'unavailable'; reason: 'no_profile' | 'invalid_profile'; issues: IdentityIssue[] };

/**
 * The only way the application obtains a media profile. Profiles that fail
 * identity validation are withheld; there is deliberately no fallback to a
 * generic or another character's avatar or voice.
 */
export class MediaProfileRegistry {
  private readonly identities: Map<string, CharacterIdentity>;
  private readonly profiles = new Map<string, CharacterMediaProfile>();
  private readonly rejected = new Map<string, IdentityIssue[]>();
  readonly issues: readonly IdentityIssue[];

  constructor(
    identities: readonly CharacterIdentity[] = CHARACTER_IDENTITIES,
    profiles: readonly CharacterMediaProfile[] = MEDIA_PROFILES,
  ) {
    this.identities = new Map(identities.map((i) => [i.characterSlug, i]));
    this.issues = validateCatalog(identities, profiles);
    for (const issue of this.issues) {
      const list = this.rejected.get(issue.characterId) ?? [];
      list.push(issue);
      this.rejected.set(issue.characterId, list);
    }
    for (const p of profiles)
      if (!this.rejected.has(p.characterId)) this.profiles.set(p.characterId, p);
  }

  resolve(characterSlug: string): ProfileResolution {
    const rejected = this.rejected.get(characterSlug);
    if (rejected) return { status: 'unavailable', reason: 'invalid_profile', issues: rejected };
    const profile = this.profiles.get(characterSlug);
    const identity = this.identities.get(characterSlug);
    if (!profile || !identity) return { status: 'unavailable', reason: 'no_profile', issues: [] };
    return { status: 'ready', profile, identity };
  }

  /** Slugs with a usable profile. */
  characters(): string[] {
    return [...this.profiles.keys()];
  }
}
