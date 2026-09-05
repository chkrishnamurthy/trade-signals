# EquityWise

Single-user personal tool for **tracking, analysing and screening NSE equities** to
surface technical setups worth attention — bullish/bearish setups, breakouts,
breakdowns, momentum, trend changes, volume anomalies. Decision support, not
execution. Not multi-tenant. Never deployed publicly.

**This is not a broker and not a trading terminal.** It never places, manages, or
represents an order. Orders are placed by hand on a separate platform. The product
answers three questions and nothing else:

1. What is happening in the market?
2. Which stocks deserve attention right now?
3. Why does this stock deserve attention?

**Fyers is a market-data provider, not the product.** The app is broker-independent:
business logic consumes a normalised `MarketDataProvider`, never a Fyers type. The
UI never presents itself as a Fyers client.

**Current scope: watchlists only.** The app has been stripped to the watchlists
surface (`/watchlists`) plus its data spine — the Fyers provider for live quotes,
`/api/search` to add names, and the daily end-of-day pass that feeds the watchlist's
indicator/return/signal columns. The dashboard, all-stocks, intraday-signals,
signal-performance and backtests pages and APIs were removed, along with the whole
intraday/backtest/paper-trading engine (`packages/core/src/intraday`, the worker's
intraday cycle, and the backtest scripts). New feature pages will be built on this
base later. The design docs above still describe the fuller original product as
historical intent; that intraday code no longer exists in the tree.

Design docs: `docs/nse-signals-technical-plan.md` (§1, §3, §5–§8 authoritative)
and `docs/nse-signals-prompt-pack-v2.md` (§2–§3 authoritative for stack and schema).

## Stack

Node 22 · TypeScript strict · pnpm workspaces · Neon Postgres 17 + timescaledb
Drizzle ORM · Next.js (web) · croner (scheduler) · Zod · Vitest · Biome
Fyers API v3 for market data. No Redis. No Celery. No Python in the app.

## Hard rules — violating these breaks the system

1. **`packages/core` is pure.** Every function takes data plus config and returns a
   result. No DB, no `Date.now()`, no network, no module-level mutable state, no
   `process.env`. This is what lets the backtester and the live path run identical code.

2. **Signals are computed on CLOSED candles only.** Never the forming candle. The
   tradeable entry is the NEXT candle's open. Any path that lets the engine see a
   price at or after the entry timestamp is lookahead bias and invalidates every backtest.

3. **All prices are INTEGER PAISE everywhere internally.** ₹1,245.50 is `124550`.
   Never `number` rupees, never floats, never a decimal library. Convert to a display
   string only in React components, via `formatPaise()` in `packages/shared`. Any
   variable holding rupees-as-float is a bug.

4. **Store only 1m and 1d candles.** 5m/15m/30m/1h derive via `time_bucket` with
   origin aligned to 09:15 IST. Weekly derives from daily. Never persist a derived
   timeframe.

5. **Never mutate price history.** Corporate actions are rows with adjustment
   factors, applied on read. No UPDATE on `candles`, ever.

6. **All timestamps are TIMESTAMPTZ in UTC in the database.** Convert to IST only at
   the presentation boundary. Never store a naive datetime. Never use the server's
   local timezone for anything.

7. **Strategy config is immutable and versioned.** Changing a weight mints a new
   `strategy_versions` row. Never UPDATE an existing version.

8. **Every signal writes its factor breakdown and indicator snapshot.** The
   "Why this signal?" UI reads `signal_factors`; it never recomputes.

## Production hosting (self-hosted VPS)

The whole app — web app, worker, and database — runs on a single Hostinger VPS
(Ubuntu) behind Nginx, under PM2. Deploys are automatic: **merge to `main` →
GitHub Actions → `deploy.sh` on the VPS** (pull, build, migrate, restart). The
full as-built reference — server, pipeline, credentials, backups, local dev,
operations — is **`docs/deployment.md`**. Read it before touching infrastructure.

- **The database is self-hosted PostgreSQL 17 + TimescaleDB on the VPS**, bound to
  localhost. **TimescaleDB compression IS enabled here** (unlike the old Neon
  host): `minute_candles`/`daily_candles` compress on a policy, cutting the candle
  store ~90%. This is what fixed the "database nearly full" problem.
- **PG 17, not 18** — TimescaleDB has no PG18 apt package. Neon ran PG18; the gap
  was bridged by rebuilding the schema from the drizzle migrations and copying data
  logically, never a raw dump/restore (which mishandles hypertables).
- Both `DATABASE_URL` and `DATABASE_URL_DIRECT` point at `localhost:5432` (no
  pooler, no SSL on the loopback). The pooled/direct distinction only mattered on
  Neon; the code still reads both and locally they are identical.
- **Neon is retained as a read-only fallback** with the migration-time snapshot —
  do not delete it until the VPS is proven stable for weeks. Its old caveats (no
  compression, scale-to-zero cold starts, no `pg_cron`) applied to Neon only.
- **Scheduling still lives in `apps/worker`** (croner), never `pg_cron` — a design
  rule independent of host. Scheduled jobs still retry connection failures with
  backoff.
- The Fyers market-data token is minted by the worker into `provider_credentials`
  and **self-heals** when invalidated early (Fyers is single-session; a manual
  trading login kills it). See `docs/deployment.md` §5.

## Conventions

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`
- Zod schemas at every boundary — especially parsing Fyers responses
- Vitest; every indicator tested against independently hand-computed fixtures
- No `any`. No non-null assertions except in tests.
- Config in `config/*.yaml`, secrets in `.env` (gitignored)

## Do not

- Do not add multi-tenancy, user tables, RBAC, or subscriptions
- Do not build an admin CRUD UI — config is versioned YAML
- Do not add Redis, Celery, Kubernetes, or Terraform
- Do not use `technicalindicators` or similar npm packages for the core indicator
  set; they are hand-written for auditability
- Do not put Fyers-specific types outside `packages/fyers` and its adapter. Nothing
  in `apps/*`, `packages/core`, or any DTO may import `@equitywise/fyers` or name a
  Fyers symbol, resolution, or field
- Do not use floating point for money
- **Do not build order execution of any kind** — no place/modify/cancel order, order
  book, positions, funds, holdings, or broker portfolio. Not even read-only
- **BUY / SELL may label a signal's direction, and nothing else.** The direction
  badge on a trade signal reads BUY or SELL because that is the fastest thing to
  scan. Every other word stays technical: "Bullish setup", "Breakout candidate",
  "Technical entry zone", "Invalidation level", "Watch". Never "ORDER", never
  "ENTRY PRICE", never "position", never "quantity". An entry or exit level is a
  technical price level and is labelled as one
- There is no order button, order ticket, or order-shaped affordance anywhere.
  A direction label describes price structure; it is not an instruction, and the
  UI must never imply the application could act on it
- Do not display a confidence number the factors cannot explain. Every score renders
  with its component breakdown or it does not render
