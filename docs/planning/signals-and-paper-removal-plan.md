---
name: Remove signals and paper trading
status: proposed
horizon: next
created: 2026-10-17
updated: 2026-10-17
phases_total: 5
phases_done: 0
phase_names: [Lab pages + APIs, Worker jobs, Core + shared, Daily signals, DB + docs]
area: [web, worker, core, db, docs]
summary: "Remove the intraday ORB-VC strategy, paper trading and the daily signal engine completely. Plan only — no code removed yet."
owner: krishna
---

# Remove signals and paper trading

**Status:** plan only. Nothing is removed until this is approved.

**Why:** the product stays a charting, screening and tracking tool. Buy/sell signals and
"setups" chosen by the app read as investment research under SEBI's Research Analyst
rules, and paper trading only exists to grade those signals. Removing both also drops
the main reason for the paid Dhan Data API.

## 1. What exists today

There are two separate signal systems, plus paper trading on top of the first one.

### A. Intraday strategy (ORB-VC) and paper trading — admin-only "Lab"

| Layer | Files |
|---|---|
| Pages | `apps/web/src/app/intraday/`, `apps/web/src/app/paper-trading/`, `apps/web/src/app/signals/` (redirects to `/intraday`), `apps/web/src/app/admin/paper/` |
| APIs | `apps/web/src/app/api/intraday/` (today, day/[date], rules), `apps/web/src/app/api/paper/` (9 routes), `apps/web/src/app/api/admin/paper/health/` |
| Web server | `apps/web/src/server/intraday.ts`, `apps/web/src/server/paper.ts` |
| Components | `apps/web/src/components/intraday/` (10 files), `apps/web/src/components/paper/` (16 files) |
| Navigation / links | `lib/navigation.ts` (the "Lab" menu: `intraday`, `paper`), `lib/api-routes.ts` (intraday + paper entries), `app/admin/page.tsx` (3 links), route-auth and navigation tests |
| Worker jobs | `jobs/intraday-orb.ts`, `jobs/paper.ts` (+ tests); in `index.ts`: `intraday-reconcile`, `intraday-quotes`, `intraday-scan`, `intraday-warmup`, `paper-entries`, `paper-monitor`, `paper-squareoff`, `paper-snapshot`, `paper-reconcile`, and the startup recovery block |
| Live feed | `jobs/feed.ts` (+ test). It exists only to feed intraday observations (`observeIntradayPrice`) and uses `ORB_CONFIG` / `loadIntradaySettings` |
| Core (pure) | `packages/core/src/intraday/` (16 files), `packages/core/src/paper/` (22 files), `packages/core/src/paper-journal.ts` |
| Shared | `packages/shared/src/intraday.ts`, `packages/shared/src/paper.ts` |
| DB repositories | `repositories/intraday.ts`, `repositories/paper.ts`, `repositories/paper-ops.ts`, `repositories/minute-bars.ts`, db tests `__tests__/intraday.test.ts`, `__tests__/paper.test.ts` |
| DB tables | `strategy_signals`, `strategy_signal_events`, `strategy_session_exclusions`, `strategy_scan_runs`, `signal_quotes`, `signal_observations`, 11 `paper_*` tables, and `instrument_provider_refs` (written only by the feed) |
| Config / scripts | `config/intraday-orb.yaml`, `scripts/replay-intraday.ts` |
| Skills / docs | `.claude/skills/paper-trading/`, `docs/planning/intraday-strategy-dhan-plan.md`, `paper-trading-plan.md`, `signals-page-plan.md`, `signals-implementation.md`, journal entries |

About **12,000 lines** of code and tests.

### B. Daily (end-of-day) signal engine — admin-only columns across the app

| Layer | Files |
|---|---|
| Engine | `packages/core/src/signals/` (`evaluateSignals`, `scanSwing`, `DEFAULT_STRATEGY`) |
| Writer | `apps/worker/src/jobs/compute-indicators.ts` writes a `signals` row + `signal_factors` per stock after the indicators |
| Tables | `strategy_versions`, `signals`, `signal_factors` (`repositories/signals.ts`) |
| Readers | Watchlists: Signal / Signal Strength / Setups columns and the "Daily signals" view (`server/watchlists.ts`, `lib/watchlist-columns.ts`, `lib/watchlist-views.ts`, `components/watchlists/*`) |
| | Stock page: signal + "Why this signal?" factors (`server/stock-research.ts`, `components/stocks/stock-view.tsx`) |
| | Screener: `signalDirection`, `signalStrength` metrics and the `signals` category (`core/screener/catalogue.ts`, `worker/jobs/stock-analysis.ts`, `repositories/screener.ts`) |
| | Market brief: setup counts, setup lists, factor breakdown (`server/market-brief.ts`, `lib/market-brief/*`, `components/market-brief/*`, `repositories/brief.ts`) |
| UI pieces | `components/market/signal.tsx` (the BUY/SELL direction badge) + story |

## 2. Things that look related but must STAY

These are woven into the paper/intraday files but are used by the rest of the app.

| Keep | Why | What to do |
|---|---|---|
| **Exchange calendar** — `exchange_sessions` table, `sessionFor` / `calendarExpiresSoon` (in `core/paper/calendar.ts`), `upsertExchangeSession` / `getExchangeSession` (in `repositories/paper.ts`), `jobs/calendar-refresh.ts` | The worker's `gated()` wrapper uses it to skip holidays for `refresh-latest-quotes` (watchlist prices) | **Move** out of the paper files into `core/calendar/` and `repositories/calendar.ts`. No table change |
| `worker_checkpoints` table + `get/setWorkerCheckpoint` (in `repositories/paper.ts`) | Stock-analysis and dividend backfills use it | **Move** to `repositories/checkpoints.ts` |
| `calendar-check` job | Detects unscheduled closures using `latestSignalQuoteAt` (from `signal_quotes`) | **Rewrite** to use `latest_quotes` instead, or drop it |
| `minute_candles` table | Price history (hard rules 4 and 5) | **Keep the table and its data.** Only stop writing to it. Drop `repositories/minute-bars.ts` if nothing else reads it |
| `daily_indicators` + `compute-indicators` job | Feeds watchlist indicator columns, screener and alerts | **Keep.** Only remove the `evaluateSignals` / `saveSignal` part |
| `refresh-latest-quotes` job, web `live-quotes.ts` | Watchlist live prices | Keep (unrelated to the worker feed) |
| Portfolio "intraday" | Tax classification of same-day trades | Unrelated; keep |
| `paiseSchema` / `barSchema` in `shared/intraday.ts` | Used by `minute-bars.ts` and the feed only | Move to `shared` money/bar helpers if anything still needs them |

## 3. Order of removal (one PR per phase, each green on its own)

### Phase 1 — Lab pages, APIs and navigation
- Delete the pages, API routes, web server files and components listed in §1A.
- Remove the "Lab" menu from `lib/navigation.ts`, the intraday/paper entries from
  `lib/api-routes.ts`, the three links from `app/admin/page.tsx`.
- Update `route-auth.test.ts`, `navigation.test.ts`, `redirects.test.ts`.
- `/signals`, `/intraday`, `/paper-trading` then return 404 (fine, admin-only today).

### Phase 2 — Worker jobs
- Remove the intraday and paper jobs, the feed job, and the startup recovery's paper calls
  from `apps/worker/src/index.ts` (schedule list and the `--once` job-name list).
- Move the calendar and checkpoint helpers (§2) first, so `calendar-refresh` and the
  backfills keep working.
- Rewrite or drop `calendar-check`.

### Phase 3 — Core and shared
- Delete `core/intraday/`, `core/paper/` (after moving `calendar.ts`), `core/paper-journal.ts`,
  `shared/intraday.ts`, `shared/paper.ts`; remove their exports from the `index.ts` files.
- Delete `config/intraday-orb.yaml`, `scripts/replay-intraday.ts`.

### Phase 4 — Daily signal engine (§1B)
- `compute-indicators.ts`: stop calling `evaluateSignals` / `saveSignal` (indicators stay).
- Remove signal columns, the "Daily signals" view, the stock-page signal section, the
  screener `signals` category, and the market-brief setup sections.
- Delete `core/signals/`, `components/market/signal.tsx`, `repositories/signals.ts` and the
  signal readers in `brief.ts` / `screener.ts`.
- **Check** saved screener presets (`config/screener-presets.yaml`) and users' saved
  watchlist column layouts for signal columns, and drop them safely on read.

### Phase 5 — Database and docs
- **Migration:** drop the intraday tables, `signal_quotes`, `signal_observations`, all `paper_*`
  tables, `instrument_provider_refs`, and `signals` / `signal_factors` / `strategy_versions`. Drop their triggers and
  trigger functions first. **Keep** `minute_candles`, `exchange_sessions`, `worker_checkpoints`.
  Take a `pg_dump` of these tables on the VPS before the deploy (one-way change).
- Remove hard rules 2, 7, 8 and the BUY/SELL wording from `CLAUDE.md` (or reword them for
  indicators), and the 2026-09-18 / 2026-10-07 update notes.
- Delete `.claude/skills/paper-trading/`; update `signal-invariants`, `closed-candles`,
  `worker` skills; mark the plans in §1A as `status: removed`; update
  `docs/operations/deployment.md` and `pending-features.md`.

## 4. Decisions needed before starting

1. **Daily signals (§1B): remove completely, or only the intraday + paper part?**
   Recommended: remove both. They are admin-only today, and the BUY/SELL badge and
   "setups" are exactly what makes the app look like research.
2. **Old data:** drop the tables (recommended, after a backup), or keep them unused?
3. **Dhan:** after this, only `ingest-futures-oi` and the `routed` daily bars use Dhan.
   Switch to Fyers-only in the same series, or as a separate change?

## 5. Risk check

| Risk | Guard |
|---|---|
| Holiday gating breaks for watchlist quotes | Move the calendar code first (Phase 2) and keep `calendar-refresh.test.ts` |
| Backfills lose their checkpoints | Move `worker_checkpoints` helpers before deleting `repositories/paper.ts` |
| Saved watchlist layouts reference removed columns | Unknown column ids are ignored on read (verify in Phase 4) |
| Dropped tables can't be restored | `pg_dump` before Phase 5 deploy |
| Hidden importer missed | `pnpm typecheck` and the full test suite after every phase |
