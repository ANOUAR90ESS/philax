# Architecture Decision Records

Each ADR records a decision, its context, and its consequences. New decisions are
appended; superseded decisions are marked rather than deleted.

---

## ADR-001 — Modular monolith in a pnpm workspace

**Status:** Accepted

**Context.** The spec requires clear module boundaries (topics, perspectives,
characters, knowledge, debates, …) but forbids premature microservices,
queues or Kubernetes (§20, §74).

**Decision.** One deployable API process (`apps/api`) and one static web app
(`apps/web`). Domain logic lives in workspace packages under `modules/*`,
cross-cutting libraries under `packages/*`, database tooling in `database/`.
Workspace packages are consumed as TypeScript source ("internal packages"); the
API is bundled with `tsup` for production and the web app with Vite.

**Consequences.** Boundaries are enforced by package dependencies and ESLint
`no-restricted-imports` rules rather than network hops. Any module can later be
extracted into a service because it only talks to others through exported
interfaces.

---

## ADR-002 — PostgreSQL + pgvector, plain SQL migrations

**Status:** Accepted

**Context.** Need relational data, vector search and full-text search; spec
mandates PostgreSQL + pgvector in MVP and migrations (§15, §29).

**Decision.** Use PostgreSQL 15+ with `pgvector` and the built-in full-text
search. Schema changes are versioned plain-SQL files in `database/migrations`,
applied by a small runner (`@philax/database`) that records filename + SHA-256
checksum in `schema_migrations` and refuses to run if an applied migration was
edited. Data access uses `pg` with parameterized SQL inside repositories (no
ORM).

**Why not an ORM / migration framework?** Plain SQL keeps pgvector and FTS
features first-class, works identically on Supabase, and the runner is ~100
lines with tests. Repositories keep SQL out of services.

**Consequences.** Any PostgreSQL host with `vector` works (local, Docker,
Supabase). Production schema is only ever changed through migrations.

---

## ADR-003 — First-party session authentication behind an interface

**Status:** Accepted

**Context.** Auth is in MVP scope. The spec lists Supabase variables but does not
require Supabase Auth, and a working local setup must not depend on external
credentials.

**Decision.** `modules/users` implements email + password auth: passwords hashed
with `scrypt` (Node crypto, per-user salt, timing-safe compare); sessions are
random 256-bit tokens stored **hashed** (SHA-256) in `sessions`, delivered as an
`HttpOnly; SameSite=Lax; Secure (in production)` cookie. The API depends on an
`AuthService` interface so an external identity provider (e.g. Supabase Auth JWT
verification) can replace it without touching controllers.

**Consequences.** No third-party dependency to run locally. Password reset email
is out of MVP scope (no email provider configured) and is not faked.

---

## ADR-004 — Fastify for the HTTP API

**Status:** Accepted

**Decision.** Fastify 5: mature plugin ecosystem for the mandatory security
controls (`@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`,
`@fastify/cookie`), first-class async handlers, request IDs and pino logging with
redaction. Layering: `routes → controllers → services (modules) → repositories`.

---

## ADR-005 — Provider-agnostic LLM gateway with model tiers

**Status:** Accepted

**Context.** §17, §36, §55: no business module may call a vendor directly;
fast/strong/premium tiers; retries, timeouts, provider fallback.

**Decision.** `packages/ai` defines `LLMProvider` (one per vendor, implemented
over `fetch` against the public REST APIs — no vendor SDKs) and `LLMGateway`,
which resolves a _tier_ to an ordered list of `provider:model` targets from
configuration, applies timeout + exponential-backoff retry per target and falls
back to the next target on retryable failure. Structured output goes through
`generateStructured(schema)`: JSON → Zod validate → one repair attempt with the
validation errors → validate again → otherwise throw. Every call emits a
telemetry record (provider, model, prompt version, latency, tokens, estimated
cost, validation status).

**Consequences.** Adding a vendor = one provider file. Tests inject a scripted
provider through the same interface; production code contains no fake provider.

---

## ADR-006 — Hybrid retrieval: full-text always, vectors when configured

**Status:** Accepted

**Context.** RAG must work, but embeddings require a paid API key that a
developer may not have; we must not fake embeddings.

**Decision.** Every chunk gets a generated `tsvector` column (language-aware
config `simple` + `english` stemming). If an `EmbeddingProvider` is configured,
chunks are also embedded (1536 dimensions, model name stored per row) and
retrieval fuses lexical and vector rankings with Reciprocal Rank Fusion. Without
embeddings, retrieval is lexical only and the retrieval trace says so.

**Consequences.** Real retrieval in every environment; quality improves when an
embedding model is configured. Vectors from different models are never compared
(filtered by `model`).

---

## ADR-007 — Debate as a persisted state machine, generated round by round

**Status:** Accepted

**Context.** §19–§21, §37, §55: state machine, streaming, per-message
idempotency, no full regeneration when one message fails.

**Decision.** The debate phase is a pure transition function in
`modules/debates/domain/state-machine.ts`. Creation runs analysis → perspective
discovery → character selection → planning synchronously and persists each
artifact. Rounds are generated on demand via `POST /api/debates/:id/advance`,
streamed over Server-Sent Events. Each turn is generated, validated (schema →
citations → consistency → redundancy), regenerated up to N times with feedback,
and **only then** persisted. A per-debate PostgreSQL advisory lock prevents
concurrent generation; re-calling `advance` resumes after the last persisted
message.

---

## ADR-008 — Streaming structured turns

**Decision.** Turns are generated as JSON whose first field is `speech`. The
server incrementally extracts the partial `speech` string from the token stream
and forwards it as `draft` SSE events; the full JSON is validated at the end. If
validation or consistency fails the client receives `discard` and the draft is
replaced; only accepted messages are persisted (§37).

---

## ADR-009 — Seed knowledge: bibliographic sources, paraphrased positions, no URLs until verified

**Status:** Accepted

**Context.** §14, §16, §58: no invented sources or citations. The development
environment that produced the seed had no network access to verify URLs.

**Decision.** Seed sources are bibliographic references to real, well-known
works (author, title, original publication year, `primary`/`secondary`). URLs
are deliberately omitted until a curator verifies them. Every knowledge entry is
a **paraphrase** written for this project with a `locator` (chapter/section) and
an explicit `knowledge_kind` (`documented_position`, `scholarly_interpretation`,
`biographical_fact`, `concept`). No direct quotations are seeded, because exact
wording could not be verified. Generated statements are never stored as
knowledge.

**Consequences.** The UI can show provenance honestly ("paraphrase of a
documented position, _On Liberty_, ch. 1"). Curators can add verified URLs and
primary-text excerpts through the ingestion CLI.

---

## ADR-010 — Frontend: React + Vite SPA, i18next, plain CSS with logical properties

**Decision.** `apps/web` is a Vite + React 19 SPA using React Router. All UI
strings live in `src/locales/{en,es,ar}.json` (i18next). Styling uses CSS custom
properties and logical properties (`margin-inline-start`, …) so Arabic RTL works
by setting `dir="rtl"` on `<html>`. No CSS framework: the UI is text-centric and
small. Server state goes through a typed API client in `src/api`.

---

## ADR-011 — Billing reduced to quotas in MVP

**Context.** Billing/Stripe is not in the MVP scope list (§59) but usage limits
are required for request validation (§32).

**Decision.** `modules/billing` implements plans (`free`, `pro`), a
`subscriptions` row per user and quota enforcement over `usage_events`. Stripe
integration is not built; there is no payment UI and no fake checkout.

---

## ADR-012 — Analytics and error reporting through sinks

**Decision.** Product analytics go through an `AnalyticsSink` interface. With
`POSTHOG_KEY` set, events are sent server-side to PostHog's capture API with
non-content properties only; otherwise analytics are disabled (no-op, logged at
debug). Errors return `{ error: { code, message, errorId } }`; the `errorId` is
the request id and is logged server-side with the stack trace. Sentry is not
integrated in MVP (no SDK); the hook point is the Fastify error handler.

---

## ADR-013 — Test doubles live only in `tests/`

**Decision.** Deterministic `ScriptedLLMProvider` and `HashingEmbeddingProvider`
live in `tests/support`. They implement the production interfaces and are wired
in by the integration/E2E harness via the API composition root
(`buildApp({ overrides })`). Production configuration has no way to select them.
