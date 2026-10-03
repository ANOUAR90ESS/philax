# Prompts

All prompts live in `packages/prompts/src/templates` as `PromptTemplate`s with an
`id` and integer `version`; the built prompt carries `"<id>.v<version>"`, which is
logged with every call. Changing a prompt's behaviour means bumping its version.

| Template                                                                                                | Version | Tier    | Output schema                                                |
| ------------------------------------------------------------------------------------------------------- | ------- | ------- | ------------------------------------------------------------ |
| `topic-analyzer`                                                                                        | v1      | strong  | `TopicAnalysisSchema` (+ semantic refine)                    |
| `character-selector`                                                                                    | v1      | strong  | selection (ids from shortlist, distinct perspectives, roles) |
| `challenge-framing`                                                                                     | v1      | strong  | hidden assumptions, objection candidates, roles              |
| `debate-planner`                                                                                        | v1      | strong  | `DebatePlanSchema` (+ referential validation)                |
| `debate-opening` / `-challenge` / `-response` / `-cross-examination` / `-open-question` / `-user-reply` | v1      | strong  | `TurnOutputSchema`                                           |
| `debate-deep-disagreement`                                                                              | v1      | premium | `TurnOutputSchema`                                           |
| `objection-generator`                                                                                   | v1      | fast    | objection candidates                                         |
| `consistency-checker`                                                                                   | v1      | fast    | verdict + issues                                             |
| `synthesis`                                                                                             | v1      | premium | `SynthesisOutputSchema` (+ id and verdict checks)            |

Shared building blocks (`framework.ts`): `TRUST_RULES`, `untrusted()`,
`applicationState()`, `truncate()`, `languageInstruction()`. Turn prompts share
one builder (`turn-common.ts`) so debate rules are identical in every phase;
phase templates add only phase guidance.

Writing rules: instructions only in the system message; every piece of user or
retrieved text through `untrusted()`; JSON keys in English, human-readable values
in the debate language; never ask the model for scores the UI would display.
