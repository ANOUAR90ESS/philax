# Deployment, Operations and Security

## Topology (MVP)

- **API**: one stateless Node process (`deploy/api.Dockerfile`) — scale horizontally;
  debate generation is serialized per debate by PostgreSQL advisory locks.
- **Web**: static files (`deploy/web.Dockerfile`, nginx with security headers) or any
  static host/CDN. Prefer serving the API under the same site (e.g. `/api` behind
  the same domain) so session cookies stay first-party.
- **Database**: PostgreSQL 15+ with `vector` (managed Postgres or Supabase).

Release steps:

```bash
node dist/ops.js migrate   # apply new migrations (refuses edited ones)
node dist/ops.js seed      # idempotent; retires changed chunks
# optional when EMBEDDING_MODEL is set (run from the repo): pnpm knowledge:index
```

Required production env: `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`
(≥32 chars; the config refuses to start otherwise), `CORS_ORIGINS`, at least one
LLM key, and `TRUST_PROXY_HOPS` matching your proxy setup.

## Monitoring

- `GET /api/health` (checks the database) for load balancers / container health.
- Structured JSON logs (pino) with request ids; cookies, authorization headers and
  password fields are redacted; request bodies are not logged.
- `ai_calls` table: latency, tokens, estimated cost, validation outcome and error
  code per LLM call — query it for dashboards and alerts (error rate by provider,
  cost per debate, regeneration rate).
- Product analytics via PostHog when `POSTHOG_KEY` is set (event names and
  non-content properties only).
- Sentry is **not** integrated in the MVP; the hook point is the Fastify error
  handler (`apps/api/src/plugins/error-handler.ts`).

## Backups

Use the provider's point-in-time recovery (Supabase/managed Postgres) or scheduled
`pg_dump --format=custom` with retention matching the privacy policy. User
deletions are hard deletes, so restoring a backup can resurrect deleted data:
re-apply deletions after a restore (keep an audit of deleted user ids outside the
backup if required by your jurisdiction).

## Security review (MVP)

| Control (§33–34)         | Implementation                                                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets server-side only | Keys read from env in `@philax/config`; ESLint forbids AI/config/prompt imports in the web app; `.env` git-ignored                                                                                                                           |
| Authentication           | scrypt (N=2¹⁵) password hashes, 256-bit session tokens stored as SHA-256, `HttpOnly`/`SameSite=Lax`/`Secure` (prod) cookies, 30-day expiry, hourly purge                                                                                     |
| Authorization            | every debate operation checks ownership; others' debates return 404; private sources filtered in retrieval SQL                                                                                                                               |
| Rate limiting            | global 300/min/IP, credentials 10/min, generation 20/min, plus daily plan quotas                                                                                                                                                             |
| CSRF                     | SameSite cookies + JSON-only mutations + Origin allow-list                                                                                                                                                                                   |
| Input validation         | Zod on every body/param; URL scheme/port/credential checks                                                                                                                                                                                   |
| SSRF                     | DNS resolution with private/reserved range blocking (v4/v6, mapped), redirect re-validation, 3 MB / 15 s caps, HTML/text only. Residual risk: DNS rebinding between check and connect — mitigate with an egress proxy/firewall in production |
| Output validation        | Zod + referential checks on all LLM output before persistence                                                                                                                                                                                |
| SQL                      | parameterized queries only; interpolated identifiers are module constants                                                                                                                                                                    |
| Headers / CORS           | helmet (strict CSP for JSON API), nginx headers for the web app, explicit CORS origins                                                                                                                                                       |
| Prompt injection         | trust-boundary prompts, delimiter-safe wrapping, output validation (see `docs/ai/architecture.md`)                                                                                                                                           |
| Logging                  | redaction; no content in telemetry                                                                                                                                                                                                           |
| Errors                   | user-safe messages with `errorId`; stack traces only in server logs                                                                                                                                                                          |

Known MVP gaps (documented, not hidden): no email verification or password reset
(no email provider configured), no Stripe billing, no Sentry, live AI evaluation
pending provider keys.
