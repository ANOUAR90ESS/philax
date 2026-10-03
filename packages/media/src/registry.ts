import { CHARACTER_IDENTITIES } from './identity/character-identities';
import type { CharacterIdentity, CharacterStyle } from './identity/types';
import { validateStyles, type IdentityIssue } from './identity/validation';
import { CHARACTER_STYLES } from './profiles/catalog';

export type StyleResolution =
  | { status: 'ready'; style: CharacterStyle; identity: CharacterIdentity }
  | { status: 'unavailable'; reason: 'no_profile' | 'invalid_profile'; issues: IdentityIssue[] };

/**
 * The only way to obtain a character's identity brief. Briefs that fail
 * validation are withheld; there is deliberately no generic fallback.
 */
export class CharacterStyleRegistry {
  private readonly identities: Map<string, CharacterIdentity>;
  private readonly styles = new Map<string, CharacterStyle>();
  private readonly rejected = new Map<string, IdentityIssue[]>();
  readonly issues: readonly IdentityIssue[];

  constructor(
    identities: readonly CharacterIdentity[] = CHARACTER_IDENTITIES,
    styles: readonly CharacterStyle[] = CHARACTER_STYLES,
  ) {
    this.identities = new Map(identities.map((i) => [i.characterSlug, i]));
    this.issues = validateStyles(identities, styles);
    for (const issue of this.issues) {
      const list = this.rejected.get(issue.characterId) ?? [];
      list.push(issue);
      this.rejected.set(issue.characterId, list);
    }
    for (const s of styles)
      if (!this.rejected.has(s.characterId)) this.styles.set(s.characterId, s);
  }

  resolve(characterSlug: string): StyleResolution {
    const rejected = this.rejected.get(characterSlug);
    if (rejected) return { status: 'unavailable', reason: 'invalid_profile', issues: rejected };
    const style = this.styles.get(characterSlug);
    const identity = this.identities.get(characterSlug);
    if (!style || !identity) return { status: 'unavailable', reason: 'no_profile', issues: [] };
    return { status: 'ready', style, identity };
  }

  identity(characterSlug: string): CharacterIdentity | undefined {
    return this.identities.get(characterSlug);
  }

  characters(): string[] {
    return [...this.styles.keys()];
  }
}
