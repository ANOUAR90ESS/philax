# Philax

A **knowledge-grounded AI debate platform**. Submit a question, claim, passage or
link. Philax analyses it into claims and assumptions, discovers perspectives that
genuinely disagree, selects thinkers whose documented ideas represent them,
retrieves evidence from a curated knowledge base, and runs a structured
multi-round debate — with citations — that you can join. It never declares a
winner: it ends by mapping agreements, disagreements, assumptions and the
strongest open question, and asks what _you_ think.

## Quick start

Requirements: Node 22+, pnpm 10, PostgreSQL 15+ with `pgvector` (or `docker compose up -d`).

```bash
pnpm install
cp .env.example .env          # set DATABASE_URL, SESSION_SECRET and at least one LLM key
pnpm db:migrate && pnpm db:seed
pnpm knowledge:index          # optional, only if EMBEDDING_MODEL is set
pnpm dev                      # API on :4000, web on :5173
```

Without an LLM key the app runs, but debate creation returns a clear
`AI_UNAVAILABLE` error — there is no fake mode.

| Command                           | Purpose                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm format:check` | ESLint (incl. architecture boundaries) / Prettier                                        |
| `pnpm typecheck`                  | strict TypeScript across the workspace                                                   |
| `pnpm test`                       | unit, web and integration tests (needs `TEST_DATABASE_URL`) incl. offline AI eval gates  |
| `pnpm test:e2e`                   | Playwright E2E (real API + DB, deterministic fixture LLM)                                |
| `pnpm eval [--live N]`            | AI evaluation report (`--live` uses real providers and costs money)                      |
| `pnpm build`                      | production bundles (API via tsup, web via Vite)                                          |
| `pnpm media media:<command>`      | character avatars/voices: `sync`, `configure`, `verify`, `design-voice` (see media docs) |

## Repository

```
apps/api        Fastify API: routes → controllers → module services; SSE streaming
apps/web        React SPA (i18n en/es/ar, RTL), features: input, debate, topic, characters, sources, profile
packages/       types (Zod contracts) · config · prompts (versioned) · ai (LLM gateway, embeddings) · ui · media (character identity briefs, subtitles)
modules/        users · billing · sources · topics · perspectives · characters · knowledge · arguments · debates · media (HeyGen/ElevenLabs gateway)
database/       SQL migrations, curated seed (29 thinkers, 23 perspectives), migration/seed runners
tests/          integration, E2E, evaluation dataset, test doubles
docs/           architecture (overview, ADRs, data flow, operations), api, ai, knowledge, product
deploy/         Dockerfiles and nginx config
```

Start with [docs/architecture/overview.md](docs/architecture/overview.md) and
[docs/architecture/decisions.md](docs/architecture/decisions.md). Character avatars and
voices are described in [docs/architecture/character-media.md](docs/architecture/character-media.md).

## Principles

- Optimize for meaningful disagreement, not agreement; never pick a winner.
- Characters are database entities with documented, sourced positions — not names
  handed to an LLM. Historical figures are labelled as reconstructions;
  contemporary figures are limited to published statements.
- No invented sources: every citation resolves to a stored source chunk. Seed
  references are bibliographic; unverified URLs are omitted rather than guessed.
- External content is data, never instructions.
