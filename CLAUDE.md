# EquityWise

A **multi-user** tool for **tracking, analysing and screening NSE equities**: it shows
what the market and each stock are doing — trend, breakouts, momentum, volume, delivery,
ownership, events — from data, and lets the user screen and watch on their own
conditions. It describes; it never picks stocks, issues buy/sell signals or simulates
trades (removed 2026-10-17, see "Do not"). **Deployed publicly, with per-user accounts** — each user signs in and
owns their own watchlists and data (auth design: `docs/planning/authentication-plan.md`).
Multi-*user* (individuals), not multi-*tenant* (no organisations/teams).

> **Direction change (2026-09-06):** this was previously a single-user, never-public
> personal tool. It is now a multi-user product: the first-party login system and
> per-user data isolation are built (`docs/planning/authentication-plan.md`). Prose
> anywhere that still assumes a single user is out of date.

**This is not a broker and not a trading terminal.** It never places, manages, or
represents an order. Orders are placed by hand on a separate platform. The product
answers three questions and nothing else:

1. What is happening in the market?
2. Which stocks match the conditions I chose (screener, watchlists, alerts)?
3. What do the facts say about this stock?

**Fyers is a market-data provider, not the product.** The app is broker-independent:
business logic consumes a normalised `MarketDataProvider`, never a Fyers type. The
UI never presents itself as a Fyers client.

> **Update (2026-10-17): signals and paper trading are removed.** The intraday ORB-VC
> strategy (`/intraday`), per-user paper trading (`/paper-trading`), the daily signal
> engine and every surface that showed it (watchlist Signal/Setups columns and "Daily
> signals" view, the stock page's Signal tab, screener signal metrics, the Market brief's
> "Strategy research") are gone, with their tables (migration `0046`). Plan and record:
> `docs/planning/signals-and-paper-removal-plan.md`. The admin-only menu is now "Admin".

> **Update (2026-10-02):** `/ipos` — Indian mainboard and SME IPOs — is built for **every
> signed-in user** (in the "Markets" navigation menu). Since 2026-10-04 it is one section
> with a shared header (board scope All boards/Mainboard/SME, section tabs): `/ipos` is the
> Overview hub, `/ipos/all` the master table (`/ipos/mainboard`, `/ipos/sme` redirect there),
> `/ipos/calendar`, `/ipos/listings`, `/ipos/gmp` (unofficial) and `/ipos/pipeline` are its
> sections, and `/ipos/[slug]` is one issue in full. Official facts come from NSE's
> public IPO data and end-of-day file; an **unofficial** grey-market premium (GMP) comes
> from InvestorGain, always labelled, attributed and kept out of every official field.
> RHP sections are quoted from the document with their pages (figures stay the
> document's text), and DRHPs filed with SEBI are listed on their own, never as issues.
> No apply button, no rating, no opinion of any issue. Plan: `docs/planning/ipos-plan.md`;
> runbook: `docs/operations/ipo-pipeline.md`.

> **Update (2026-10-05):** `/portfolio` — a hand-typed or file-imported record of the
> signed-in user's own shares, valued at the last price, for **every signed-in user**.
> Never connected to a broker; no orders; describes, never advises. Plan:
> `docs/planning/holdings-plan.md`. Phase 1 (MVP) first; later phases are gated on data.

> **Update (2026-10-03):** stock analysis — `/screener`, `/stocks/[symbol]` and
> `/markets/breadth` (the "Screener" tab and the "Markets" menu) — is built for **every signed-in user**
> from Dhan, Fyers and data EquityWise already collects. The whole NSE EQ/BE/BZ universe
> comes from the bhavcopy (split/bonus-adjusted via `corporate_actions`); the worker
> builds a nightly `screener_snapshots` row per stock (~95 technical, delivery, F&O,
> ownership and event metrics; catalogue in `packages/core/src/screener/catalogue.ts`).
> **No fundamentals** (P/E, ROE, market cap…) — those need a new source. Plan:
> `docs/planning/screener-dhan-fyers-plan.md`.
> The stock page header (2026-10-04) adds a per-user ratio board (`user_ratio_layouts`),
> computed "What stands out" facts and a 12-month dividend yield from NSE corporate actions
> (`dividends` table — never applied to prices). Plan: `docs/planning/stock-header-redesign-plan.md`.

Design & architecture docs: `docs/README.md` (index), `docs/architecture/` (historical
or partly aspirational: `backtesting-architecture.md` was never built, `auth-system-design.md`
is superseded, `seo-architecture.md` describes an unbuilt public spine — the `seo` skill is
the as-built rule),
`docs/operations/deployment.md` (hosting, pipeline, credentials, backups, runbook),
`docs/reference/` (as-built references, e.g. the market calendar and indices strip), and
`docs/planning/` (plans; `pending-features.md` carries the code-verified status ledger).
There is no single schema/API reference yet: the schema lives in `packages/db/src/schema`,
the routes in `apps/web/src/app/api`.
Android app (Expo / React Native, planned, not yet in the tree): `docs/mobile/README.md`.

## Stack

Node 24 · TypeScript strict · pnpm workspaces · self-hosted PostgreSQL 17 + TimescaleDB
Drizzle ORM · Next.js (web) · croner (scheduler) · Zod · Vitest · Biome
Fyers API v3 and Dhan API v2 for market data. No Redis. No Celery. No Python in the app.

## Hard rules — violating these breaks the system

1. **`packages/core` is pure.** Every function takes data plus config and returns a
   result. No DB, no `Date.now()`, no network, no module-level mutable state, no
   `process.env`. This is what makes every calculation testable against fixed fixtures.

2. **Indicators and screener metrics use CLOSED candles only.** Never the forming
   candle. A value stored for a session is computed from that session's closed bars and
   nothing later.

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

7. **Portfolio data is private.** Every query is scoped by `owner_id` in the repository
   layer. Holdings, shares and cost are never written to logs, the event log, error
   reports or URLs. No admin screen shows them. Account deletion cascades. Uploaded
   files are parsed and discarded; only the rows the user reviewed are stored.

## Production hosting (self-hosted VPS)

The whole app — web app, worker, and database — runs on a single Hostinger VPS
(Ubuntu) behind Nginx, under PM2. Deploys are automatic: **merge to `main` →
GitHub Actions → `deploy.sh` on the VPS** (pull, build, migrate, restart). The
full as-built reference — server, pipeline, credentials, backups, local dev,
operations — is **`docs/operations/deployment.md`**. Read it before touching infrastructure.

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
  trading login kills it). See `docs/operations/deployment.md` §5.
- **Dhan is a second provider** (2026-09-17): `MARKET_DATA_PROVIDER=fyers|dhan|routed`
  selects it in both processes; the worker mints its token nightly (01:35 IST)
  into the same table under `provider_id='dhan'`. `routed` is the intended
  production shape — daily bars/quotes/instruments from Dhan, intraday bars/
  status/socket from Fyers, each falling back to the other. Dhan's own live
  socket exists (`MARKET_DATA_ROUTE_STREAM=dhan`, 5,000 symbols vs 200). Plan
  and evidence: `docs/planning/dhan-provider-plan.md`.

## Conventions

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`
- Zod schemas at every boundary — especially parsing Fyers responses
- Vitest; every indicator tested against independently hand-computed fixtures
- No `any`. No non-null assertions except in tests.
- Config in `config/*.yaml`, secrets in `.env` (gitignored)

## Do not

- The app is **multi-user**: user / account / session tables and a **minimal
  user-vs-admin role** ARE in scope (see `docs/planning/authentication-plan.md`).
  Still out of scope until explicitly planned: **organisation/team multi-tenancy**,
  a full RBAC role system, and **subscriptions/billing**
- Do not build an admin CRUD UI — config is versioned YAML
- Do not add Redis, Celery, Kubernetes, or Terraform
- Do not use `technicalindicators` or similar npm packages for the core indicator
  set; they are hand-written for auditability
- Do not put Fyers-specific types outside `packages/fyers` and its adapter. Nothing
  in `apps/*`, `packages/core`, or any DTO may import `@equitywise/fyers` or name a
  Fyers symbol, resolution, or field
- Do not use floating point for money
- **Do not build order execution of any kind** — no place/modify/cancel order, order
  book, funds, or broker portfolio. Nothing is ever fetched from a broker account.
  Holdings the user types in or uploads themselves ARE allowed (see "My portfolio")
- **No signals, setups, recommendations or paper trading** (removed 2026-10-17). The app
  never labels a stock BUY / SELL or bullish/bearish "setup", never ranks stocks by its
  own conviction or "setup strength", never names entry, target or stop levels, and
  never simulates trades. Paid stock recommendations need SEBI Research Analyst
  registration; bringing any of this back is a product decision, not a feature task.
  Users screen on conditions they choose; the app states facts about the data
- There is no order button, order ticket, or order-shaped affordance anywhere. Never
  "ORDER", "ENTRY PRICE", "position" or "quantity"; the UI must never imply the
  application could act on anything
- **Portfolio vocabulary.** On the portfolio page use "Added shares" / "Removed shares"
  (tax view: "Acquired" / "Disposed"), "Number of shares", "Holding", "Average cost".
  Never "Buy", "Sell", "Position", "Quantity", "Order", "Execute", "Rebalance",
  "Recommended", "Underweight", "Overweight". A sentence about a holding states a fact
  about the user's own numbers; it never tells them what to do
- Do not display a confidence number the factors cannot explain. Every score renders
  with its component breakdown or it does not render
