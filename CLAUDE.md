# NSE Signal Platform

Single-user personal tool generating BUY/SELL/HOLD signals for NSE equities across
intraday and swing timeframes. Not a product. Not multi-tenant. Never deployed publicly.

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

## Neon specifics

- Two connection strings in env: `DATABASE_URL` (pooled, for the app) and
  `DATABASE_URL_DIRECT` (for migrations and COPY). Use the right one.
- **timescaledb compression is NOT available on Neon.** Hypertables and `time_bucket`
  work; `add_compression_policy` fails. Do not try.
- **Do not use `pg_cron`** — it doesn't fire while compute is suspended. Scheduling
  lives in `apps/worker`.
- Scale-to-zero means cold starts. Every scheduled job retries connection failures
  with backoff before treating it as an error.

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
- Do not put Fyers-specific types outside `packages/fyers`
- Do not use floating point for money