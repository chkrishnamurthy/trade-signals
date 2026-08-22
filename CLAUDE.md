# WealthOS

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

## Intraday trade signals

Second engine, alongside the daily one, and deliberately separate from it.

- `packages/core/src/intraday` is the whole analysis: bucketing, indicators,
  structure, patterns, levels, five strategies, the confluence scorer and the
  lifecycle state machine. Pure, like the rest of core (rule 1).
- `apps/worker` owns the loop: it pulls closed 1m candles into `minute_candles`
  every few minutes while the market is open, runs the engine, and persists
  signals with their factor breakdown, their evidence and their timeline.
- `apps/web` only READS. `/signals` and `/api/intraday-signals` serve what the
  worker stored; the web app never runs the engine and never calls the provider
  for bars. Two writers would race on the live-signal unique index.
- Timeframes 3m/5m/15m are derived from stored 1m bars in pure code, aligned to
  the 09:15 IST open (rule 4). Prior sessions warm the indicators; VWAP, the
  day's extremes, the opening range, volume and structure are today-only.
- Relative volume compares against the same MINUTE OF SESSION in prior
  sessions, never a full-day average.
- Config lives in `config/intraday.yaml` and mints a `strategy_versions` row
  (rule 7). `pnpm verify:intraday` replays any instant through the real engine
  and prints the evidence and every rejection.

### Costs decide which setups exist

Transaction costs are not a display concern, they are a filter, and getting
this wrong silently inverts every verdict the engine reaches.

- **Stops and targets are sized off the TREND-timeframe ATR** (`frame.atrLevels`),
  never the trigger timeframe. The median 3m ATR on a NIFTY 50 name is 0.088%
  of price, so a 1.6x target sized off it is 0.140% — below the ~0.146%
  round-trip cost. Every such setup is a structural loser however good the
  pattern looks. The 15m ATR is 0.246%, putting the same multiple at 0.393%.
  `frame.atrValue` (trigger) stays correct for break buffers and proximity.
- `packages/core/src/intraday/costs.ts` models the real NSE intraday schedule —
  brokerage, STT on the sell leg, exchange, SEBI, stamp on the buy leg, GST,
  and assumed slippage on both legs. Rates live in `config/intraday.yaml`.
- Every published reward-to-risk figure is NET of those costs. The binding
  filters are `minNetRiskReward`, `minTargetPercent` and `minStopPercent`.

### Measuring whether any of it works

The engine scores its own setups. That is not evidence, so it is graded
separately, against the tape.

- `resolvePaperTrade` in `packages/core/src/intraday/paper.ts` is the single
  grader, used by BOTH the live recorder and the backtester, so live and
  backtested results are produced by identical logic and can be compared.
  It is deliberately pessimistic: the fill is the next bar's OPEN (rule 2), a
  bar spanning both stop and target counts as a STOP, a fill past the
  invalidation is no trade at all, and a fill that has already spent half the
  risk budget is no trade either.
- `apps/worker/src/jobs/paper-trades.ts` records outcomes into `paper_trades`
  every cycle and settles them at the close. Per share, in paise. NO money,
  quantity or position is represented anywhere — that is still forbidden.
- `/signals/performance` reads them. Every rate is published with its margin of
  error, open trades are shown but never counted, and results are in R rather
  than rupees.
- `pnpm backtest:intraday` replays stored candles through the real engine and
  reports expectancy by score band, strategy, regime and exit. `pnpm
  replay:session <date>` does the same through the DATABASE path.
  `pnpm backfill:minutes --days N` deepens history first — a backtest over
  eight sessions is an anecdote.
- **Do not tune thresholds on a difference smaller than the sample's margin of
  error.** The report prints it for this reason.

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
- Do not put Fyers-specific types outside `packages/fyers` and its adapter. Nothing
  in `apps/*`, `packages/core`, or any DTO may import `@wealthos/fyers` or name a
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