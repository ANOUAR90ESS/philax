# Data Flow

## 1. Creating a debate

```
POST /api/debates {input, mode}
  → Zod validation (length, URL scheme/credentials) → auth → daily quota
  → topics row (raw input kept private) + debates row (phase DEBATE_CREATED)
  ← 201 DebateView
```

## 2. Preparation — `POST /api/debates/:id/advance` (SSE) while phase is pre-debate

Each step emits `step` events and is persisted, so a failure resumes at the
failed step.

| Step         | Module         | What happens                                                                                                                                                                      | Persisted                                               |
| ------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| extract      | `sources`      | Text → normalized; URL → SSRF-checked fetch → Readability/Firecrawl → title/author/date/publisher/content → chunks                                                                | private `sources` + `source_chunks` (`user_content`)    |
| analyze      | `topics`       | Strong-tier LLM → `TopicAnalysis` (claims, assumptions, questions, value judgements, tensions, required perspectives, English retrieval keywords), Zod + semantic refine + repair | `topics.analysis`, `claims` → phase `TOPIC_ANALYZED`    |
| perspectives | `perspectives` | Relevance scoring + MMR diversity over the curated catalog                                                                                                                        | —                                                       |
| (challenge)  | `debates`      | Hidden assumptions, objection candidates (strongest selected in code), role → perspective                                                                                         | `debates.challenge`                                     |
| characters   | `characters`   | Multi-factor scoring → shortlist → LLM choice (validated) or deterministic assignment                                                                                             | `debate_participants`                                   |
| evidence     | `knowledge`    | Per participant: hybrid retrieval filtered to their knowledge, topped up with documented positions; plus the user's own input                                                     | `evidence` (labels E1…En) → phase `CHARACTERS_SELECTED` |
| plan         | `debates`      | LLM plan: disagreement axes, opening angles, who challenges whom, cross-examinations, deepest disagreement, open question (referentially validated; structural fallback)          | `debates.plan` → phase `DEBATE_PLANNED`                 |

## 3. Rounds — `advance` during the debate

```
nextAction(phase) → round phase → turnsForRound(plan, participants)
for each TurnSpec not yet persisted (turn_key):
   resolve reply-to message · (challenge) objection candidates → strongest
   build versioned prompt: system rules + dossier | application_state | <untrusted_content> topic/evidence/transcript
   stream JSON → `draft` events (speech field)
   validate: schema → citations ⊂ evidence pool → no verdict / certainty language
             → not redundant with argument memory → LLM consistency check
   reject → `discard` event + feedback → regenerate (≤3 attempts)
   accept → message + argument + citations (one transaction) → memory update → `message` event
round complete → phase advances (last scheduled round → USER_CHALLENGE)
```

A per-debate PostgreSQL advisory lock serializes generation. If the client
disconnects, generation stops before the next turn; accepted turns persist.

## 4. User participation — `POST /api/debates/:id/messages` (SSE)

User message is stored in a `USER_EXCHANGE` round and in `memory.userPositions`;
three participants then **respond**, **challenge** and **reframe** (rotating who
starts). The schedule phase does not change.

## 5. Synthesis — `advance` in USER_CHALLENGE

Premium-tier LLM maps agreements, disagreements (axis + why), assumptions, key
arguments (linked to messages), unresolved questions. Ids are validated and
verdict language is rejected. `sources` (all cited evidence) and `userPosition`
are filled deterministically. Phase → `COMPLETED`.

## 6. Deletion

`DELETE /api/debates/:id` deletes the topic (cascading to the debate, rounds,
messages, arguments, evidence, citations) and the private input source.
`DELETE /api/auth/me` deletes the user and everything they own. Telemetry rows
keep no content and lose their debate link.
