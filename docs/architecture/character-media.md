# Character media: avatars and voices

Every debate character can be **seen** (a lip-synced HeyGen avatar) and **heard**
(an ElevenLabs voice). Both are AI reconstructions and are labelled as such
everywhere they appear. Nothing here imitates a recording of the real person.

```
HeyGen      = avatar (real-time LiveAvatar, or rendered video segments)
ElevenLabs  = voice (TTS with per-character timing for subtitles and sync)
Debate Engine = what is said (unchanged; media only reads stored turns)
Character profile = who it is (identity brief + configured assets)
```

## Flow

```
Debate Engine ──(stored turn)──► Character Media Service ──► Voice gateway ──► ElevenLabs
                                   │  resolve + validate         (VoiceProvider)
                                   └────────────────────────► Avatar gateway ──► HeyGen LiveAvatar (LITE) / HeyGen v3 video
                                                                  (AvatarProvider)
Browser ◄── audio + timing / LiveKit viewer token / video URL ── Philax API (/api/media/*)
```

- `packages/media`: provider-free identity model: canonical identities, identity
  briefs (`CHARACTER_STYLES`: presentation, age, era, appearance, voice tone and
  pace, delivery settings), validation, subtitles, stage states.
- `modules/media` (`@philax/media-service`): provider ports
  (`VoiceProvider.synthesize`, `AvatarProvider.createSession / speak / stopSession`),
  the ElevenLabs, LiveAvatar and HeyGen video adapters (plain `fetch`/WebSocket, no
  SDKs), the `character_media_profiles` repository, the cache and
  `CharacterMediaService`.
- `apps/api`: `/api/media/*` routes (auth, ownership, rate limits).
- `apps/web`: the debate stage and its controls. It never talks to a provider.

Providers can be replaced by implementing the ports; the Debate Engine is not involved.

## Participant preparation (Media Orchestrator)

Characters are chosen for intellectual relevance only; media never limits who
can be selected. After the debate is planned, the debate service hands the
selected participants to the `MediaOrchestrator` (through its
`ParticipantPreparer` port) and the debate starts only when they are prepared.
Users see a single step, "Preparing the participants", never provider details.

```
Topic → Perspectives → Character selection → Knowledge → Plan
      → Media Orchestrator ─┬─ Voice gateway  → ElevenLabs (Voice Design)
                            └─ Avatar gateway → HeyGen (prompt avatar look)
      → Debate starts
```

For each participant, in parallel (two at a time, for provider rate limits):

1. Ensure a media profile exists (created on first selection).
2. Resolve the identity: the character's brief, or for characters added later
   the presentation recorded in its profile (`media:configure <slug>
--presentation …`). An unknown identity is never guessed, so nothing is
   prepared for it.
3. Reuse a valid existing voice and avatar.
4. Prepare only a side that is missing: a voice designed from the voice brief,
   or (video mode) an avatar look generated from the visual brief. Each side is
   claimed in the database, so concurrent debates prepare a character once.
   Transient provider failures are retried once.
5. Validate the result against the character (the provider's reported gender
   included), save it and validate the profile again as playback will see it.

Outcome: a participant is ready, or a side is simply not set up (no provider
key, `MEDIA_AUTO_PREPARE=false`, or a real-time LiveAvatar, which has no API to
create avatars and must be configured), in which case it is presented without
that side. If a preparation **failed**, the debate does not start: the user
sees "We couldn't prepare one of the participants. Please try again." and the
next attempt prepares again before the first round. Nothing is ever replaced
with another character's avatar or voice.

Internal states (`MEDIA_PREPARATION_STARTED`, `VOICE_RESOLVING`,
`AVATAR_RESOLVING`, `MEDIA_VALIDATING`, `MEDIA_READY`, `MEDIA_FAILED`) are
logged for operators only.

Profiles carry a per-side status, an overall status and a `version` that
increases whenever an asset changes; replaced assets are kept in
`asset_history`. Debates never store asset ids, so changing them never breaks
an existing debate.

## Security

- Keys are environment variables read by the API only: `ELEVENLABS_API_KEY`,
  `HEYGEN_API_KEY` (video segments), `LIVEAVATAR_API_KEY` (real-time). They never
  reach the browser, the database, prompts or source control, and are not logged.
- The browser receives only: audio bytes and timing, a HeyGen video URL, or a
  **session-scoped** LiveKit viewer token for a real-time avatar.
- The text to voice is always read from the stored debate turn after an ownership
  check (`debateId` + `messageId`), so the endpoints cannot voice arbitrary text.
- There is **no default voice or avatar**. A character without its own configured
  asset is "unavailable", never given another character's or a generic one.

## Identity checks

Before any provider call, `CharacterMediaService.resolve` checks:

1. The character has a valid identity brief (presentation documented, avatar and
   voice briefs agree on presentation and age, speed fits the pace).
2. The configured avatar and voice declare a presentation that matches the
   character (Marx cannot be given a female voice; Arendt cannot be given a male one).
3. What the provider reports matches too: ElevenLabs `labels.gender` of the voice,
   HeyGen `gender` of the avatar look. (LiveAvatar does not document per-avatar
   gender, so real-time avatars rely on the declared presentation.)
4. No asset is shared between characters (database unique indexes plus a check
   across all rows, including per-language voices).

A failure makes that side unavailable with a reason (`not_configured`,
`identity_mismatch`, `invalid_voice`, `provider_not_configured`, …). The UI shows
"Voice unavailable" / "Avatar unavailable" with the reason and, for transient
failures, Retry. The turn stays readable as captions.

## Playback modes

Chosen per turn from the user's controls and what is available:

| Mode    | When                                         | How                                                                                     |
| ------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `live`  | avatar on, `MEDIA_AVATAR_MODE=live`          | LiveAvatar LITE session; the API streams ElevenLabs PCM 24 kHz over the session socket  |
| `video` | avatar on, `MEDIA_AVATAR_MODE=video`         | voice plays immediately; a HeyGen v3 segment is rendered from the same audio for replay |
| `audio` | avatar off (or unavailable), voice on        | ElevenLabs MP3 with character timing                                                    |
| `text`  | voice muted and avatar off, or nothing works | captions on a reading-speed clock; no provider call at all                              |

Subtitles come from ElevenLabs character alignment. In `live` mode they start on
the avatar's `agent.speak_started` event, so captions follow the mouth.

Cost: each user has at most one real-time session (opening another closes the
previous one), sessions close after 90 s without speech, the server caps open
sessions (`MEDIA_MAX_LIVE_SESSIONS`), turns already on the page are not replayed
automatically, and audio is cached by character + voice + language + model +
delivery settings + exact text (no secrets in the key; it is a hash).

## Database

`character_media_profiles` (migration `0003`): `character_id`, `avatar_provider`,
`avatar_id` (HeyGen look), `live_avatar_id` (LiveAvatar), `avatar_presentation`,
`voice_provider`, `voice_id`, `voice_presentation`, `presentation`,
`age_profile`, `voice_style`, `visual_notes`, `language_configuration`
(`{"languages": [...], "voices": {"ar": "<voice id>"}}`), timestamps; migration
`0004` adds `status`, `avatar_status`, `voice_status`, `version` and
`asset_history`. Identity
columns are synced from the briefs; asset ids are set by an operator.

## Setting up a character

```bash
pnpm db:migrate
pnpm media media:sync                       # identity briefs for every character
# Voice: pick an existing ElevenLabs voice, or design one from the brief (spends credits):
pnpm media media:design-voice hannah-arendt # writes preview mp3s and prints generated ids
pnpm media media:design-voice hannah-arendt --save <generated voice id>
# or: pnpm media media:configure hannah-arendt --voice <voice id> --voice-presentation female
# Avatar: create the avatar in HeyGen/LiveAvatar from period references (AI reconstruction), then:
pnpm media media:configure hannah-arendt --live-avatar <liveavatar id> --avatar <heygen look id> --avatar-presentation female
pnpm media media:verify                     # read-only check against the live providers
```

With `MEDIA_AUTO_PREPARE=true` (the default) missing voices, and avatars in
video mode, are prepared automatically the first time a character is
selected; this spends provider credits once per character.

Per-language voices of the same character: `--voice-ar <id>`, `--voice-es <id>`.
The character never changes with the language.

Without keys the app runs normally and shows **Provider status: NOT CONFIGURED**.

## Provider APIs used

- ElevenLabs: `POST /v1/text-to-speech/{voice_id}/with-timestamps`,
  `GET /v1/voices/{voice_id}`, `POST /v1/text-to-voice/design`, `POST /v1/text-to-voice`.
- HeyGen LiveAvatar: `POST /v1/sessions/token` (mode `LITE`), `POST /v1/sessions/start`,
  `POST /v1/sessions/stop`; WebSocket commands `agent.speak`, `agent.speak_end`,
  `agent.interrupt`; events `session.state_updated`, `agent.speak_started`,
  `agent.speak_ended`, `agent.speak_interrupted`, `error`.
- HeyGen v3: `POST /v3/assets`, `POST /v3/videos`, `GET /v3/videos/{id}`,
  `GET /v3/avatars/looks/{id}`, `POST /v3/avatars` (type `prompt`).

Provider errors are classified (invalid key, quota, rate limit with Retry-After,
timeout, unavailable, invalid asset, generation failure). Mocks of these
providers exist only in automated tests.
