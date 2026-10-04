-- 0005: JoggAI as a second provider for rendered avatar video. `avatar_provider`
-- names the provider of `avatar_id` (the rendered-video avatar); the real-time
-- avatar (`live_avatar_id`) is always a LiveAvatar asset, so its uniqueness no
-- longer depends on the rendered-video provider.
ALTER TABLE character_media_profiles
  DROP CONSTRAINT character_media_profiles_avatar_provider_check,
  ADD CONSTRAINT character_media_profiles_avatar_provider_check
    CHECK (avatar_provider IN ('heygen', 'joggai'));

DROP INDEX character_media_profiles_live_avatar_uq;
CREATE UNIQUE INDEX character_media_profiles_live_avatar_uq
  ON character_media_profiles (live_avatar_id) WHERE live_avatar_id IS NOT NULL;
