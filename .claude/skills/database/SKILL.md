---
name: database
description: Neon/Drizzle/TimescaleDB conventions for packages/db — connection strings, append-only triggers, migrations, timestamptz, hypertables, repository patterns. Use when adding a table, a migration, a repository function, or any query, and when touching apps/worker's startup connectivity.
---

# database

`packages/db` is the only package that touches Postgres. Everything here is verified
against the code as of the last audit (2026-08-29) — re-check before trusting a specific
line number.

> **Production host note (Sep 2026):** production Postgres is now **self-hosted on the
> VPS** (PostgreSQL 17 + TimescaleDB, localhost, **compression enabled**), not Neon.
> Both connection strings point at `localhost:5432` there — the pooled/direct split
> below still exists in the code and matters for Neon, but locally the two are identical.
> Neon is a retained fallback. For anything about the host, deploys, or the credential
> lifecycle, see `docs/operations/deployment.md` and the [deployment](../deployment/SKILL.md) skill.

## Two connection strings, one real guard

`DATABASE_URL` (pooled) and `DATABASE_URL_DIRECT` (unpooled) are not interchangeable.
`createDatabase()` (`packages/db/src/client.ts:46`) defaults to the **pooled** string —
migrations must pass `DATABASE_URL_DIRECT` explicitly.

The actual enforcement lives in `packages/db/drizzle.config.ts:7-20`: every `db:generate`/
`db:migrate`/`db:studio`/`db:push` command throws if `DATABASE_URL_DIRECT` is unset, and
throws again if the hostname contains `-pooler` — drizzle-kit will not run a migration
against a pooled connection. There is no equivalent runtime check on the *app* side; that
side is safe only because `createDatabase()` never reads `DATABASE_URL_DIRECT` at all.
`isPooledUrl()` (`env.ts:53-55`) is the reusable check, exercised in `env.test.ts:52-59`.

## Migrations: drizzle-kit by default, two hand-written exceptions

Migrations are drizzle-kit generated (`drizzle.config.ts:22-29`, schema at
`src/schema/index.ts`, casing `snake_case`). Two files are hand-written and say so at the
top: `0001_hypertables.sql` (drizzle-kit doesn't model hypertables) and
`0002_guards.sql`/`0004_intraday_guards.sql` (drizzle-kit doesn't model CHECK constraints
or triggers). If a change needs a hypertable, a CHECK, or a trigger, it's a hand-written
migration in this same style — not something to coax out of `drizzle-kit generate`.

Workflow: `pnpm db:generate` / `db:migrate` / `db:studio` at the repo root, proxying to
`packages/db`'s own scripts (`package.json:20-22` root, `:26-29` in the package).

## The guards that actually exist

- **Append-only**: a `reject_mutation()` trigger function (`0002_guards.sql:10-16`) raises
  on any `UPDATE` to `daily_candles`, `minute_candles`, or `strategy_versions`
  (`0002_guards.sql:19-23,26-30,36-48`). A correction is a new row (`corporate_actions`
  for prices, a new `strategy_versions` row for config), never an `UPDATE` — the trigger
  will reject it either way, so this isn't a style preference to remember, it's a wall.
- **Price sanity**: CHECK constraints require `open/high/low/close > 0`, `volume >= 0`,
  and OHLC coherence (`high >= low`, `high >= open`, etc.) on both candle tables
  (`0002_guards.sql:53-60,63-65`).
- **Intraday signal shape**: `0004_intraday_guards.sql:62-66` — a CHECK ties `ended_at
  IS NOT NULL` to exactly the terminal states (`invalidated`/`expired`/`target_met`), so a
  signal can't be half-closed. Also positive prices and `entry_high >= entry_low`
  (`:33-43`), and enum-style CHECKs on `quality`/`direction`/`state` (`:13-29`).
- **Single default watchlist**: a partial unique index, not a trigger —
  `uniqueIndex('watchlists_single_default_idx').on(table.isDefault).where(sql\`${table.isDefault}\`)`
  (`schema/watchlists.ts:914`).
- **Immutable strategy config**: `strategy_versions` has a unique `configHash`
  (`schema/signals.ts:783`) on top of the append-only trigger — the same config never
  mints two rows, and no row ever changes.

Every timestamp column across every schema file is `timestamp({ withTimezone: true })` —
no naive datetime exists anywhere in `packages/db/src/schema/`.

## Repository pattern

Every repository function takes `db: Database` as its first parameter — none holds its
own connection. Multi-write operations that must be atomic use `db.transaction(async
(tx) => {...})`: signal + factor breakdown together (`repositories/signals.ts:109`, this
is rule 8 — the breakdown is written in the same transaction as the signal, never after),
intraday signal create/update, and most of `watchlists.ts`'s mutations.

Bulk inserts are chunked to stay under Postgres's 65535 bind-parameter limit:
`INSERT_CHUNK = 2_000` (`candles.ts:38`), `UPSERT_CHUNK = 1_000` (`instruments.ts:32`),
plus a `READ_CHUNK = 10` (`candles.ts:49`) so a huge minute-bar read doesn't block the
event loop. A new bulk operation follows this chunking convention rather than sending one
giant multi-row statement.

## The retry/backoff claim is narrower than it sounds

CLAUDE.md says "every scheduled job retries connection failures with backoff." The
mechanism is real — `withRetry` (`client.ts:112-139`, exponential backoff with full
jitter, well-tested in `client.test.ts`) — but as of this audit it is wired into exactly
one call site: `apps/worker/src/index.ts:171-178`'s `waitForDatabase()`, run once at
**worker startup**, not per job execution. A job's own per-symbol `try/catch` (seen in
every file under `apps/worker/src/jobs/`) is failure isolation between symbols, not
connection retry. Don't assume a mid-job Neon cold-start is covered — it currently isn't.
If you need per-job retry, that's `withRetry` wrapping the job body, and it doesn't exist
yet.

## Testing convention: two distinct styles, pick correctly

- **Pure unit tests**, colocated next to source (not in `__tests__/`): test a pure
  function against hand-computed expected values, no DB connection —
  `repositories.test.ts`'s own comment warns against deriving the expected value from the
  implementation being tested. Use this for anything that doesn't depend on a trigger,
  CHECK, or index.
- **Real-Postgres schema tests**, in `packages/db/src/__tests__/`: spin up an ephemeral
  **Neon branch** (`neon-branch.ts`, calls the real Neon API), run the actual migrations
  against it, then try to violate the invariant and assert the write throws. This is the
  only way to test something a DB constraint enforces (uniqueness, a trigger, a partial
  index) — a mocked-DB unit test can't. These suites `describe.skip` themselves when
  `NEON_API_KEY`/`NEON_PROJECT_ID` aren't set, so they're opt-in locally.

## Confirmed still true

No `pg_cron` call and no `add_compression_policy` call exist anywhere in the repo — both
appear only as comments explaining why not to add them (`CLAUDE.md`,
`0001_hypertables.sql:6`, `apps/worker/src/index.ts:24-25`). Scheduling lives entirely in
`apps/worker` via `croner` (see the `worker` skill).
