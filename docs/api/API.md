# HTTP API

Base URL: `VITE_API_URL` (default `http://localhost:4000`). JSON in/out. Mutating
requests must be `application/json` and, if an `Origin` header is sent, come from
`CORS_ORIGINS`. Authentication is an `HttpOnly` session cookie (`philax_session`).

## Errors

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request is invalid.",
    "errorId": "…",
    "details": []
  }
}
```

`errorId` is the request id and appears in server logs. Codes: `VALIDATION_FAILED`
400 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 ·
`INVALID_STATE` 409 · `EXTRACTION_FAILED`/`URL_NOT_ALLOWED`/`NO_SUITABLE_CHARACTERS` 422 ·
`RATE_LIMITED`/`QUOTA_EXCEEDED` 429 · `AI_OUTPUT_INVALID` 502 · `AI_UNAVAILABLE` 503 · `INTERNAL` 500.

## Auth

| Method | Path                 | Body                                             | Response                    |
| ------ | -------------------- | ------------------------------------------------ | --------------------------- |
| POST   | `/api/auth/register` | `{email, password (≥10), displayName?, locale?}` | 201 `{user}` + cookie       |
| POST   | `/api/auth/login`    | `{email, password}`                              | `{user}` + cookie           |
| POST   | `/api/auth/logout`   | —                                                | 204                         |
| GET    | `/api/auth/me`       | —                                                | `{user}`                    |
| PATCH  | `/api/auth/me`       | `{locale}`                                       | `{user}`                    |
| DELETE | `/api/auth/me`       | —                                                | 204 (deletes all user data) |

Credential endpoints: 10 requests/minute per IP.

## Debates (auth required; other users' debates return 404)

| Method | Path                        | Body                                                                                        | Response                                                     |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| POST   | `/api/debates`              | `{input: {type:'text',content} \| {type:'url',url}, mode?: 'debate'\|'challenge', locale?}` | 201 `{debate: DebateView}`                                   |
| POST   | `/api/challenges`           | `{idea, locale?}`                                                                           | 201 `{debate}`                                               |
| GET    | `/api/debates`              | —                                                                                           | `{debates: DebateListItem[]}`                                |
| GET    | `/api/debates/:id`          | —                                                                                           | `{debate}`                                                   |
| POST   | `/api/debates/:id/advance`  | `{}`                                                                                        | **SSE** — prepares, generates the next round, or synthesizes |
| POST   | `/api/debates/:id/messages` | `{content}`                                                                                 | **SSE** — user enters the debate                             |
| POST   | `/api/debates/:id/save`     | `{saved}`                                                                                   | `{saved}`                                                    |
| DELETE | `/api/debates/:id`          | —                                                                                           | 204                                                          |
| POST   | `/api/debates/:id/events`   | `{event:'source_opened'}`                                                                   | 204 (analytics)                                              |

Generation endpoints: 20 requests/minute per IP plus daily plan quotas.
`DebateView.nextAction` (`advance` \| `synthesize` \| `none`) and `canUserJoin`
tell the client what is possible.

### SSE events (`DebateStreamEvent`)

`step` {step, status} · `round_started` {roundNumber, phase} · `turn_started`
{turnId, characterId} · `draft` {turnId, delta, reset?} · `discard` {turnId,
reason} · `message` {turnId, message} · `round_completed` · `synthesis` · `state`
{debate} (always last on success) · `error` {code, message, errorId}.

Drafts are previews; only `message` events carry accepted, persisted turns.

## Characters (public)

`GET /api/characters/:id` → `{character}` with documented positions, works,
sources, relations and constraints — the knowledge the debate is grounded in.

## Health

`GET /api/health` → `{status: 'ok'}` or 503 `{status: 'degraded'}`.

Types for every payload are exported from `@philax/types`.
