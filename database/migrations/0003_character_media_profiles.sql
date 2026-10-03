-- 0003: How each character is seen and heard. Provider asset ids (HeyGen
-- avatars, ElevenLabs voices) are configuration, set per character by an
-- operator; nothing here is a secret. Every asset declares the presentation it
-- has so it can be checked against the character before use, and no asset can
-- belong to two characters.
CREATE TABLE character_media_profiles (
  character_id           UUID PRIMARY KEY REFERENCES characters (id) ON DELETE CASCADE,
  avatar_provider        TEXT NOT NULL DEFAULT 'heygen' CHECK (avatar_provider IN ('heygen')),
  -- HeyGen avatar look rendered for video segments.
  avatar_id              TEXT,
  -- HeyGen LiveAvatar avatar used for real-time sessions.
  live_avatar_id         TEXT,
  avatar_presentation    TEXT CHECK (avatar_presentation IN ('male', 'female', 'androgynous')),
  voice_provider         TEXT NOT NULL DEFAULT 'elevenlabs' CHECK (voice_provider IN ('elevenlabs')),
  voice_id               TEXT,
  voice_presentation     TEXT CHECK (voice_presentation IN ('male', 'female', 'androgynous')),
  -- Identity brief (synced from the character style catalog).
  presentation           TEXT NOT NULL CHECK (presentation IN ('male', 'female', 'androgynous', 'unknown')),
  age_profile            TEXT CHECK (age_profile IN ('young', 'adult', 'mature', 'elder')),
  voice_style            JSONB NOT NULL DEFAULT '{}',
  visual_notes           TEXT NOT NULL DEFAULT '',
  -- {"languages": ["en","es","ar"], "voices": {"ar": "<voice id>"}}: per-language voice overrides.
  language_configuration JSONB NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((avatar_id IS NULL AND live_avatar_id IS NULL) OR avatar_presentation IS NOT NULL),
  CHECK (voice_id IS NULL OR voice_presentation IS NOT NULL)
);

CREATE UNIQUE INDEX character_media_profiles_avatar_uq
  ON character_media_profiles (avatar_provider, avatar_id) WHERE avatar_id IS NOT NULL;
CREATE UNIQUE INDEX character_media_profiles_live_avatar_uq
  ON character_media_profiles (avatar_provider, live_avatar_id) WHERE live_avatar_id IS NOT NULL;
CREATE UNIQUE INDEX character_media_profiles_voice_uq
  ON character_media_profiles (voice_provider, voice_id) WHERE voice_id IS NOT NULL;
