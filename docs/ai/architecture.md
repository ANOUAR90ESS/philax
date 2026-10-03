# AI Architecture

## Gateway and providers (`packages/ai`)

Business modules call `LLMGateway.generate/stream` with a **tier**, an
**operation** name and a **prompt version** — never a vendor or model.

| Tier    | Default (Anthropic) | Used for                                                      |
| ------- | ------------------- | ------------------------------------------------------------- |
| fast    | `claude-haiku-4-5`  | consistency checks, objection candidates                      |
| strong  | `claude-sonnet-5-5` | topic analysis, selection, planning, challenge framing, turns |
| premium | `claude-opus-5-5`   | deep-disagreement turns, synthesis                            |

OpenAI and Google defaults exist (`gpt-5-mini`/`gpt-5`, `gemini-2.5-flash`/`-pro`)
but must be checked against the vendors' current model lists; override any tier
with `LLM_TIER_FAST|STRONG|PREMIUM="provider:model,provider:model"` (first =
primary, rest = fallbacks). When unset, every configured provider is used in
order anthropic → openai → google.

Per target: timeout (`LLM_TIMEOUT_MS`), up to `LLM_MAX_RETRIES` retries with
jittered exponential backoff on retryable errors (timeout, 429, 5xx, network),
then fallback to the next target on retryable/auth/refusal errors. A stream is
never retried after tokens reached the caller. Refusals (`stop_reason:
"refusal"`, OpenAI refusals, Gemini safety blocks) and truncation are explicit
errors, never silently accepted text.

The Anthropic provider uses the official SDK with SDK retries disabled and no
sampling parameters (current Claude models reject them). OpenAI and Google use
their REST APIs. Vendor code lives only in `packages/ai/src/providers` (lint rule).

## Structured outputs

`generateStructured(gateway, request, zodSchema, {refine, streamField})`:
parse first JSON object → Zod → semantic `refine` → on failure one repair call
carrying the exact validation errors → validate again → else `AI_OUTPUT_INVALID`.
Invalid data never reaches the next stage. `streamField` extracts the partially
generated `speech` string for live drafts.

## Retrieval (RAG)

`RetrievalService` (modules/knowledge): keywords (topic analysis provides English
keywords so Arabic/Spanish topics retrieve from the English knowledge base) →
PostgreSQL full-text search (`english` + `simple` configs) **and**, if
`EMBEDDING_MODEL` is set, pgvector cosine search (1536-d, filtered by model) →
Reciprocal Rank Fusion → metadata filters (character, source, user visibility).
Per participant, results are topped up with their documented positions so every
speaker is grounded. Embeddings: `pnpm knowledge:index` after seeding. Without
embeddings retrieval is lexical-only and says so in its trace.

## Prompt-injection defence (§34)

1. Only the system message carries instructions; it states the trust rules.
2. Application state is JSON in `<application_state>`.
3. User input, web pages, retrieved knowledge and transcript are wrapped in
   `<untrusted_content kind=…>`; delimiter look-alikes inside content are
   neutralized so content cannot close its wrapper.
4. Outputs are validated structurally and semantically (citations must exist in
   the evidence pool, ids must exist, verdict language rejected), so an injected
   instruction that slips through still cannot add fake sources or winners.
5. Tested: integration tests with hostile input; offline eval `injectionIsolation`;
   live eval measures compliance with canary instructions.

## Debate quality controls

| Requirement                        | Mechanism                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Meaningful disagreement (§3)       | perspective MMR over curated contrasts; selection penalizes shared traditions; planner designs axes; turn rules forbid drifting into agreement |
| Strongest objection (§23)          | candidates generated (fast tier), ranked in code by relevance × strength, deeper targets preferred                                             |
| Consistency (§24)                  | LLM checker against documented positions, constraints, cited evidence and the speaker's earlier turns → regenerate                             |
| No repetition (§65)                | argument memory (normalized claim fingerprints, Jaccard ≥ 0.6 = redundant)                                                                     |
| Memory (§66)                       | `debates.memory`: claims, objections, concessions, unresolved questions, used evidence, user positions                                         |
| No winner (§25)                    | no schema field for it; verdict regex (en/es/ar) on turns and synthesis                                                                        |
| Historical / contemporary (§12–13) | implied constraints (anachronism + no fake quotations / no unpublished views) and UI notices                                                   |

## Observability (§52)

Every LLM call writes an `ai_calls` row: debate/topic id, operation, tier,
provider, model, prompt version, attempt, latency, tokens, estimated cost (known
Anthropic prices only; otherwise null), retrieval count, validation status, error
code. No prompt or completion text is stored. Turn messages record their own
validation summary (attempts, rejection reasons, consistency outcome).
