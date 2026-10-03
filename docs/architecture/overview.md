# Architecture Overview

Philax is a **knowledge-grounded AI debate platform**. A user submits an idea,
question, text or URL; the system analyses it, discovers genuinely conflicting
perspectives, selects thinkers whose documented ideas represent them, retrieves
evidence from a curated knowledge base, and runs a multi-round, stateful debate
that the user can join. It never declares a winner.

## Shape

```
apps/web  (React SPA, i18n, RTL)  ──HTTP/SSE──▶  apps/api (Fastify)
                                                   │ routes → controllers
                                                   ▼
                     ┌──────────────── modules (domain services) ────────────────┐
                     │ users · billing · sources · topics · perspectives ·        │
                     │ characters · knowledge · arguments · debates               │
                     └───────────────┬──────────────────────────┬────────────────┘
                                     │                          │
                         packages/ai (LLM gateway,      database (pg pool, migrator,
                         embeddings, structured out)    seeds) → PostgreSQL + pgvector
                         packages/prompts (versioned)
```

| Layer          | Location           | Responsibility                                                                                                              |
| -------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Web            | `apps/web`         | UI only. Talks to the API through `src/api`. Never sees keys or prompts.                                                    |
| API            | `apps/api`         | HTTP concerns: validation (Zod), auth, rate limiting, security headers, SSE, error mapping. Composition root wires modules. |
| Domain modules | `modules/*`        | Business logic. Each has `domain/` (pure), `repositories/` (SQL), `services/`, `schemas/`.                                  |
| AI             | `packages/ai`      | `LLMProvider`s, `LLMGateway` (tiers, retry, fallback, telemetry), `EmbeddingProvider`s, structured generation.              |
| Prompts        | `packages/prompts` | Versioned prompt templates and the trust-boundary prompt builder.                                                           |
| Types          | `packages/types`   | Shared Zod schemas and inferred types (API contracts, domain).                                                              |
| Config         | `packages/config`  | Validated environment configuration.                                                                                        |
| UI kit         | `packages/ui`      | Accessible React primitives.                                                                                                |
| Database       | `database/`        | Migrations, seeds, pg client, transaction helper.                                                                           |

## Dependency rules

- `apps/web` → `packages/types`, `packages/ui` only (lint-enforced).
- `modules/*` → `packages/*`, `database`, and other modules' public `index.ts`.
- Only `packages/ai` knows vendor endpoints (lint-enforced).
- Repositories are the only place SQL is written.

See [data-flow.md](./data-flow.md) for the request pipeline,
[decisions.md](./decisions.md) for the ADRs and
[operations.md](./operations.md) for deployment, monitoring and the security review.
