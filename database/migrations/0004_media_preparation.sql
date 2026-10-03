-- 0004: Automatic media preparation. Characters get their avatar and voice
-- prepared by the system when first selected for a debate; the profile records
-- each side's preparation status, a version that increases whenever an asset
-- changes, and the assets it replaced (debates never reference asset ids, so
-- changing them never breaks an existing debate).
ALTER TABLE character_media_profiles
  ADD COLUMN status            TEXT NOT NULL DEFAULT 'not_ready'
    CHECK (status IN ('not_ready', 'preparing', 'ready', 'failed')),
  ADD COLUMN avatar_status     TEXT CHECK (avatar_status IN ('ready', 'pending', 'failed')),
  ADD COLUMN voice_status      TEXT CHECK (voice_status IN ('ready', 'pending', 'failed')),
  ADD COLUMN avatar_pending_at TIMESTAMPTZ,
  ADD COLUMN voice_pending_at  TIMESTAMPTZ,
  ADD COLUMN version           INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN asset_history     JSONB NOT NULL DEFAULT '[]';

UPDATE character_media_profiles SET
  avatar_status = CASE WHEN avatar_id IS NOT NULL OR live_avatar_id IS NOT NULL THEN 'ready' END,
  voice_status = CASE WHEN voice_id IS NOT NULL THEN 'ready' END;
