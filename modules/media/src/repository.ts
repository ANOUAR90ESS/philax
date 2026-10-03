import type { Db } from '@philax/database';
import {
  MEDIA_LANGUAGES,
  ageProfileFor,
  type CharacterMediaConfig,
  type CharacterStyle,
  type Presentation,
} from '@philax/media';

/** A character's row in `character_media_profiles`, joined with its slug. */
export interface MediaProfileRow {
  characterId: string;
  slug: string;
  avatarProvider: string;
  avatarId: string | null;
  liveAvatarId: string | null;
  avatarPresentation: Presentation | null;
  voiceProvider: string;
  voiceId: string | null;
  voicePresentation: Presentation | null;
  presentation: Presentation;
  ageProfile: string | null;
  voiceStyle: Record<string, unknown>;
  visualNotes: string;
  languageConfiguration: { languages?: string[]; voices?: Record<string, string> };
  updatedAt: string;
}

const COLUMNS = `m.character_id AS "characterId", c.slug, m.avatar_provider AS "avatarProvider",
  m.avatar_id AS "avatarId", m.live_avatar_id AS "liveAvatarId", m.avatar_presentation AS "avatarPresentation",
  m.voice_provider AS "voiceProvider", m.voice_id AS "voiceId", m.voice_presentation AS "voicePresentation",
  m.presentation, m.age_profile AS "ageProfile", m.voice_style AS "voiceStyle", m.visual_notes AS "visualNotes",
  m.language_configuration AS "languageConfiguration", m.updated_at AS "updatedAt"`;

/** The configuration validation reads; missing presentations stay `unknown` (never assumed). */
export function toMediaConfig(row: MediaProfileRow): CharacterMediaConfig {
  return {
    characterId: row.slug,
    avatar: {
      provider: row.avatarProvider,
      avatarId: row.avatarId,
      liveAvatarId: row.liveAvatarId,
      presentation: row.avatarPresentation ?? 'unknown',
    },
    voice: {
      provider: row.voiceProvider,
      voiceId: row.voiceId,
      languageVoices: { ...(row.languageConfiguration.voices ?? {}) },
      presentation: row.voicePresentation ?? 'unknown',
    },
  };
}

export interface AssetAssignment {
  avatarId?: string | null;
  liveAvatarId?: string | null;
  avatarPresentation?: Presentation | null;
  voiceId?: string | null;
  voicePresentation?: Presentation | null;
  languageVoices?: Record<string, string>;
}

export class MediaProfileRepository {
  constructor(private readonly db: Db) {}

  async get(characterId: string): Promise<MediaProfileRow | null> {
    const { rows } = await this.db.query<MediaProfileRow>(
      `SELECT ${COLUMNS} FROM character_media_profiles m JOIN characters c ON c.id = m.character_id
       WHERE m.character_id = $1`,
      [characterId],
    );
    return rows[0] ?? null;
  }

  async list(): Promise<MediaProfileRow[]> {
    const { rows } = await this.db.query<MediaProfileRow>(
      `SELECT ${COLUMNS} FROM character_media_profiles m JOIN characters c ON c.id = m.character_id
       ORDER BY c.slug`,
    );
    return rows;
  }

  /**
   * Writes each character's identity brief (presentation, age, voice style,
   * visual notes). Configured asset ids are never touched. Returns the slugs
   * written; briefs for characters not in the database are skipped.
   */
  async syncBriefs(styles: readonly CharacterStyle[]): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      const written: string[] = [];
      for (const s of styles) {
        const age = s.visualIdentity.approximateAge;
        const { rowCount } = await tx.query(
          `INSERT INTO character_media_profiles
             (character_id, presentation, age_profile, voice_style, visual_notes, language_configuration)
           SELECT c.id, $2, $3, $4, $5, jsonb_build_object('languages', $6::jsonb, 'voices', '{}'::jsonb)
           FROM characters c WHERE c.slug = $1
           ON CONFLICT (character_id) DO UPDATE SET
             presentation = EXCLUDED.presentation,
             age_profile = EXCLUDED.age_profile,
             voice_style = EXCLUDED.voice_style,
             visual_notes = EXCLUDED.visual_notes,
             language_configuration = jsonb_set(
               character_media_profiles.language_configuration, '{languages}', $6::jsonb),
             updated_at = now()`,
          [
            s.characterId,
            s.visualIdentity.presentation,
            age === undefined ? null : ageProfileFor(age),
            JSON.stringify({
              tone: s.voiceIdentity.tone,
              pace: s.voiceIdentity.pace,
              speechStyle: s.voiceIdentity.speechStyle,
              settings: s.voiceSettings,
            }),
            [s.visualIdentity.era, s.visualIdentity.appearanceReference]
              .filter(Boolean)
              .join(' — '),
            JSON.stringify(MEDIA_LANGUAGES),
          ],
        );
        if (rowCount > 0) written.push(s.characterId);
      }
      return written;
    });
  }

  /** Assigns provider assets to a character (by slug). Uniqueness is enforced by the database. */
  async assign(slug: string, a: AssetAssignment): Promise<MediaProfileRow | null> {
    const { rowCount } = await this.db.query(
      `UPDATE character_media_profiles m SET
         avatar_id = CASE WHEN $2::boolean THEN $3 ELSE m.avatar_id END,
         live_avatar_id = CASE WHEN $4::boolean THEN $5 ELSE m.live_avatar_id END,
         avatar_presentation = CASE WHEN $6::boolean THEN $7 ELSE m.avatar_presentation END,
         voice_id = CASE WHEN $8::boolean THEN $9 ELSE m.voice_id END,
         voice_presentation = CASE WHEN $10::boolean THEN $11 ELSE m.voice_presentation END,
         language_configuration = CASE WHEN $12::boolean
           THEN jsonb_set(m.language_configuration, '{voices}', $13::jsonb)
           ELSE m.language_configuration END,
         updated_at = now()
       FROM characters c WHERE c.id = m.character_id AND c.slug = $1`,
      [
        slug,
        a.avatarId !== undefined,
        a.avatarId ?? null,
        a.liveAvatarId !== undefined,
        a.liveAvatarId ?? null,
        a.avatarPresentation !== undefined,
        a.avatarPresentation ?? null,
        a.voiceId !== undefined,
        a.voiceId ?? null,
        a.voicePresentation !== undefined,
        a.voicePresentation ?? null,
        a.languageVoices !== undefined,
        JSON.stringify(a.languageVoices ?? {}),
      ],
    );
    if (!rowCount) return null;
    const { rows } = await this.db.query<{ id: string }>(
      'SELECT id FROM characters WHERE slug = $1',
      [slug],
    );
    return rows[0] ? this.get(rows[0].id) : null;
  }
}
