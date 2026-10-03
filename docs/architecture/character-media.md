# Character avatars and voices

Every debate character is seen and heard through a **media profile** that is part of
its identity, not a UI decoration. The code lives in `packages/media` (`@philax/media`);
the debate engine is untouched and its `DebateMessage` output is consumed as-is.

## Identity chain

```
Character (seed slug)
  → CharacterIdentity        canonical presentation + evidence (identity/character-identities.ts)
  → CharacterVisualIdentity  presentation, approximate age, era, visual reference
  → CharacterVoiceIdentity   presentation, age profile, tone, pace, speech style, languages
  → AvatarAppearance + VoiceRendering (what providers actually render)
```

`validateProfile` / `validateCatalog` (identity/validation.ts) reject, among others:

- an avatar or voice whose presentation differs from the character's (Arendt with a male
  voice, Marx with a female avatar), including avatar _features_ that contradict it
  (a beard or period dress of the other presentation);
- characters whose presentation is undocumented (`unknown`): nothing is assigned;
- a voice age that does not fit the portrait's age, or a pitch/rate that contradicts
  the voice profile's pace and age;
- a missing English, Spanish or Arabic voice;
- any avatar, appearance, voice id or voice rendering reused by another character.

`MediaProfileRegistry` is the only way to obtain a profile. Invalid or missing profiles
resolve to `unavailable`; there is no generic or borrowed fallback. The UI then shows a
neutral monogram and subtitles only.

A unit test checks that every seeded character has a valid profile, so adding a
character means adding one identity entry and one `defineProfile(...)` call.

## Providers and gateways

`AvatarProvider` (`generateAvatar`, `renderSpeech`) and `VoiceProvider` (`synthesize`)
are the provider interfaces. The application only talks to `AvatarGateway` and
`VoiceGateway`, which pick the provider named by the profile, verify that the returned
avatar presents as the character, cache reusable output, and turn provider failures
into explicit `unavailable` outcomes.

Built in (no keys, no cost):

| Provider            | What it does                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| `procedural-svg`    | Vector period portrait drawn from the profile's appearance, animated on device. |
| `browser-speech`    | Web Speech API voices, filtered by language and documented voice presentation.  |
| `heygen` (stub)     | Adapter for streaming/pre-rendered video avatars via a backend media proxy.     |
| `elevenlabs` (stub) | Adapter for TTS clips via a backend media proxy.                                |

Device voices are only used when their vendor documents their presentation (e.g.
"Microsoft Zira" female, "Microsoft Hamed" male); unknown voices are never used. Each
character's language voice id deterministically picks one compatible device voice and
renders it with the character's own pitch, rate and pauses, so the character keeps the
same identity across Arabic, Spanish and English. Several characters may share one
installed device voice; their renderings stay distinct (validated) and this is a device
limitation, not a profile choice. The stub adapters refuse calls until a backend proxy
endpoint holding the vendor credentials exists; vendor keys never reach the browser.

## Presentation

`planPresentation(message, participants, registry, language)` maps a `DebateMessage` to
the speaker's profile, subtitle segments with per-word visemes, and the avatar state of
every participant (`IDLE`, `LISTENING`, `THINKING`, `SPEAKING`, `CHALLENGING`,
`RESPONDING`, `AGREEING`, `DISAGREEING`, `CONSIDERING`). `StagePlayer` plays turns in
order, one sentence at a time: the voice speaks, its word boundaries move the
subtitles and drive the mouth, and without a usable voice the turn plays as timed
subtitles. The full text stays in the transcript, and any earlier turn can be replayed.

The stage always labels portraits and voices as an AI reconstruction, never as
historical images or recordings.

## Cost and latency

Nothing is rendered per message by default: the portrait is drawn and animated on the
device and speech is synthesized by the device. For paid providers, `planDelivery`
decides from measured capabilities (latency, cost per minute, delivery mode) and a
`RenderBudget` whether to stream, use pre-rendered segments (only for reusable text),
or show the still avatar with audio; rendered clips and videos are cached by provider,
voice/avatar, language and text hash.
