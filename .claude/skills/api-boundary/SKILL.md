---
name: api-boundary
description: Conventions for apps/web/src/app/api routes — Zod validation, the server/ layer routes must delegate to, error-response shape, auth via middleware only, the read-only rule for derived data. Use when adding or changing a route.ts file, or touching apps/web/src/server.
---

# api-boundary

Verified against the code as of the last audit (2026-08-29). A route handler in this repo
does exactly three things: read params/body, call a `server/*` function, map the result
or error to `NextResponse`. It never imports `@equitywise/db` or `@equitywise/core`
directly — those only ever appear inside `apps/web/src/server/*.ts`.

## Auth is middleware-only — never re-implement it in a route

`apps/web/src/middleware.ts` runs `clerkMiddleware`, default-denies everything, and
matches `/api/(.*)`. An unauthenticated request to any API route gets a `401` with
`{ error, code: 'UNAUTHENTICATED', remedy }` from the middleware itself. **No route file
imports `@clerk/nextjs` or calls `auth()`/`currentUser()`** — confirmed by grep, zero
matches. A new route gets auth for free; adding an auth check inside the route is
redundant and a sign something is off.

## Zod validates bodies, not query/route params — know which convention applies

Every route that accepts a request body validates it with Zod, via a shared
`parseBody(request, schema)` helper (`server/watchlist-routes.ts`) and schemas defined in
`server/watchlist-schemas.ts`. **This is the only place Zod is used for request
validation** — no `route.ts` file imports Zod directly.

Dynamic route params and query strings are validated ad hoc instead: a hand-written
`Record` lookup for an enum-like param (`history/[symbol]/route.ts`'s timeframe), a
`Number()` + `Number.isSafeInteger` check for a numeric id, or no validation at the route
layer at all, left to the downstream `server/` function to reject. A new route with a body should use
`parseBody` + a schema in the `watchlist-schemas.ts` style; a new route with a dynamic
segment should not assume Zod is already the norm there — match whatever the nearest
existing route of the same shape does, or centralize the check rather than inventing a
third pattern.

## Error shape: one shape, two ways of producing it

Every error response has the same fields: `{ error: string, code: string, remedy?:
string, retryAfterSeconds?: number }`. `server/errors.ts`'s `MarketDataError`/
`toMarketError`/`BY_FAILURE` is the canonical source (maps provider failure kinds to
`{code, status}`: `auth→401`, `rate_limit→429`, `not_configured→503`, `upstream→502`,
`not_found→404`, `unsupported→501`, `unknown→500`).

Two call patterns both produce this shape today: most routes build the JSON object by
hand in their catch block; watchlist routes go through a shared `handle`/`jsonError`/`ok`
trio in `server/watchlist-routes.ts`, which additionally maps a Postgres unique-constraint
violation to `409 DUPLICATE_NAME`. **Prefer the `handle`/`jsonError` pattern for new
routes** — it's DRYer and it's what the shared helper exists for — but if hand-rolling,
match the field names exactly, since the client renders `error`/`code`/`remedy` uniformly
regardless of which route produced them.

## Derived data is read-only from the web app

Routes and `server/` modules READ what the worker derived — `daily_indicators`,
`screener_snapshots`, `latest_quotes`, market breadth — and never recompute or write it.
The one provider call a page path makes on its own is `getMarketStatus()`
(`server/market-status.ts`), strictly to ask whether the exchange is open. If new code
starts reaching for bars or a calculation through that chain, that is a leak — report it.
(The `intraday-signals` routes this section once described were removed long ago, and the
`/api/intraday` and `/api/paper` routes on 2026-10-17.)

`server/provider.ts` is explicitly "the ONLY module in `apps/web` allowed to name a
concrete provider" — see the `provider-boundary` skill for the full rule.

## Caching: `no-store` by default, and route segment config

Nearly every route sets `Cache-Control: no-store` on both success and error responses,
plus `export const dynamic = 'force-dynamic'` and `export const runtime = 'nodejs'`; slow
routes add `export const maxDuration = 60`. A route serving a deliberately stale snapshot
(the dashboard does this) sets a custom `X-Stale-Reason` header and `Retry-After` rather
than silently caching. A new route should default to `no-store` unless there's a specific,
stated reason to cache.

## Status codes in use

`200` default success, `201` on creation, `400` malformed/invalid input, `404` missing
resource, `409` domain conflict (currently only the duplicate-watchlist-name case),
`401` from the middleware only, and `429`/`502`/`503`/`501`/`500` from
`MarketDataError`/`BY_FAILURE` for provider-side failures. Don't invent a new status code
outside this set without a specific reason — the client's error handling is written
against this list.
