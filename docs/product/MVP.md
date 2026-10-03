# MVP Scope and Status

| Capability (§59)                                                                  | Status | Where                                         |
| --------------------------------------------------------------------------------- | ------ | --------------------------------------------- |
| Input: text + URL                                                                 | ✅     | `modules/sources`, `modules/topics`           |
| Topic analysis (claims, assumptions, questions, values, predictions, definitions) | ✅     | `topic-analyzer.v1`                           |
| Perspective discovery with diversity                                              | ✅     | `modules/perspectives`                        |
| Character selection (multi-factor, no popularity)                                 | ✅     | `modules/characters`                          |
| Character knowledge (29 figures, sourced, epistemically labelled)                 | ✅     | `database/seeds`                              |
| RAG (FTS + optional pgvector, RRF)                                                | ✅     | `modules/knowledge`                           |
| Debate engine (state machine, 6 rounds, validated turns)                          | ✅     | `modules/debates`                             |
| User participation                                                                | ✅     | `USER_EXCHANGE` rounds                        |
| Challenge my idea                                                                 | ✅     | `mode: 'challenge'`                           |
| Sources (only stored, real references)                                            | ✅     | evidence pool + citations                     |
| Authentication                                                                    | ✅     | `modules/users`                               |
| Save / delete debates, delete account                                             | ✅     | API + My debates                              |
| Responsive, accessible, en/es/ar with RTL                                         | ✅     | `apps/web`                                    |
| Streaming                                                                         | ✅     | SSE drafts; persistence only after validation |

Deliberately **not** in the MVP (§60): social features, public profiles, voice,
video, real-time multiplayer, native apps, recommendations, marketplace,
payments UI ("Choose your own thinkers" is also deferred).

## Phase log

| Phase              | Result                                                       |
| ------------------ | ------------------------------------------------------------ |
| 0 Architecture     | pnpm monorepo, strict TS, lint/format, ADRs                  |
| 1 Foundation       | schema + migrations, auth, API, web shell, i18n              |
| 2 Knowledge        | seed, chunks, retrieval, embeddings indexer                  |
| 3 Topic engine     | extraction, analysis, perspectives                           |
| 4 Character engine | scoring, selection, evidence pool                            |
| 5 Debate engine    | planning, rounds, validation, consistency, synthesis         |
| 6 Participation    | user exchanges in debate state                               |
| 7 UX               | debate UI, streaming, loading/error states, a11y, responsive |
| 8 Evaluation       | dataset, offline gates, live evaluator, E2E                  |
| 9 Production       | bundle + ops CLI, Dockerfiles, CI, security review, ops docs |
