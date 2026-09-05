# Pending features

A review of what is built, what is half-built, and what is declared but absent —
as of 2026-08-24, with all 27 test files / 502 tests passing.

**Changed since first written:** item 1.3 (watchlists) is now built — see
[Watchlists](#13-watchlists-on-the-database-done). That work also made the
watchlist page the first consumer of `daily_indicators`, which is the read
pattern item 1.1 needs.

Items are ordered by **cost-to-value**, not by ambition. Tier 1 is largely wiring
work over code that already exists and is already tested; Tier 4 is genuinely new
surface. Every item names the files involved and the hard rules from
[CLAUDE.md](../CLAUDE.md) that constrain it.

---

## What is already finished

Stated first so the gaps below are not read as a bleak picture.

| Area | State |
| --- | --- |
| Intraday engine | Complete. Bucketing, indicators, structure, patterns, levels, five strategies, confluence scoring, lifecycle state machine — all pure, all tested |
| Intraday persistence | Complete. Signals, factors, reasons, events, runs; worker writes, web reads |
| Paper grading | Complete. One grader shared by live recorder and backtester; `/signals/performance` publishes rates with margins of error |
| Cost model | Complete. Real NSE intraday schedule; every published R:R is net |
| Provider boundary | Complete. Fyers types confined to `packages/fyers` + adapter |
| Daily ingestion & indicators | Complete in the worker; see [Tier 1.1](#11-serve-daily-signals-from-the-database) for the read side |
| Credential refresh | Complete. TOTP login at 08:30 IST, written to `provider_credentials` |
| Backtest / replay / coverage tooling | Complete as scripts |
| Design system, dashboard, stocks page | Complete |
| Watchlists | Complete — see [1.3](#13-watchlists-on-the-database-done) |

---

## Tier 1 — built but unwired

Code that exists, compiles, and has no caller. This is the cheapest tier by a
wide margin: the engine work is done and the tests are already written.

### 1.1 Serve daily signals from the database

**What exists.** `apps/worker/src/jobs/compute-indicators.ts:104` already runs the
daily engine over stored candles and calls `saveSignal`, writing `signals` and
`signal_factors` with a registered `strategy_versions` row. The read side exists
too: `getSignalsForDate` and `getSignalFactors`
(`packages/db/src/repositories/signals.ts:173,207`).

**What is missing.** Neither read function has a single caller. The web app
instead **recomputes** the daily engine in-process on every cache miss —
`apps/web/src/server/signals.ts` pulls 400 days of history per symbol from the
provider, runs `evaluateSignals` and `scanSwing`, and serves factors out of a
module-level `Map`.

**Why it matters.** Three separate costs:

- It is the expensive half of the dashboard by the file's own admission — a
  50-stock index costs 50 provider requests, roughly a quarter of the per-minute
  budget, for a number the worker already computed for free.
- It sits in tension with **hard rule 8**: the factor breakdown the UI renders is
  recomputed in the web process rather than read from `signal_factors`.
- It contradicts the intraday doctrine ("`apps/web` only READS") for no reason
  other than that the daily path was built first.

**Done when.** `apps/web/src/server/signals.ts` reads `getSignalsForDate` /
`getSignalFactors`, the provider fetch is deleted, and a stale-data state is
rendered when the worker has not run rather than silently recomputing.

### 1.2 Screener

**What exists.** A complete screener backend: `ScreenerFilter`, `ScreenerSort`,
`ScreenerQuery`, `ScreenerRow` and the `screen()` query builder
(`packages/db/src/repositories/indicators.ts:116-293`), covering price ranges,
percent-move ranges, above/below each EMA, and EMA stack alignment.

**What is missing.** No API route, no page, no caller of any kind. The nav
already declares it (`apps/web/src/lib/navigation.ts`, "Screener — Multi-condition
technical filters", `status: 'planned'`).

**Done when.** `GET /api/screener` with a Zod-validated query, and a `/screener`
page reusing `stocks-table.tsx`. The filter vocabulary must stay technical per
the BUY/SELL rule — "above 200 EMA", never "buy candidates".

### 1.3 Watchlists on the database — DONE

Built as a full workspace at `/watchlists`, not just CRUD: multiple lists with a
single enforced default, search-and-add, a configurable column set over nine
groups, multi-column sort, range and flag filters, quick views, user-saved views,
and a performance summary.

- Schema: `is_default` on `watchlists`, plus `watchlist_layouts` (the working
  table state per list) and `watchlist_views` (named, reusable configurations).
  Migration `0009_simple_fat_cobra.sql`.
- The model — column registry, filters, sorting, summary — is pure and lives in
  `apps/web/src/lib/watchlist-*.ts`, tested in `watchlist-model.test.ts`.
- `packages/db/src/__tests__/watchlists-schema.test.ts` asserts the three
  database-enforced invariants against a throwaway Neon branch.
- `apps/web/src/lib/watchlist.ts` now reads and writes the default watchlist
  through the API, migrating any `localStorage` key on first load. The star
  toggles on the dashboard and in the stock drawer went with it.

**Still open from this area:** members cannot be dragged into a custom order from
the table itself (the API and repository support it; only the UI affordance is
missing), and `watchlist_items.note` is stored and displayed but has no editor.

### 1.4 Alerts

**What exists.** `alerts` and `alert_events` tables, fully designed —
typed `condition` JSON, denormalised `threshold` for cheap proximity queries,
`oneShot` to stop a crossed threshold re-firing every tick, `lastEvaluatedAt`,
and an audit trail carrying the observed value that fired it.

**What is missing.** Everything above the schema: the Zod predicate schema the
comment promises, the evaluator, the worker job, and the UI.

**Done when.** A pure evaluator in `packages/core` (rule 1 — it takes an
indicator snapshot plus the condition and returns a verdict), a worker job that
runs it on the intraday cycle, and an `/alerts` page. Note the vocabulary
constraint: an alert says a condition was met, never that anything should be done
about it.

### 1.5 Ingestion run tracking

**What exists.** The `ingestion_runs` table, whose comment states the reason
plainly: without it "a worker outage leaves a hole that indicators compute
straight across, producing a plausible and wrong number rather than an error."

**What is missing.** Zero writers, zero readers. The failure mode the table was
designed to prevent is currently live.

**Done when.** `ingest-daily`, `ingest-intraday` and `compute-indicators` open
and close a run row; `compute-indicators` refuses to compute across a session
with no `ok` run; `pnpm data:coverage` reports gaps from it.

---

## Tier 2 — integrity gaps

Not features so much as promises the code makes and does not yet keep.

### 2.1 Corporate action ingestion

The read path is complete and correct: `applyAdjustments`
(`packages/db/src/repositories/candles.ts:159`) multiplies pre-ex-date prices by
the stored ratio, exactly as hard rule 5 requires, and `getDailyBars` applies it
on every read.

**Nothing ever writes a `corporate_actions` row.** The adjustment pipeline is
therefore inert: any split or bonus in the stored history produces a phantom gap
that the daily engine reads as a real move. `pnpm verify:adjustment` exists to
determine whether the provider back-adjusts history, which is the prerequisite
question — but its answer has not been turned into an ingestion job either way.

**Done when.** Either a job populates the table from a source, or — if
`verify:adjustment` shows the provider already back-adjusts — that finding is
recorded in this repo and the table is documented as reserved for the intraday
series, which is not back-adjusted.

### 2.2 Instrument metadata is placeholder data

`ensureInstruments` (`packages/db/src/repositories/instruments.ts:115`) inserts
every instrument with `lotSize: 1`, `tickSize: 5`, `isin: null` and
`providerRef: null`, with the comment "a placeholder until the universe sync
supplies the real increment." The real sync, `syncInstruments`
(`:43`), has **no caller**.

Tick size matters here specifically because break buffers and proximity checks in
the intraday engine are computed in paise; a wrong increment quietly rounds
levels onto prices that cannot trade.

**Done when.** A worker job calls `syncInstruments` from the provider's
instrument master, and `ensureInstruments` stops inventing values.

### 2.3 Trading calendar

`packages/shared/src/time.ts` is explicit that its session helpers are
"holiday-unaware, so this is the earliest instant trading *could* start, not a
guarantee," and points at a trading calendar that does not exist. Live status is
fine — `getMarketStatus` asks the provider — but everything offline is not:
backtests, `replay:session`, `backfill:minutes` and coverage reporting all treat
an exchange holiday as a session with missing data.

**Done when.** A holiday list in `config/` (versioned YAML, per convention) and
an `isTradingDay()` in `packages/shared` that every offline path consults.

---

## Tier 3 — declared in the UI, not built

These already appear in the sidebar as `status: 'planned'`
(`apps/web/src/lib/navigation.ts`), which is deliberate: "the shape of the product
should be visible, and a dead link is worse than a disabled one."

| Nav entry | Status | Note |
| --- | --- | --- |
| **Screener** | Backend done | See [1.2](#12-screener) — the cheapest remaining page |
| **Watchlists** | **Built** | See [1.3](#13-watchlists-on-the-database-done) |
| **Alerts** | Schema done | See [1.4](#14-alerts) |
| **NIFTY 50** | Nothing built | Constituent-level index view. Largely a re-slice of data `/stocks` already loads |
| **IPOs** | Nothing built | No schema, no provider surface, no engine. The only genuinely greenfield item on this list, and the least connected to the product's three questions |

The IPO section deserves a deliberate decision rather than default inclusion:
nothing else in the product is about primary issues, and it would need its own
ingestion source. Consider dropping it from the nav instead of building it.

---

## Tier 3B — data gaps

### 3B.1 No fundamentals data source

Surfaced by the watchlist build rather than discovered in review: **market cap,
P/E, P/B, EPS and dividend yield have no source anywhere in this system.** The
provider serves quotes and OHLCV history; nothing serves fundamentals.

They are declared in `apps/web/src/lib/watchlist-columns.ts` with `source: null`,
which makes them visible-but-disabled in the column picker with the reason
attached, and automatically disables the two quick views that need them
("High dividend", "Valuation"). Their accessors return `null` and a test asserts
they never return anything else — an invented P/E is worse than a visible gap.

**Done when.** A fundamentals source exists and each accessor is filled in. The
column definitions, the filter ranges, the quick views and the UI states are all
already in place and will light up on their own.

---

## Tier 4 — documentation

### 4.1 The authoritative design docs do not exist

[CLAUDE.md](../CLAUDE.md) opens by naming two documents as authoritative:

- `docs/nse-signals-technical-plan.md` — "§1, §3, §5–§8 authoritative"
- `docs/nse-signals-prompt-pack-v2.md` — "§2–§3 authoritative for stack and schema"

Neither is in the repository, and `docs/` did not exist before this file. Nothing
is gitignored that would hide them — they were never committed.

This is the highest-leverage documentation gap, because CLAUDE.md defers to them
on exactly the questions this backlog keeps running into: what the daily signal
product is meant to be, and which schema decisions are settled. `apps/web/src/lib/watchlist.ts`
cites their absence directly as the reason it chose `localStorage`.

**Done when.** The documents are either restored from wherever they were drafted,
or CLAUDE.md's reference to them is replaced with the parts that are actually
load-bearing. Leaving a dangling reference to an authoritative document is worse
than having no reference.

### 4.2 Smaller corrections found in this review

- `apps/web/src/lib/watchlist.ts` — the comment "there is no schema yet" was
  false; the schema landed in `9044988`. *(Corrected, then superseded when the
  module moved onto the database in 1.3.)*
- The README documents deployment thoroughly but has no statement of what is
  built versus planned. *(A pointer to this file was added.)*

---

## Suggested order

1. **1.1 daily signals from the database** — removes the largest provider cost,
   settles the rule 8 tension, and makes the daily path match the intraday one.
2. **1.5 ingestion run tracking** — small, and it stops silent wrong numbers.
3. **1.2 screener** — the backend is finished; this is a route and a page.
4. **2.2 instrument sync** — quiet correctness, cheap.
5. ~~1.3 watchlists~~ done. **1.4 alerts** next — it wanted database-backed
   watchlists to scope to, and now has them.
6. **2.1 corporate actions** and **2.3 trading calendar** — both should land
   before any backtest result is trusted over a long window.
7. **4.1 design docs** — do this whenever the answer is known; everything above
   is guesswork without it.

NIFTY 50 and IPOs sit below the line until the items above are done.
