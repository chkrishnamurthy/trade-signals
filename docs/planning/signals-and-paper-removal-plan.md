---
name: Remove signals and paper trading
status: proposed
horizon: next
created: 2026-10-17
updated: 2026-10-17
phases_total: 6
phases_done: 3
phase_names: [Move shared pieces, Lab pages + APIs, Worker jobs, Daily signals, Core + shared cleanup, DB + docs]
area: [web, worker, core, db, docs]
summary: "Remove the intraday ORB-VC strategy, paper trading and the daily signal engine completely, without changing anything a non-admin user sees today."
owner: krishna
---

# Remove signals and paper trading

**Status:** plan only. Nothing is removed until this is approved.

**Decision (owner, 2026-10-17):** remove **all** signals and paper trading. That covers the
intraday ORB-VC strategy, paper trading, and the daily signal engine with every place
it shows up (watchlists, stock page, screener, market brief).

**Why:** the product stays a charting, screening and tracking tool. Buy/sell signals and
app-picked "setups" read as investment research under SEBI's Research Analyst rules,
and paper trading only exists to grade those signals.

## 0. Why this can be done without breaking anything

Every feature being removed is **already admin-only**:

- The Lab pages redirect a non-admin and their APIs answer 403.
- Every daily-signal read is behind `isAdmin`. A regular user's watchlists, stock page,
  screener and market brief already run on a path with **no signals at all**: empty
  maps, hidden columns, `HIDDEN_FROM_USERS`, and `catalogueFor(false)`.

So the safe rule for every change below is: **make the admin path behave like today's
user path, then delete the unused branch.** A regular user sees no difference. An admin
sees what a regular user sees today.

The only real risks are pieces that **sit inside** the paper or intraday files but are
used by other features. §3 lists each one with what to do. They are moved first, in
Phase 0, before anything is deleted.

## 1. What gets removed

### A. Intraday strategy (ORB-VC) and paper trading (admin-only "Lab")

| Layer | Files |
|---|---|
| Pages | `apps/web/src/app/intraday/`, `apps/web/src/app/paper-trading/`, `apps/web/src/app/signals/` (redirects to `/intraday`), `apps/web/src/app/admin/paper/` |
| APIs | `apps/web/src/app/api/intraday/` (today, day/[date], rules), `apps/web/src/app/api/paper/` (9 routes), `apps/web/src/app/api/admin/paper/health/` |
| Web server | `apps/web/src/server/intraday.ts`, `apps/web/src/server/paper.ts` |
| Components | `apps/web/src/components/intraday/` (10 files), `apps/web/src/components/paper/` (16 files) |
| Navigation / links | `lib/navigation.ts` (the "Lab" menu: `intraday`, `paper`), `lib/api-routes.ts` (intraday + paper entries), `app/admin/page.tsx` (3 links) |
| Worker jobs | `jobs/intraday-orb.ts`, `jobs/paper.ts`, `jobs/feed.ts` (+ tests). In `index.ts`: `intraday-reconcile`, `intraday-quotes`, `intraday-scan`, `intraday-warmup`, `paper-entries`, `paper-monitor`, `paper-squareoff`, `paper-snapshot`, `paper-reconcile`, `feed-start`, `feed-stop`, the `--once` names, and the paper calls in startup recovery |
| Core (pure) | `packages/core/src/intraday/` (16 files), `packages/core/src/paper/` (22 files, **except** `calendar.ts`, see §3), `packages/core/src/paper-journal.ts` |
| Shared | `packages/shared/src/intraday.ts`, `packages/shared/src/paper.ts` (except the `ExchangeSession` / calendar types, see §3) |
| DB repositories | `repositories/intraday.ts`, `repositories/paper-ops.ts`, `repositories/minute-bars.ts`, most of `repositories/paper.ts` (see §3); tests `__tests__/intraday.test.ts`, `__tests__/paper.test.ts` |
| DB tables | `strategy_signals`, `strategy_signal_events`, `strategy_session_exclusions`, `strategy_scan_runs`, `signal_quotes`, `signal_observations`, 11 `paper_*` tables, `instrument_provider_refs` (written only by the feed) |
| Config / scripts | `config/intraday-orb.yaml`, `scripts/replay-intraday.ts` |

About **12,000 lines** of code and tests.

### B. Daily (end-of-day) signal engine

| Where | What is removed | What stays |
|---|---|---|
| Engine | `packages/core/src/signals/` (`evaluateSignals`, `scanSwing`, `DEFAULT_STRATEGY`) | All indicators in `core/indicators` |
| Worker `compute-indicators.ts` | `registerStrategy`, the `evaluateSignals` / `saveSignal` block, `signalsWritten` in the result | Indicator computation and `upsertDailyIndicators` (feeds watchlists, screener, alerts) |
| Watchlists | Columns `signal`, `signalStrength`, `signalSetups`; the `signals` column group; the "Daily signals" quick view; `showSignals` plumbing; signal reads in `server/watchlists.ts`; signal cells in `watchlist-cells.tsx` | Every other column and view (`trend` is EMA-derived, not a signal) |
| Stock page | Signal badge and "Why this signal?" factor section (`server/stock-research.ts`: `latestSignalRow`, `getSignalFactors`; `components/stocks/stock-view.tsx`) | Header, ratio board, charts, "What stands out" |
| Screener | `signalDirection`, `signalStrength` metrics and the `signals` category (`core/screener/catalogue.ts`), `HIDDEN_FROM_USERS`, signal fill in `worker/jobs/stock-analysis.ts` (`latestSignalsOnOrBefore`) | All ~93 other metrics and presets. The preset mentioning "MACD signal" is the MACD signal **line** and stays |
| Market brief | Setup counts, setup lists, factor breakdown (`server/market-brief.ts` signal reads, `lib/market-brief/*` signal facts and sentences, `components/market-brief/factor-breakdown.tsx`); `repositories/brief.ts` signal readers | Breadth, movers, indicator-based facts |
| UI pieces | `components/market/signal.tsx` (BUY/SELL direction badge) and its story | — |
| Tables | `signals`, `signal_factors`, `strategy_versions`; columns `screener_snapshots.signal_direction` / `signal_strength` | `daily_indicators`, `screener_snapshots` |
| Repositories | `repositories/signals.ts` | — |

## 2. Not affected (checked)

- **Alerts** (`core/alerts`, `evaluate-alerts`): no signal dependency. They read `daily_indicators`.
- **Portfolio "intraday"**: tax classification of same-day trades. Unrelated, stays.
- **Watchlist live prices**: web `live-quotes.ts` and the worker `refresh-latest-quotes` job do not use the worker feed. They stay.
- **IPOs, calendar page, flows, announcements, portfolio**: no imports from the removed code.
- **MACD "signal line"** wording in indicators, screener and presets: an indicator term. It stays.

## 3. Shared pieces that must be MOVED, not deleted

| Piece | Lives in today | Used by | Action |
|---|---|---|---|
| Exchange calendar: `sessionFor`, `calendarExpiresSoon`, `isTradingDay`, … | `core/paper/calendar.ts` | `jobs/calendar-refresh.ts`, the worker's `gated()` holiday check for `refresh-latest-quotes`, **the IPO timeline** (`core/ipos/timeline.ts`) | Move to `core/exchange-calendar.ts` |
| `ExchangeSession`, `CalendarConfig` types | `shared/paper.ts` | Calendar code | Move to `shared/exchange-calendar.ts` (`shared/market-calendar.ts` is the separate events calendar) |
| `exchange_sessions` table + `upsertExchangeSession` / `getExchangeSession` | `schema/paper.ts`, `repositories/paper.ts` | Calendar refresh, `gated()` | Move to `schema/exchange-calendar.ts`, `repositories/exchange-calendar.ts`. **No table change** |
| `worker_checkpoints` table + `get/setWorkerCheckpoint(Row)` | `schema/paper.ts`, `repositories/paper.ts` | Stock-analysis and dividend backfills (`stock-analysis.ts`), portfolio reference data (`portfolio-reference.ts`) | Move to `schema/checkpoints.ts`, `repositories/checkpoints.ts`. **No table change** |
| `recordPaperRiskEvent` call in `calendar-refresh.ts` | `repositories/paper.ts` | Calendar alerts written to the paper risk log | Replace with the worker's normal logger / event log |
| `calendar-check` job (`latestSignalQuoteAt`) | `signal_quotes` table | Detects unscheduled closures from intraday quotes | Rewrite to read `latest_quotes` (written by `refresh-latest-quotes`), or drop the job |
| `minute_candles` table | `schema/vwap-signals.ts` | Price history (hard rules 4 and 5) | Move the table definition to `schema/candles.ts`. **Keep the table and its data.** Nothing writes to it after removal |
| `gated()` helper in `worker/index.ts` | — | `refresh-latest-quotes` | Keep |

## 4. Phases (one PR each; every PR passes lint, typecheck and all tests on its own)

### Phase 0: move the shared pieces (no behaviour change) ✅ done
- Moved: the exchange calendar (core + shared types), `exchange_sessions` and
  `worker_checkpoints` (schema + repository functions), `minute_candles` (schema, to `candles.ts`).
  Every package re-exports through its `index.ts`, so the public names are unchanged and no
  caller had to change.
- The two §3 rows that change behaviour (`recordPaperRiskEvent` in `calendar-refresh.ts`, and
  `calendar-check`'s use of `signal_quotes`) move to **Phase 2**, where the paper tables they
  touch are retired.
- Verified: lint, typecheck and 1,947 unit tests unchanged; `drizzle-kit export` produces
  byte-identical schema SQL before and after (no migration).

### Phase 1: Lab pages, APIs and navigation ✅ done
- Done as below. The "Lab" menu also held the **Admin console** link, so it is kept as an
  **"Admin"** menu holding only that link (the planned "Backtests" entry went with the Lab).
- Verified: lint, workspace typecheck, 1,919 unit tests (the 28 fewer are the two deleted
  component test files), `next build` and `build-storybook` all pass.
- Delete the pages, APIs, web server files and components in §1A.
- Remove the "Lab" menu (`navigation.ts`), the intraday/paper entries (`api-routes.ts`) and
  the three links in `app/admin/page.tsx`.
- Update `route-auth.test.ts`, `navigation.test.ts`, `redirects.test.ts` and the loading-system story.
- **Proof:** `pnpm build` for web, and every remaining page still renders. `/intraday`,
  `/paper-trading` and `/signals` return 404.

### Phase 2: worker jobs ✅ done
- Removed 12 scheduled jobs (`feed-start/stop`, `intraday-reconcile/quotes/scan/warmup`,
  `paper-entries/monitor/squareoff/snapshot/reconcile`, `calendar-check`), their `--once` names,
  the feed, and the paper calls in startup recovery. Startup recovery keeps its quote-cache refresh.
- **`calendar-check` dropped, not rewritten:** it only decided whether paper entries could open.
  Without it, an unscheduled closure just means `refresh-latest-quotes` re-reads unchanged prices.
- `calendar-refresh` keeps the expiring-calendar warning as a log line (the paper risk-event
  write is gone). `scripts/replay-intraday.ts` and `pnpm replay:intraday` went too: they imported
  the deleted intraday job.
- Verified: lint, typecheck, 1,900 unit tests (the 19 fewer are the deleted job tests and the
  closure-check tests).
- `calendar-refresh.ts`: replace `recordPaperRiskEvent` with the worker logger / event log.
- Remove the intraday, paper and feed jobs and their schedule entries, `--once` names and
  startup-recovery calls. Keep `refresh-latest-quotes` with startup recovery.
- Rewrite or drop `calendar-check` (§3).
- **Proof:** worker tests pass, `--once refresh-latest-quotes` and `--once calendar-refresh`
  run, and the scheduler list contains no intraday/paper job.

### Phase 3: daily signals
- `compute-indicators.ts`: indicators only.
- `stock-analysis.ts`: stop filling the two signal columns.
- Watchlists, stock page, screener and market brief: delete the `isAdmin` signal branches so
  the admin path equals today's user path. Remove the signal columns, view, category,
  badge and factor components.
- Saved data, so old preferences don't break:
  - Saved watchlist column lists: unknown ids are already dropped by `visibleColumnIds`. Nothing to do.
  - Ratio board: `normaliseRatioKeys` already drops keys not in the catalogue. Nothing to do.
  - **Saved screens** (`saved_screens`): an admin's saved screen with a signal filter would
    stop validating. Clean these in the Phase 5 migration (remove those filter leaves), and
    make loading a saved screen ignore unknown metrics.
- **Proof:** watchlist, screener, stock-page and market-brief tests pass. Their admin snapshots
  now match the user snapshots.

### Phase 4: core and shared cleanup
- Delete `core/intraday/`, `core/paper/`, `core/paper-journal.ts`, `core/signals/`,
  `shared/intraday.ts`, `shared/paper.ts`, `config/intraday-orb.yaml`, `scripts/replay-intraday.ts`,
  `repositories/{intraday,paper-ops,minute-bars,signals}.ts`, and what is left of `repositories/paper.ts`.
- Remove their exports from the `index.ts` files and the temporary re-exports from Phase 0.
- **Proof:** `pnpm typecheck` across the workspace finds no dangling import.

### Phase 5: database and docs
- **Before deploy:** `pg_dump` the tables below on the VPS (a one-way change).
- **Migration:**
  1. Drop the triggers and trigger functions on these tables (e.g. `strategy_signals_freeze_evidence`,
     `paper_*_no_update`, the `signals` append-only guards).
  2. Drop the intraday tables, `signal_quotes`, `signal_observations`, all `paper_*` tables,
     `instrument_provider_refs`, `signals`, `signal_factors`, `strategy_versions`.
  3. Drop `screener_snapshots.signal_direction` and `signal_strength`.
  4. Strip signal-metric leaves from `saved_screens`.
  5. **Keep** `minute_candles`, `exchange_sessions`, `worker_checkpoints`, `daily_indicators`.
- **Docs:**
  - `CLAUDE.md`: remove hard rules 2 (closed candles for signals), 7 (strategy versions), 8
    (signal factors), the BUY/SELL rule, the 2026-09-18 Lab note and the "signals are
    admin-only" note. Replace with "no signals, no setups, no paper trading" in "Do not".
  - Skills: delete `.claude/skills/paper-trading/`; update `signal-invariants`, `closed-candles`, `worker`.
  - Plans: mark `intraday-strategy-dhan-plan.md`, `paper-trading-plan.md`, `signals-page-plan.md`,
    `signals-implementation.md` as `status: removed`; update `pending-features.md` and
    `docs/operations/deployment.md`.

## 5. Check after every phase

| Area | Check |
|---|---|
| Watchlists | Live prices, indicator columns, quick views, add/remove stocks |
| Screener | Run a preset, save/load a screen, CSV export |
| Stock page | Header, ratio board, chart, "What stands out" |
| Market brief and breadth | Page loads with breadth and movers |
| IPOs, portfolio, calendar, alerts | Unchanged |
| Worker | `ingest-daily` → `compute-indicators` → `stock-analysis` → `evaluate-alerts` chain completes; `refresh-latest-quotes` skips holidays |
| Automated | `pnpm lint`, `pnpm typecheck`, `pnpm test`, db-tests, web build |

## 6. Risks

| Risk | Guard |
|---|---|
| Holiday check breaks for watchlist quotes | Phase 0 moves the calendar before anything is deleted; `calendar-refresh.test.ts` stays |
| Backfills lose their checkpoints | Phase 0 moves `worker_checkpoints` |
| Old saved preferences mention removed columns or metrics | Already filtered on read (columns, ratios); saved screens cleaned in the migration |
| Dropped tables can't be restored | `pg_dump` before the Phase 5 deploy |
| A hidden importer is missed | Typecheck and full tests after every phase; Phase 4 deletes the last files only after Phases 1–3 |

## 7. Open item

**Dhan:** after this, Dhan is used only for `ingest-futures-oi` and the `routed` daily bars,
quotes and instruments. Moving to Fyers-only (and cancelling the ₹589/month Data API) is a
separate change after this plan.
