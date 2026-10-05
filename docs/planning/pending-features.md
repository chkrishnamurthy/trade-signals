---
name: Pending features backlog
status: reference
horizon: none
created: 2026-08-24
updated: 2026-10-05
area: [docs]
summary: The backlog as of 2026-08-24, with a code-verified status ledger added 2026-10-05. Sections below the ledger are the original text; where they disagree with the ledger, the ledger wins.
owner: krishna
---

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

## Status ledger — audited against the code, 2026-10-05

Every row was checked in the repository, not taken from the older text below. **Done** =
present in the code. **Open** = confirmed absent. **Other tab** = assigned to a separate
session on 2026-10-05 and in progress. Nothing here is committed yet.

### Done since this backlog was written

| Item | Evidence |
| --- | --- |
| 1.1 Serve daily signals from the database | `apps/web/src/server/signals.ts` is gone; no `evaluateSignals`/`scanSwing` in `apps/web`; watchlists use `latestSignalsForInstruments`, the stock page `getSignalsForDate` |
| 1.2 Screener | `/screener`, nightly `screener_snapshots`, presets, saved screens |
| 1.3 Watchlists | Complete, plus member reorder and notes (built; browser polish in another tab) |
| 1.4 Alerts v1 | Closing-price and RSI crossings on closed sessions: evaluator, tables, worker job, API, `/alerts`. **Unverified against Postgres** (migration check in another tab) |
| 2.1 Corporate action ingestion | Worker job `corporate-actions-sync` (08:40 weekdays) + `dividends` table |
| 2.3 Trading calendar | `config/nse-calendar.yaml` + `calendar-refresh` + `market-calendar-sync`; /calendar page; `isTradingDay()` and friends in `packages/core/src/paper/calendar.ts` |
| Breadth page, stock page, watchlist-scoped filings, IPO section, Google sign-in, indices strip (phases 0–3), market calendar, profile page, paper-trading phases 1–7 (admin-only) | Present in the tree |
| Run tracking, event log, metadata sync, trading-day helper, indices drawer, lint in CI (2026-10-05) | Built and committed; verified on a fresh Postgres 17 + TimescaleDB (all 39 migrations, 1,717 tests) and in the running app where there is a page: `ingestion_runs` writers + indicator gate (EW-105); `event_log` migration 0038 with `job_failed`, credential events and `/admin/logs` (EW-071); `sync-instrument-metadata` (EW-107); `isTradingDay` and friends (EW-108); strip drawer (EW-133 phase 4); `pnpm lint:app` in CI. Regime line (EW-129) already existed as "Today's technical read". `CLAUDE.md`/`AGENTS.md` now point at the real docs (EW-110) |
| Security hardening (2026-10-05) | Route guards + audit test, admin-only Fyers connect, CSRF layer, search/sign-up/2FA-confirm limits, worker credential-mint switch |
| My portfolio, phase 1 (2026-10-05) | `/portfolio`: typed entries, CSV import (holdings snapshot or trade list) with a row-by-row check, valued from `latest_quotes`, splits/bonuses applied on read, entries list, delete-all, CSV export. Migration `0040`. Verified against Postgres and in the running app. Edit entry, single-holding page, loading/error states and a daily-close fallback price are done. Excel (.xlsx) upload and usage counts (migration `0041`) done; Phase 1 complete. Open: a real tradebook file to test against, demerger notices (no data source). Phase 2 (analysis page: allocation treemap, sector and size split, concentration, contributors, coming up) done. Phase 3 (returns: FIFO lots, realised by year, dividends, XIRR, value over time, CSV export) done. Phase 4 (Nifty 50/500 comparison, tax view with the 2018 rule, losses carried forward, accountant CSV) done and reviewed. Phase 5 (risk: volatility, deepest fall, beta, correlation) done. Phase 6.1 (tax-lot reports: shares still held, unrealised by term, open-lots CSV, purchase history) done; 6.2 alerts and 6.3 CAS/contract-note import open; Phase 3 review fixes deferred by the owner — see `holdings-plan.md` |

### Open — confirmed absent in the code

| Item | Issue | What is missing |
| --- | --- | --- |
| Past Signals page | EW-128 | No page; and signals are admin-only, see the decision list in the product review |
| Horizon-segmented navigation | EW-131 | Not started |
| Indices strip phase 5 | EW-133 | No per-user selection (the strip's cache is process-wide). The phase 4 drawer exists |
| Fundamentals data source | EW-109 | No source; needs a decision (XBRL vs vendor) |
| NIFTY 50 constituent view | — | Not built |
| Options chain (flow phase 4) | EW-082 | No `option_chain_daily`; optional by its own plan |
| Intraday ORB-VC phases 4–6 / paper beta | EW-088 | Pages, paper controls and `MARKET_DATA_ROUTE_STREAM=dhan` exist in code; plan still lists them open. Re-verify against the plan's acceptance list, then close or split |
| Design-system governance | EW-058 | Storybook and 49 stories exist; plan still says 0/8. Lint enforcement not done |
| Mobile responsiveness phase 4 | EW-066 | CI builds Storybook, but there are no viewport/visual tests and no Playwright in the repo |
| Telegram archive backtests | EW-060 | Blocked on the channel and a sample file |
| Dhan production cut-over | EW-075 | Cannot be verified from the repo (it is a VPS `.env` setting). `.env.example` still shows `fyers`. Confirm on the server |
| IPO plan phases 11–12 | — | VPS-IP curl check of the NSE endpoints, `--once backfill-ipos`, a week of feed-health watching, BSE source still `enabled: false` |
| Company-research plan | — | Status "ready-for-decisions": waiting on the owner |

### In another tab (2026-10-05)

Upgrade Next.js to 15.5.24+ and the lockfile; verify migrations 0035 + 0036 on a scratch DB;
data-freshness / unavailable banner; centralise admin gating; watchlist reorder/notes browser
polish and a hint when reorder is disabled. Market-data scaling Phase 2 (EW-033) is also
there.

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

**Update 2026-10-05:** member reorder (drag grip, arrow keys, row-menu moves) and a
note editor are built, uncommitted and not yet checked in a browser. Notes had no
write path before; `PATCH /api/watchlists/:id/items` adds it. Reorder is available
only with no sort or filter active.

### 1.4 Alerts

**Status 2026-10-05: v1 built, uncommitted** (see `issues/alerts.md`). The original tables
were dropped in migration 0011; v1 uses new per-user `alerts` / `alert_events` (migration
0036), a pure evaluator in `packages/core/src/alerts`, the worker job `evaluate-alerts`
and an `/alerts` page. It evaluates closed daily data only. Still to do: verify against
Postgres and in a browser; intraday alerts once the worker quote cache lands.

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
| **Screener** | **Built** | `/screener` — see the status ledger |
| **Watchlists** | **Built** | See [1.3](#13-watchlists-on-the-database-done) |
| **Alerts** | **Built (v1, unverified against Postgres)** | `/alerts` — see [1.4](#14-alerts) |
| **NIFTY 50** | Nothing built | Constituent-level index view. Largely a re-slice of data `/stocks` already loads |
| **IPOs** | **Built and merged to `main`** (2026-10-04); VPS check and backfill still open | `/ipos` and `/ipos/[slug]` for every signed-in user — NSE official data + bhavcopy listing prices, RHP extracts quoted with their pages, SEBI DRHP filings, and an unofficial, labelled GMP from InvestorGain. The BSE source is built but off until the owner approves its browser User-Agent. Pre-merge: DB tests on Docker, real-app QA, VPS check. See [ipos-plan.md](ipos-plan.md) |

The owner decided on 2026-10-02 to build the IPO section in full (decisions D1–D5 in
[ipos-plan.md](ipos-plan.md)), with its own ingestion pipeline in the worker.

---

## Tier 3B — data gaps

### 3B.1 No fundamentals data source

Surfaced by the watchlist build rather than discovered in review: **market cap,
P/E, P/B, EPS and dividend yield have no source anywhere in this system.** The
provider serves quotes and OHLCV history; nothing serves fundamentals.

*Updated 2026-09-14:* the `source: null` placeholder columns (fundamentals,
circuit limits, delivery %, the uncomputed indicators and the removed intraday
setup levels — 34 in all) are no longer declared. Nearly half the column picker
was greyed out, which reads as unfinished rather than honest. Migration `0019`
stripped the dead ids from stored layouts and saved views and dropped the last
intraday table. See `issues/no-fundamentals-data-source.md`.

**Done when.** A fundamentals source exists; re-add the columns and the two quick
views against it at that point.

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

> **Superseded 2026-10-05.** The ordering below predates the work in the status ledger. The
> current ranked list is in the product review tracker
> ([product-review-2026-10.md](product-review-2026-10.md)).

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
