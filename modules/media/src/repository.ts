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
  /** Overall preparation status of the character's media. */
  status: ProfileStatus;
  avatarStatus: SideStatus | null;
  voiceStatus: SideStatus | null;
  /** Increases whenever an asset changes; replaced assets are kept in `asset_history`. */
  version: number;
  updatedAt: string;
}

export type ProfileStatus = 'not_ready' | 'preparing' | 'ready' | 'failed';
export type SideStatus = 'ready' | 'pending' | 'failed';
export type MediaSide = 'avatar' | 'voice';

const COLUMNS = `m.character_id AS "characterId", c.slug, m.avatar_provider AS "avatarProvider",
  m.avatar_id AS "avatarId", m.live_avatar_id AS "liveAvatarId", m.avatar_presentation AS "avatarPresentation",
  m.voice_provider AS "voiceProvider", m.voice_id AS "voiceId", m.voice_presentation AS "voicePresentation",
  m.presentation, m.age_profile AS "ageProfile", m.voice_style AS "voiceStyle", m.visual_notes AS "visualNotes",
  m.language_configuration AS "languageConfiguration", m.status, m.avatar_status AS "avatarStatus",
  m.voice_status AS "voiceStatus", m.version, m.updated_at AS "updatedAt"`;

/** A side that has been pending this long is considered abandoned (e.g. the server restarted). */
const STALE_PENDING = '15 minutes';

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

export type AvatarVendor = 'heygen' | 'joggai';

export interface AssetAssignment {
  /** Provider of `avatarId` (the rendered-video avatar). */
  avatarProvider?: AvatarVendor;
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

  /**
   * Assigns provider assets to a character (by slug). Uniqueness is enforced by
   * the database. When an asset id changes, the profile version increases and
   * the replaced ids are kept in the profile's history.
   */
  async assign(slug: string, a: AssetAssignment): Promise<MediaProfileRow | null> {
    const id = await this.db.transaction(async (tx) => {
      // Locked so that concurrent assignments (avatar and voice prepared in parallel) do not overwrite each other.
      const { rows } = await tx.query<MediaProfileRow>(
        `SELECT ${COLUMNS} FROM character_media_profiles m JOIN characters c ON c.id = m.character_id
         WHERE c.slug = $1 FOR UPDATE OF m`,
        [slug],
      );
      const current = rows[0];
      if (!current) return null;
      await this.write(tx, current, a);
      return current.characterId;
    });
    return id ? this.get(id) : null;
  }

  private async write(tx: Db, current: MediaProfileRow, a: AssetAssignment): Promise<void> {
    const next = {
      avatarProvider: a.avatarProvider ?? current.avatarProvider,
      avatarId: a.avatarId !== undefined ? a.avatarId : current.avatarId,
      liveAvatarId: a.liveAvatarId !== undefined ? a.liveAvatarId : current.liveAvatarId,
      avatarPresentation:
        a.avatarPresentation !== undefined ? a.avatarPresentation : current.avatarPresentation,
      voiceId: a.voiceId !== undefined ? a.voiceId : current.voiceId,
      voicePresentation:
        a.voicePresentation !== undefined ? a.voicePresentation : current.voicePresentation,
      voices:
        a.languageVoices !== undefined
          ? a.languageVoices
          : (current.languageConfiguration.voices ?? {}),
    };
    const changed =
      next.avatarProvider !== current.avatarProvider ||
      next.avatarId !== current.avatarId ||
      next.liveAvatarId !== current.liveAvatarId ||
      next.voiceId !== current.voiceId ||
      JSON.stringify(next.voices) !== JSON.stringify(current.languageConfiguration.voices ?? {});
    // A side's status changes only when this assignment touches that side.
    const avatarTouched = a.avatarId !== undefined || a.liveAvatarId !== undefined;
    const voiceTouched = a.voiceId !== undefined;
    const avatarStatus = avatarTouched
      ? next.avatarId || next.liveAvatarId
        ? 'ready'
        : null
      : current.avatarStatus;
    const voiceStatus = voiceTouched ? (next.voiceId ? 'ready' : null) : current.voiceStatus;
    await tx.query(
      `UPDATE character_media_profiles SET
         avatar_id = $2, live_avatar_id = $3, avatar_presentation = $4,
         voice_id = $5, voice_presentation = $6, avatar_provider = $12,
         language_configuration = jsonb_set(language_configuration, '{voices}', $7::jsonb),
         avatar_status = $8, voice_status = $9,
         avatar_pending_at = CASE WHEN $8::text = 'pending' THEN avatar_pending_at END,
         voice_pending_at = CASE WHEN $9::text = 'pending' THEN voice_pending_at END,
         status = CASE
           WHEN $8::text = 'ready' AND $9::text = 'ready' THEN 'ready'
           WHEN $8::text = 'failed' OR $9::text = 'failed' THEN 'failed'
           WHEN $8::text = 'pending' OR $9::text = 'pending' THEN 'preparing'
           ELSE 'not_ready' END,
         version = version + CASE WHEN $10::boolean THEN 1 ELSE 0 END,
         asset_history = CASE WHEN $10::boolean THEN asset_history || $11::jsonb ELSE asset_history END,
         updated_at = now()
       WHERE character_id = $1`,
      [
        current.characterId,
        next.avatarId,
        next.liveAvatarId,
        next.avatarPresentation,
        next.voiceId,
        next.voicePresentation,
        JSON.stringify(next.voices),
        avatarStatus,
        voiceStatus,
        changed,
        JSON.stringify([
          {
            version: current.version,
            avatarProvider: current.avatarProvider,
            avatarId: current.avatarId,
            liveAvatarId: current.liveAvatarId,
            voiceId: current.voiceId,
            voices: current.languageConfiguration.voices ?? {},
            replacedAt: new Date().toISOString(),
          },
        ]),
        next.avatarProvider,
      ],
    );
  }

  async getBySlug(slug: string): Promise<MediaProfileRow | null> {
    const { rows } = await this.db.query<MediaProfileRow>(
      `SELECT ${COLUMNS} FROM character_media_profiles m JOIN characters c ON c.id = m.character_id
       WHERE c.slug = $1`,
      [slug],
    );
    return rows[0] ?? null;
  }

  /**
   * Creates a character's profile when it has none (a character selected for
   * the first time). The identity comes from its brief when one exists;
   * otherwise it stays `unknown` until recorded, and nothing is provisioned.
   */
  async ensure(
    characterId: string,
    identity: { presentation: Presentation; ageProfile: string | null; visualNotes: string },
  ): Promise<MediaProfileRow | null> {
    await this.db.query(
      `INSERT INTO character_media_profiles
         (character_id, presentation, age_profile, visual_notes, language_configuration)
       VALUES ($1, $2, $3, $4, jsonb_build_object('languages', $5::jsonb, 'voices', '{}'::jsonb))
       ON CONFLICT (character_id) DO NOTHING`,
      [
        characterId,
        identity.presentation,
        identity.ageProfile,
        identity.visualNotes,
        JSON.stringify(MEDIA_LANGUAGES),
      ],
    );
    return this.get(characterId);
  }

  /** Records the documented presentation of a character that has no identity brief in code. */
  async setPresentation(slug: string, presentation: Presentation): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE character_media_profiles m SET presentation = $2, updated_at = now()
       FROM characters c WHERE c.id = m.character_id AND c.slug = $1`,
      [slug, presentation],
    );
    return rowCount > 0;
  }

  /**
   * Claims the preparation of one side for this process. Returns false when the
   * side already has an asset or another preparation is in progress.
   */
  async claim(
    characterId: string,
    side: MediaSide,
    avatarProvider?: AvatarVendor,
  ): Promise<boolean> {
    // An avatar is missing when there is none, or only one from another video provider.
    const missing =
      side === 'avatar'
        ? `(avatar_id IS NULL OR avatar_provider IS DISTINCT FROM $2)`
        : `voice_id IS NULL`;
    const { rowCount } = await this.db.query(
      `UPDATE character_media_profiles SET ${side}_status = 'pending', ${side}_pending_at = now(),
         status = 'preparing', updated_at = now()
       WHERE character_id = $1 AND ${missing}
         AND (${side}_status IS DISTINCT FROM 'pending' OR ${side}_pending_at < now() - interval '${STALE_PENDING}')`,
      side === 'avatar' ? [characterId, avatarProvider ?? 'heygen'] : [characterId],
    );
    return rowCount > 0;
  }

  /** Marks a claimed side as failed (no asset is recorded). */
  async fail(characterId: string, side: MediaSide): Promise<void> {
    await this.db.query(
      `UPDATE character_media_profiles SET ${side}_status = 'failed', ${side}_pending_at = NULL,
         status = 'failed', updated_at = now()
       WHERE character_id = $1`,
      [characterId],
    );
  }

  async setStatus(characterId: string, status: ProfileStatus): Promise<void> {
    await this.db.query(
      `UPDATE character_media_profiles SET status = $2, updated_at = now() WHERE character_id = $1`,
      [characterId, status],
    );
  }
}
