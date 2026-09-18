# Intraday paper trading — implementation plan

**Status:** Plan agreed 2026-09-17. **Phase 0 done** (§22, branch `feat/paper-trading-phase-0`). **Phases 1–6 implemented** (§23–§24, merged in PR #23).
**Access (2026-09-18): admin-only.** `/paper-trading`, `/intraday` and every `/api/paper/*` and `/api/intraday/*` endpoint answer only an `admin` session — a signed-in user is redirected to `/watchlists` (pages) or gets `403 FORBIDDEN` (APIs) — and neither page appears in the primary navigation or the footer; admins reach them from the user menu and `/admin`. The data model stays per-user (one portfolio per `user_id`), so opening the feature to users later is the one role check in `apps/web/src/server/paper.ts` / `intraday.ts` and the two page files, not a schema change.
**Date:** 2026-09-17
**Builds on:** [intraday-strategy-dhan-plan.md](intraday-strategy-dhan-plan.md) (the ORB-VC strategy and `/intraday` page, merged in PR #22) · [dhan-provider-plan.md](dhan-provider-plan.md) (Dhan adapter, router, socket — phases 0–7 complete) · [authentication-plan.md](authentication-plan.md) (per-user sessions).
**Fixed product decisions (from the brief):** Dhan for intraday data · one paper portfolio per user · ₹2,00,000 starting virtual capital · all enabled strategies share that capital · fully automatic entries/exits · no manual edits to paper trades · compulsory square-off before close · paper trading OFF by default · **no real orders, ever**.

> Plain-language summary first (§0), then the twenty sections the brief asks for
> (§1–§20), then the phased roadmap (§21). Numbers verified against official Dhan
> documentation on 2026-09-17 are marked **(verified)**; anything the NSE site would
> not serve to a non-browser client is marked **(operator-verified)** and is a
> mechanism in this plan, not a pasted date.

---

## 0. Summary in ten lines

1. **Most of the brief's "missing infrastructure" already exists on `main`.** The repository has a Dhan adapter with a live socket, a capability router, minute ingestion into TimescaleDB, session-aligned 5-minute bars, a pure ORB-VC strategy evaluator, a no-lookahead lifecycle with partial exits, per-instrument locks, and a `/intraday` page. The brief's premise that "the active system processes daily candles only" was true before PR #22; it is not true now.
2. **What is genuinely missing** is everything *per user*: a portfolio, a ledger, settings and the toggle, risk limits, per-user orders/fills/positions, performance attribution, the `/paper-trading` page, an exchange calendar, worker checkpoints, and an audit trail. Today's paper book is one shared, config-driven ₹5,00,000 book with no owner.
3. **The core change is a split:** strategies publish *trade intents* once, globally (the existing `strategy_signals` rows are 90 % of that); the paper engine then makes an *independent, deterministic risk decision per portfolio* and simulates the trade in that portfolio's ledger. Signals stay shared; money is private.
4. **Dhan stays behind the provider boundary.** No new package is needed: `packages/providers-dhan` exists. The work is flipping three routes (`INTRADAY_BARS`, `QUOTES`, later `STREAM`) and hardening the socket path. Market status stays on Fyers plus a new exchange calendar.
5. **Real orders are made impossible by construction, then by tests:** `packages/dhan` contains no order module; a boundary test fails the build if any file names an order endpoint, an order SDK method, or a trading PIN; the engine has no code path that can reach a provider at all (it is pure).
6. **Fill model is honest and documented:** live = sampled quotes every 5 s at the *next observed price* after the signal candle closes, with slippage, tick rounding, a gap guard and charges; replay = 1-minute bars in a pessimistic order (stop wins). Full-fill-or-none. Never "broker-grade".
7. **Capital allocation is a written, repeatable rule** (§10): priority by strategy rank, then signal strength, then symbol — never by database arrival order. Conflicts and duplicates are rejected with a stored reason code.
8. **Activation is "from the next signal after you switch on"** — never backfilled; turning OFF stops entries and lets open trades finish under the strategy version that opened them, with an audit row either way. A separate *emergency stop* freezes new entries for all strategies.
9. **Accounting is an append-only ledger** in integer paise, reconstructable from orders → fills → position events → ledger entries, with daily equity snapshots and a nightly reconciliation that must balance to the paise.
10. **Six phases, each shippable alone.** Phase 1 (portfolio + ledger + deterministic engine in pure core) is the one everything else hangs on and the one to review hardest.

**Standing disclaimer for every surface:** paper results are simulations under stated assumptions; they do not guarantee — and are not evidence of — future real-world results.

---

## 1. Current repository findings

Inspected on `main` at `6c84896` (2026-09-17). Corrections to the brief's premises are marked ✱.

| Area | Finding | Implication |
| --- | --- | --- |
| ✱ Intraday engine | **Exists.** `packages/core/src/intraday/{config,bars,orb,session,evaluate,lifecycle,book,replay}.ts` — pure ORB-VC evaluator, lifecycle with fill/T1 partial/breakeven/T2/stop/EOD, book allocation, day replay. 49 hand-fixture tests incl. a no-lookahead truncation test. | The paper engine consumes this; it does not replace it. |
| ✱ Minute pipeline | **Exists.** `minute_candles` hypertable (append-only trigger), `getSignalBars` derives 5-min bars with `time_bucket` anchored 09:15 IST and requires all five minutes (`packages/db/src/repositories/minute-bars.ts`). Worker ingests 1m incrementally per scan. | Closed-candle generation is done. |
| ✱ Dhan | **Exists.** `packages/dhan` (auth via documented TOTP endpoint, candles, quotes, instruments, **binary socket**), `packages/providers-dhan` (adapter, symbol→securityId index, resolution planning, circuit breaker). Router in `packages/market-data/src/routed.ts` with one env var per route; `.env.example` documents the routes. Worker mints the Dhan token nightly. | No new provider package. Phase 2 is configuration + hardening, not construction. |
| ✱ Paper book | **Exists but shared and ownerless.** `config/intraday-orb.yaml` `capitalPaise: 50000000`; `strategy_signals.projection` carries `taken`, `shares`, `fill`, `exits` for that one book; `intradayBookFromSignals()` derives counts. | Must become per-user. The signal row should stop carrying money. |
| ✱ Signals page | `/signals` redirects to `/intraday` (title "Intraday Strategies"). | The brief's "Signals page status card" lands on `/intraday`. |
| Strategy versioning | `strategy_versions` (append-only trigger, unique `config_hash`); `registerStrategy` hashes `{ORB_CONFIG, PAPER_COSTS, settings, universe}` each scan. | Reuse as-is. The paper engine stores `strategy_version_id` on every order/position. |
| Signal tables | `strategy_signals` (one per instrument per session, evidence JSON frozen by trigger, `strategy_signal_events` append-only, `strategy_session_exclusions`, `strategy_scan_runs`), migration `0020`. | Becomes the trade-intent store (§13). |
| Old `intraday_signals` | Created by 0003; `0019_drop_unsourced_columns.sql` drops it but is **not in `_journal.json`** and has never run. Table may still exist on the VPS. | Not reused (brief agrees). Journal or delete that file in Phase 0. |
| Auth | First-party sessions; `getSessionUser()` server-side; `auth_audit` insert-only trigger; `writeAudit()` helper; minimal user/admin role. | Paper tables key on `auth_users.id`; audit reuses the pattern (own table, see §7). |
| Quotes | Worker samples 51 symbols every 5 s (`intraday-quotes`), stores `signal_quotes` (latest) + `signal_observations` (append). Continuity flag: > 15 s gap ⇒ outcome *Unavailable*. | Quote-based simulation already exists; socket upgrade is Phase 2. |
| Market status | Fyers REST endpoint via router (`MARKET_DATA_ROUTE_STATUS=fyers`); Dhan has none. `packages/shared/src/time.ts` is explicitly holiday-unaware. | Exchange calendar is new (§9.4). |
| Charges | `packages/core/src/paper-journal.ts`: `nse-cash-2026-09-12-v1` rates, per-leg, ceiling to paise; 2 bps slippage per side. | Reuse; version the rate card. |
| Worker | croner, `protect` overlap guard, graceful drain, `pg_try_advisory_xact_lock(802,0)` scan lock, per-instrument `pg_advisory_xact_lock(802,id)`; no per-job checkpoints; `withRetry` only at startup. | Checkpoints and restart replay are new (§9). |
| Money | Integer paise everywhere; `assertPaise`; DB CHECKs. | Continue; ledger in `bigint` paise. |
| Tests | Vitest; real-Postgres suites in `packages/db/src/__tests__` skip without `TEST_DATABASE_URL`; CI runs them. | Every constraint gets a real-Postgres test. |
| Licensing | dhan-provider-plan §9: both brokers' terms permit personal use; displaying live prices to third parties needs an authorised vendor. | Beta stays private/invite-only until that decision (§18). |

---

## 2. Missing intraday infrastructure

What the paper-trading feature needs and does not have, in dependency order:

1. **Per-user portfolio and ledger** (tables, repositories, pure accounting functions).
2. **Trade-intent contract** separated from the shared book: `strategy_signals` keeps evidence + *level outcomes*; money moves to paper tables.
3. **Per-portfolio risk engine** (pure): allocation, limits, reason codes.
4. **Settings, toggle, emergency stop, audit** with confirmation UX.
5. **Exchange calendar service** (holidays, special sessions, changed timings) — today only weekday cron + Fyers status.
6. **Worker checkpoints, restart replay, per-portfolio locks, idempotency keys** on every write.
7. **Square-off assurance**: entry cutoff, exit initiation, verification, retry, alert, reconciliation.
8. **Daily equity snapshots and reconciliation job.**
9. **Performance attribution** per strategy / version / instrument / portfolio with sample-size warnings.
10. **`/paper-trading` page + APIs**, and the status card on `/intraday`.
11. **Dhan route flips** and socket-driven observations (replacing 5-s REST sampling), with reconnect and gap detection feeding the continuity flag.
12. **Operational monitoring**: health endpoint, alert log, "position still open after cutoff" check.

---

## 3. Dhan integration requirements

Facts, then requirements. Facts from the official docs, checked 2026-09-17.

| Item | Fact | Source |
| --- | --- | --- |
| Intraday candles | `POST /v2/charts/intraday`, intervals **1, 5, 15, 25, 60 min**, **90 days per request**, **last 5 years** available, epoch-second timestamps **(verified)** | dhanhq.co/docs/v2/historical-data |
| Daily candles | `POST /v2/charts/historical`, back to inception **(verified)** | same |
| Live feed | `wss://api-feed.dhan.co?version=2&token=…&clientId=…&authType=2`; **5,000 instruments/connection, 5 connections, 100 instruments per subscribe message**; packet modes ticker(2)/quote(4)/full(8); prev-close(6) on subscribe; **disconnect packet code 50 with a 2-byte reason** (805 = too many sockets); **server ping every 10 s, reply within 40 s** **(verified)** | dhanhq.co/docs/v2/live-market-feed |
| Rate limits | Data APIs **5/s, 100,000/day**; Quote APIs **1/s**; Non-trading **20/s** **(verified)**. Order-API limits irrelevant (never called). | dhanhq.co/docs/v2 |
| Token | 24 h from generation; documented TOTP endpoint `generateAccessToken?dhanClientId&pin&totp`; `POST /v2/RenewToken` while alive; no logout endpoint; single-session kill **not documented** (worker already tolerates both) | dhan-provider-plan §3.4 (2026-09-16) |
| Symbols | Numeric `securityId` + `exchangeSegment` (`NSE_EQ`, indices `IDX_I`); scrip master CSV | already in `packages/dhan/src/instruments.ts`, `providers-dhan/src/adapter.ts` |
| Market status | **No REST endpoint.** Socket may carry a status packet (unverified in v2). | stays on Fyers + calendar |
| Cost | ₹499 + GST / 30 days, auto-debited | dhan-provider-plan §3.1 |
| Licensing | Personal use; no redistribution to third parties. Multi-user public display needs an authorised vendor. | dhan-provider-plan §9 |

Requirements for this feature:

- **R1 Routes.** Production env: `MARKET_DATA_PROVIDER=routed`, `MARKET_DATA_ROUTE_INTRADAY_BARS=dhan`, `MARKET_DATA_ROUTE_QUOTES=dhan`, `MARKET_DATA_ROUTE_BARS=dhan`, `MARKET_DATA_ROUTE_INSTRUMENTS=dhan`, `MARKET_DATA_ROUTE_STATUS=fyers`, `MARKET_DATA_ROUTE_STREAM=fyers` (Phase 2 flips to `dhan`). Every route falls back to the other provider on failure; the router already logs route events.
- **R2 Coexistence with Fyers.** Nothing above the adapters changes: business code sees `MarketDataProvider`, `Bar`, `Quote`, `Tick`. Fyers remains the free fallback and the only market-status source. The boundary test (`packages/market-data/src/__tests__/boundary.test.ts`) keeps provider names out of `apps/*` and `packages/core`.
- **R3 Observations from the socket.** Phase 2 replaces the 5-s REST sampling with socket ticks for the universe (≤ 100 symbols, one connection), writing the same `signal_quotes`/`signal_observations` rows with `continuous` computed from **tick gaps**, and falling back to REST sampling when the socket is silent > 10 s (existing hub rule). Rate budget: history backfill 51 requests at 08:50 (+ incremental per scan) ≪ 5/s; REST quote fallback 1 call/5 s ≪ 1/s.
- **R4 Reconnect.** On close/disconnect packet: exponential backoff with jitter (existing `createReconnectingStream` in `packages/shared/src/stream.ts`), re-subscribe in 100-symbol chunks, and mark a **coverage break** for every open position (the engine then refuses to invent fills across the gap). Reply to server pings.
- **R5 Timestamps.** Dhan LTT is epoch seconds (exchange time). Adapter converts to UTC ms; `receivedAt` is the worker clock; both stored. A tick whose exchange time is > 15 s older than receipt is *stale* (§12).
- **R6 Instrument mapping.** Persist the Dhan `segment:securityId` per instrument in a new `instrument_provider_refs` table (§7) instead of relying only on the in-memory scrip-master index, so a rename or a re-listed id is auditable.
- **R7 No order surface.** `packages/dhan` has no order module today; it must never gain one. Build-time guard in §15.
- **R8 Token.** Existing nightly mint + self-heal; add the socket's 805/credential disconnect reasons to the self-heal trigger list.

---

## 4. Recommended user experience

**Where.** A dedicated **`/paper-trading`** page (the brief's recommendation stands: positions, activity, history, risk and performance would overcrowd `/intraday`). `/intraday` gets a compact **Paper trading status card**: ON/OFF, portfolio value, today's net P&L, open positions, active strategies, link.

**Vocabulary** (CLAUDE.md): BUY/SELL for direction only; "entry level", "stop level", "Target 1/2", "shares (simulated)", "paper trade", "result"; never order/quantity/position-as-noun in UI copy — the tables are labelled "Open paper trades" rather than "Positions". "Simulation only — no real orders" badge in the header at all times.

**Toggle ON.** Switch → confirmation dialog:
- "Everything here is simulated: trades, balances, profits and losses. No real orders are placed and no money moves."
- Shows: starting virtual capital ₹2,00,000 (or current equity if resumed), the enabled strategies with their risk settings (risk per trade 1 %, max 3 open, max 5/day, daily loss halt 2 %), the square-off time 15:15.
- "Trades start from the **next signal after you switch on**. Earlier signals today are not taken."
- Confirm button copy: "Start paper trading".

**Recommendation on activation timing:** *next eligible closed candle*, i.e. intents whose `signalAt > enabledAt`. Rationale: it is the simplest sentence a user can hold ("from now on"), it needs no calendar reasoning in the UI, and it cannot backfill because the engine compares the intent's candle-close time with the settings' `enabledAt`. "From the next session" is not safer — it just delays — and it confuses a user who switched on at 10:00 and sees nothing all day. The dialog states the rule.

**Toggle OFF.** No dialog; immediate. Banner: "Paper trading is off. No new trades will be taken. N open paper trades will finish under their strategy's rules or at the 15:15 square-off." Audit row.

**Emergency stop.** A separate red-outlined button "Stop new entries" (with confirm) that sets `entriesPaused=true` across all strategies without changing the toggle; open trades keep being managed. Clearing it requires the same button ("Resume entries"). Audit row for both. Distinct from the toggle so a user can pause on a bad day without losing their settings.

**States to design explicitly:** OFF · market closed · no strategies enabled · no signals today · no open trades · no completed trades · Dhan feed disconnected · stale data · worker delayed (> 2 cycles) · risk controls paused entries (daily loss / drawdown / emergency stop). Each has a one-line explanation and, where useful, the next expected time.

**Accessibility/responsiveness:** tables ≥ `md`, stacked cards below; 44 px targets; colour never the only carrier; live regions for the activity timeline.

---

## 5. System architecture

```
                 ┌──────────────── packages/core (pure) ────────────────┐
                 │ intraday/ (ORB-VC evaluator, lifecycle, replay)       │
                 │ paper/   (NEW) intent → risk decision → simulated     │
                 │          order → fill → position → ledger → metrics  │
                 └───────────────▲───────────────────────────▲──────────┘
                                 │ data + config in, results out
┌── apps/worker ─────────────────┴───────────────────────────┴──────────┐
│ intraday-scan   : bars → evaluateOrb → publish trade intent (global)  │
│ paper-entries   : new intents × active portfolios → decision/order/fill│
│ paper-monitor   : quotes/ticks → position events → exits              │
│ paper-squareoff : 15:15 exits, verify, retry, alert, reconcile        │
│ paper-snapshot  : equity snapshot per portfolio (5 min + close)       │
│ feed            : Dhan socket → observations (fallback REST 5 s)      │
│ calendar        : session lookup (config + provider status)           │
└──────────────▲───────────────────────────────────────────────────────┘
               │ MarketDataProvider (router: dhan | fyers per route)
┌── packages/db ┴───────────────────────────────────────────────────────┐
│ strategy_signals (intents) · paper_* (per user) · exchange_sessions   │
│ worker_checkpoints · instrument_provider_refs · minute_candles        │
└──────────────▲───────────────────────────────────────────────────────┘
               │ read-only for paper data
┌── apps/web ───┴───────────────────────────────────────────────────────┐
│ /paper-trading (+ status card on /intraday) · /api/paper/* (user)     │
│ writes ONLY: settings toggle, strategy assignments, emergency stop    │
└───────────────────────────────────────────────────────────────────────┘
```

Rules the architecture enforces:

- **Write boundary:** the worker is the only writer of orders, fills, positions, ledger, snapshots. The web app writes settings, assignments, emergency stop and audit rows for those actions — nothing that moves virtual money.
- **Purity:** `packages/core/src/paper/*` takes `(intent, portfolioState, config, observation)` and returns decisions and ledger deltas. No clock, no I/O.
- **Determinism:** identical inputs → identical decisions, because allocation order is a sort, fills come from stored observations, and every threshold is versioned config.
- **Provider neutrality:** the engine never sees a provider; the feed job maps ticks to `IntradayObservation`.

---

## 6. Event and execution flow

```
closed 5m candle (worker, +2 s)
  → evaluateOrb → SIGNAL → publish trade intent (strategy_signals; global; once)
  → paper-entries cycle (same tick, after the scan lock releases):
      for each active portfolio (paper ON, not paused, calendar says session):
        intents with signalAt > enabledAt and not yet decided for this portfolio
        → decidePaperEntries(intents, portfolioState, limits)  [pure, §10]
        → per intent: ACCEPT → paper_order PENDING (idempotency: portfolioId+intentId)
                      REJECT → paper_order REJECTED + reason code (also stored)
  → paper-monitor (every observation for the instrument, under instrument+portfolio locks):
      PENDING order + first observation after signalAt
        → fill at slipped next price (gap guard) → paper_fill → position OPEN
          ledger: RESERVE→ (cash − cost − charges)
        → or EXPIRED (validity window passed) / CANCELLED (entries paused before fill)
      OPEN position + observation
        → target1 → partial exit (fill) + stop→entry (position event STOP_UPDATED)
        → target2 / stop / breakeven stop → exit fill → CLOSED + ledger credit + realised P&L
        → coverage break → position flagged AMBIGUOUS_COVERAGE (no invented fill)
  → paper-squareoff (15:15:00 first covered observation ≥ cutoff; retries to 15:29:30)
        → EXIT_PENDING → exit fill → CLOSED (reason EOD_SQUARE_OFF)
        → any position still OPEN at 15:30:15 → risk event OPEN_AFTER_CUTOFF + alert; reconciliation closes it UNRESOLVED at the last covered price with resolution UNAVAILABLE and P&L marked unreliable (never overnight)
  → paper-snapshot (every 5 min in session + 15:35): equity, cash, exposure, drawdown
  → nightly reconcile (15:45): Σ ledger == cash; Σ open == 0; snapshots consistent; report
```

**Statuses.** Orders: `PENDING → ACCEPTED → FILLED | REJECTED | EXPIRED | CANCELLED`. Positions: `OPEN → EXIT_PENDING → CLOSED`. A `resolution` flag (`OBSERVED | UNAVAILABLE`) travels with fills and closes exactly as the intraday lifecycle does today.

**Reason codes** (stored on the order or position, shown in plain words): `INSUFFICIENT_CASH`, `PORTFOLIO_RISK_LIMIT`, `DAILY_LOSS_LIMIT`, `DRAWDOWN_LIMIT`, `MAX_POSITIONS`, `MAX_TRADES_PER_DAY`, `STOCK_EXPOSURE_LIMIT`, `SECTOR_EXPOSURE_LIMIT`, `DUPLICATE_SIGNAL`, `CONFLICTING_SIGNAL`, `EXISTING_POSITION`, `STRATEGY_DISABLED`, `PAPER_TRADING_DISABLED`, `ENTRIES_PAUSED`, `SIGNAL_BEFORE_ACTIVATION`, `SIGNAL_EXPIRED`, `MARKET_CLOSED`, `STALE_MARKET_DATA`, `MISSING_CANDLE`, `ENTRY_GAP_TOO_LARGE`, `INVALID_STOP`, `QUANTITY_ZERO`, `AFTER_ENTRY_CUTOFF`, `EOD_SQUARE_OFF`, `COVERAGE_UNAVAILABLE`.

---

## 7. Database design

Inspected `packages/db/src/schema/*`. Conventions kept: `timestamp({withTimezone:true})`, integer/bigint paise, `snake_case`, hand-written migrations for triggers/CHECKs, append-only via `reject_mutation()`.

### 7.1 Existing tables, changed

| Table | Change |
| --- | --- |
| `strategy_signals` | Becomes the **trade-intent** row. Keep evidence (frozen) and the level-outcome projection **without money**: drop `taken`, `skipReason`, `shares`, `remainingShares`, `exits`, `fill`-as-money from the projection type (keep `fill` as the *observed next price* for the global status only). Add `strategy_id text`, `entry_rule jsonb`, `valid_until timestamptz`, `sector text`. `realised_net_paise` column removed (moves to positions). Migration rewrites existing rows' JSON with a one-off script; old columns dropped in a later migration after the page no longer reads them. |
| `strategy_signal_events` | unchanged (global level events). |
| `instruments` | unchanged; `providerRef` stays for the primary provider. |

### 7.2 New tables

All `paper_*` tables carry `portfolio_id` → `paper_portfolios.id`, and every read path joins through the portfolio's `user_id = session user`. No table stores `user_id` twice except where noted for audit survival.

| Table | Purpose · important columns · keys · notes |
| --- | --- |
| **`paper_portfolios`** | One per user. `id`, `user_id` (unique, FK `auth_users`), `starting_capital_paise` (default 20 000 000), `created_at`, `reset_generation int` (increments on a future "reset" feature; every child row carries it so a reset never mixes histories). Mutable columns: none besides `reset_generation`. Retention: life of the account. |
| **`paper_settings`** | 1:1 with portfolio (PK `portfolio_id`). `enabled bool` (default false), `enabled_at`, `disabled_at`, `entries_paused bool`, `entries_paused_at`, `risk_bps` (100), `max_open_positions` (3), `max_trades_per_day` (5), `max_position_exposure_bps` (3500), `max_portfolio_exposure_bps` (10000), `max_stock_exposure_bps` (3500), `max_sector_exposure_bps` (6000), `daily_loss_halt_bps` (200), `max_drawdown_halt_bps` (1000), `settings_version int` (bumps on every change; orders record the version they were decided under), `updated_at`. Mutable, user-writable via API with CHECKs on ranges. |
| **`paper_strategy_assignments`** | Which strategies a portfolio runs. PK (`portfolio_id`, `strategy_id`); `enabled`, `priority int` (lower wins), `risk_bps_override` nullable, `updated_at`. Mutable. Seeded with `orb-vc` enabled, priority 10, on portfolio creation. |
| **`paper_orders`** | The risk decision and (for accepted) the simulated entry order. `id`, `portfolio_id`, `intent_id` → `strategy_signals.id`, `strategy_id`, `strategy_version_id` → `strategy_versions`, `instrument_id`, `direction`, `side` (`ENTRY`/`EXIT`), `kind` (`MARKET_NEXT` v1), `requested_shares`, `status` (PENDING/ACCEPTED/FILLED/REJECTED/EXPIRED/CANCELLED), `reason_code`, `reason_text`, `decided_at`, `valid_until`, `settings_version`, `decision jsonb` (limits snapshot: cash, exposure, counts at decision time). **Unique (`portfolio_id`, `intent_id`, `side`, `leg`)** = idempotency key (`leg` = 0 entry, 1 T1 exit, 2 final exit). Index (`portfolio_id`, `decided_at`). CHECK: `status='REJECTED' ⇒ reason_code not null`. Append-only except `status` transitions, enforced by a trigger allowing only forward transitions. |
| **`paper_fills`** | One per executed leg. `id`, `order_id` (unique per leg → idempotent), `portfolio_id`, `position_id`, `at` (observation time), `received_at`, `price_paise`, `shares`, `slippage_paise`, `charges_paise`, `resolution` (OBSERVED/UNAVAILABLE), `observation_id` → `signal_observations.id` (provenance). Append-only (trigger). |
| **`paper_positions`** | Current state of one paper trade. `id`, `portfolio_id`, `intent_id`, `strategy_id`, `strategy_version_id`, `instrument_id`, `direction`, `status` (OPEN/EXIT_PENDING/CLOSED), `opened_at`, `closed_at`, `entry_price_paise`, `shares`, `remaining_shares`, `stop_paise` (published), `effective_stop_paise`, `target1_paise`, `target2_paise`, `target1_at`, `exit_reason`, `gross_realised_paise`, `charges_paise`, `net_realised_paise`, `initial_risk_paise`, `resolution`, `sequence` (event count), `square_off_at` (expected). **Unique (`portfolio_id`, `intent_id`)**; partial unique (`portfolio_id`, `instrument_id`) where `status<>'CLOSED'` (one live paper trade per stock per portfolio); index (`portfolio_id`, `status`), (`portfolio_id`, `closed_at`), (`strategy_version_id`). Mutable projection; every change also appends an event. CHECK `closed_at is null = (status<>'CLOSED')`. |
| **`paper_position_events`** | Append-only history. PK (`position_id`, `sequence`); `kind` (OPENED, TARGET1_PARTIAL, STOP_UPDATED, TARGET2, STOP, BREAKEVEN_STOP, EOD_SQUARE_OFF, COVERAGE_BREAK, UNRESOLVED), `at`, `recorded_at`, `price_paise`, `shares`, `explanation text`, `observation_id`. Trigger rejects UPDATE. |
| **`paper_ledger_entries`** | The virtual cash book. `id bigint`, `portfolio_id`, `sequence` (per portfolio, unique), `at`, `kind` (OPENING_BALANCE, RESERVE, RELEASE, ENTRY_DEBIT, EXIT_CREDIT, CHARGES, ADJUSTMENT_RECONCILE), `amount_paise` (signed), `cash_after_paise`, `reserved_after_paise`, `ref_kind` (fill/order/position/reconcile), `ref_id`, `idempotency_key text unique`, `reset_generation`. **Append-only** (trigger). CHECK `cash_after_paise >= 0`. Retention: permanent. |
| **`paper_equity_snapshots`** | `id`, `portfolio_id`, `trading_date`, `at`, `cash_paise`, `reserved_paise`, `open_value_paise` (marked), `unrealised_paise`, `equity_paise`, `peak_equity_paise`, `drawdown_paise`, `exposure_paise`, `marks_complete bool`. Unique (`portfolio_id`, `at`). Append-only. Retention: 5 years (Timescale hypertable optional later). |
| **`paper_risk_events`** | `id`, `portfolio_id`, `at`, `kind` (DAILY_LOSS_HALT, DRAWDOWN_HALT, ENTRIES_PAUSED, OPEN_AFTER_CUTOFF, RECONCILE_MISMATCH, STALE_DATA), `detail jsonb`, `resolved_at`. Append-only except `resolved_at`. Feeds the page's "risk controls paused" state and ops alerts. |
| **`paper_audit_events`** | `id`, `at`, `user_id` (no FK, like `auth_audit`), `portfolio_id`, `event` (PAPER_ENABLED, PAPER_DISABLED, ENTRIES_PAUSED, ENTRIES_RESUMED, STRATEGY_ENABLED, STRATEGY_DISABLED, SETTINGS_CHANGED), `detail jsonb` (before/after), `ip_address`. Insert-only trigger. Retention: permanent. |
| **`worker_checkpoints`** | PK `job` text; `cursor jsonb` (e.g. last processed observation id per instrument, last intent id per portfolio), `updated_at`, `run_id`. Mutable; single row per job. |
| **`exchange_sessions`** | The calendar. PK (`exchange`, `trading_date`); `kind` (NORMAL, HOLIDAY, SPECIAL, MUHURAT, CLOSED_UNSCHEDULED), `open_at`, `close_at`, `entry_cutoff_at`, `square_off_at`, `source` (config/provider/manual), `note`. Mutable by the calendar job only. |
| **`instrument_provider_refs`** | PK (`instrument_id`, `provider_id`); `provider_ref`, `first_seen_at`, `last_seen_at`. Written by the instrument-master job. |

**User-ownership rule:** every repository function for `paper_*` takes `userId` and resolves the portfolio in the same query (`where portfolio.user_id = $userId`); there is no function that takes a `portfolioId` from a request. Cross-user tests in §16.

**Idempotency summary:** orders `(portfolio, intent, side, leg)`; fills `order_id`; position events `(position, sequence)`; ledger `idempotency_key` = `${portfolio}:${ref_kind}:${ref_id}:${kind}`; snapshots `(portfolio, at)`; intents `(instrument, trading_date)` (existing).

---

## 8. API design

All under `/api/paper/*`, Node runtime, `no-store`, **admin-only** (`getAdminUser()`: 401 when not signed in, `403 FORBIDDEN` for a non-admin — decided 2026-09-18, see the header), Zod on input and output, same error envelope `{error, code, remedy?}`. Mutations require same-origin (`origin`/`sec-fetch-site`) and JSON, as the old `/api/paper-trades` did.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/paper/overview` | GET | Header + summary cards + status card on `/intraday`: settings, market/session, feed status, last worker cycle, cash/equity/P&L/exposure/drawdown, open count, active strategies. One call, polled every 5 s while visible. |
| `/api/paper/settings` | GET / PUT | Read; update `enabled`, `entries_paused`, limits within CHECK ranges. PUT body carries `expectedVersion` (optimistic concurrency) and an `idempotencyKey`; writes an audit row. Enabling sets `enabled_at = now` server-side (never from the client). |
| `/api/paper/strategies` | GET / PUT | Assignments: enable/disable/priority per strategy; strategy catalogue (id, name, version, plain-language rules) from the code registry. |
| `/api/paper/emergency-stop` | POST | `{ paused: boolean, idempotencyKey }` → audit row. |
| `/api/paper/positions` | GET | Open and exit-pending paper trades with marks. |
| `/api/paper/activity` | GET | Timeline for a date (default today): intents considered, decisions, fills, events, square-off, with explanations; cursor pagination. |
| `/api/paper/trades` | GET | Closed trades: filters `from,to,symbol,strategyId,strategyVersionId,outcome,exitReason,q`, `page,pageSize≤100`, stable sort; `format=csv` streams the same filtered set. |
| `/api/paper/performance` | GET | `range` (7d/30d/90d/all), grouped by portfolio / strategy / version / instrument; equity curve from snapshots; distributions; sample-size flags. |
| `/api/paper/audit` | GET | The user's own audit events. |
| `/api/admin/paper/health` | GET (admin role) | Feed status, last cycles, portfolios with open positions after cutoff, reconcile mismatches. |

No endpoint exists to create, edit or close a paper trade.

---

## 9. Worker and scheduling design

### 9.1 Jobs (croner, Asia/Kolkata)

| Job | Schedule | Does |
| --- | --- | --- |
| `calendar-refresh` | 06:30 daily + startup | Builds today's `exchange_sessions` row: config calendar (holidays, special sessions) → provider status at 09:14 as a cross-check → writes `open_at/close_at/entry_cutoff_at/square_off_at`. |
| `intraday-warmup` | 08:50 Mon–Sat (calendar-gated) | existing |
| `feed` | long-running, started 09:05, stopped 15:35 | Dhan socket → observations; REST fallback; coverage breaks. |
| `intraday-scan` | `2,17 */5 9-14` (calendar-gated, entry-cutoff-gated) | existing; publishes intents |
| `paper-entries` | immediately after each scan, and every minute as a sweep | decisions + PENDING orders for every active portfolio |
| `paper-monitor` | on each observation batch (every 5 s) | fills, exits, events, ledger |
| `paper-squareoff` | 15:15:00 then every 15 s to 15:29:45 | exits, verify, retry, alert |
| `paper-snapshot` | `*/5 9-15` in session + 15:35 | equity snapshots |
| `paper-reconcile` | 15:45 + 06:45 | ledger ⇔ positions ⇔ fills; unresolved positions; report row |
| `intraday-reconcile` | every minute | existing (global level outcomes) |

Calendar-gating replaces `1-5` weekday cron fields: every in-session job first asks `sessionFor(today)`; `HOLIDAY`/`CLOSED_UNSCHEDULED` ⇒ no-op with a logged reason.

### 9.2 Locks, idempotency, ordering

- **Scan lock** (existing `pg_try_advisory_xact_lock(802,0)`) keeps one scan.
- **Instrument lock** (existing `(802, instrumentId)`) serialises observations per stock.
- **Portfolio lock** (new `(804, portfolioId)`) serialises decisions and ledger writes per portfolio. Order of acquisition is always instrument → portfolio to avoid deadlocks; `paper-entries` takes only the portfolio lock.
- Every write carries its idempotency key (§7); a replayed observation or a re-run cycle hits the unique index and is a no-op.
- **Out-of-order observations** are dropped by the existing cursor rule (`observation.at <= cursor`).
- **Checkpoints:** `paper-monitor` stores the last `signal_observations.id` applied per instrument; on restart it replays from the checkpoint (idempotent), so a crash between "fill written" and "checkpoint advanced" is harmless.
- **Duplicate cycle prevention:** croner `protect` plus the locks; a second worker process cannot double-write because of the unique keys — but the runbook still says "one worker per account".

### 9.3 Restarts and missed events

On startup: run `calendar-refresh`, reconnect the feed, replay observations since checkpoint, then run `paper-entries` once (intents still valid) and `paper-squareoff` if past cutoff. Any position whose coverage broke during the outage is marked `COVERAGE_BREAK`; if no covered observation arrives before square-off it closes `UNRESOLVED` at the last covered price with `resolution=UNAVAILABLE` and is excluded from performance denominators.

### 9.4 Exchange calendar service

`packages/core/src/calendar/` (pure): `sessionFor(date, calendarConfig)` → `{kind, openAt, closeAt, entryCutoffAt, squareOffAt}`.
`config/nse-calendar.yaml` (versioned): yearly holiday list, special sessions (e.g. Muhurat with its own timings), timing overrides. **The NSE site refuses non-browser clients** (confirmed while writing this plan), so the list is **operator-verified** from NSE's published circular each December and on any mid-year circular; the calendar job logs a warning 14 days before the config's last dated entry. Unexpected closures: if the calendar says NORMAL but provider status says closed at 09:16 and no minute candles arrive by 09:20, the day is marked `CLOSED_UNSCHEDULED` and a risk event is raised; no entries; any (impossible) open positions go through reconciliation.

NSE normal session: 09:15–15:30; pre-open 09:00–09:08; closing session 15:40–16:00 (standard NSE capital-market timings; re-check against the exchange's market-timings page when seeding the config). Recommended defaults: **entry cutoff 14:30** (last signal candle), **square-off 15:15** (15 min before close — well clear of the closing-price window and of last-minute liquidity thinning), configurable per session kind (Muhurat: cutoff = open + 30 min, square-off = close − 10 min).

---

## 10. Shared-capital allocation rules

Evaluated per portfolio, per candle, by a pure function `decidePaperEntries(intents, state, limits)`. Deterministic order, no database arrival order anywhere.

**Pre-filters (each yields a stored REJECTED order with the reason):**
1. Paper OFF → `PAPER_TRADING_DISABLED`; entries paused → `ENTRIES_PAUSED`; intent `signalAt ≤ enabledAt` → `SIGNAL_BEFORE_ACTIVATION`; strategy not enabled for this portfolio → `STRATEGY_DISABLED`; session closed / after cutoff → `MARKET_CLOSED` / `AFTER_ENTRY_CUTOFF`; intent past `validUntil` → `SIGNAL_EXPIRED`.
2. Daily loss halt or drawdown halt active → `DAILY_LOSS_LIMIT` / `DRAWDOWN_LIMIT`.
3. Same instrument already has a live paper trade → `EXISTING_POSITION`. Same strategy+instrument+session already decided → `DUPLICATE_SIGNAL`.
4. Two intents for the same instrument in the same batch with opposite directions: the strictly higher-priority strategy's intent proceeds, the other is `CONFLICTING_SIGNAL`; equal priority → **both** rejected `CONFLICTING_SIGNAL`. Same direction from two strategies: higher priority takes it, the other `DUPLICATE_SIGNAL` (attribution goes to one strategy; never double exposure).

**Ordering of survivors:** `(strategy priority asc, intent strength desc, symbol asc)` where strength is the strategy's declared ranking metric (ORB-VC: relative volume). Ties broken by symbol so two runs give the same answer.

**Sizing (integer paise, per intent, in that order):**
```
riskBudget      = floor(equity × riskBps / 10000)            # equity = cash + reserved + marked open value
perShareRisk    = |plannedEntry − stop|                       # plannedEntry = intent ref (signal close); re-checked at fill
sharesByRisk    = floor(riskBudget / perShareRisk)
sharesByCash    = floor(availableCash / plannedEntry)         # no leverage
sharesByPosCap  = floor(equity × maxPositionExposureBps/10000 / plannedEntry)
sharesByStock   = floor((equity × maxStockExposureBps/10000 − exposure[instrument]) / plannedEntry)
sharesBySector  = floor((equity × maxSectorExposureBps/10000 − exposure[sector]) / plannedEntry)
sharesByPort    = floor((equity × maxPortfolioExposureBps/10000 − totalExposure) / plannedEntry)
shares          = min(all of the above)
reduce shares until entryCost + roundTripCharges ≤ availableCash
if shares < 1 → QUANTITY_ZERO (or INSUFFICIENT_CASH when sharesByCash was the binding cap)
```
Then counts: `openPositions + acceptedThisBatch ≥ maxOpen` → `MAX_POSITIONS`; `tradesToday + accepted ≥ maxPerDay` → `MAX_TRADES_PER_DAY`. The decision snapshot (every operand above) is stored in `paper_orders.decision` so the UI can say *why 67 shares* and *why rejected*.

**Cash reservation:** ACCEPT reserves `shares × plannedEntry × (1 + maxSlipBps)` + charges; fill converts the reservation to the actual debit and releases the difference; EXPIRED/CANCELLED releases everything. Reservations are ledger entries, so "available cash" is always `cash − reserved` from the ledger.

**Strategy-level capital usage** is derived, not allocated: `Σ open value by strategy / equity`, shown on the page. A per-strategy budget cap is a later option (`paper_strategy_assignments.max_exposure_bps`), not in v1.

---

## 11. Risk-management defaults

| Limit | Default | Rationale |
| --- | --- | --- |
| Starting virtual capital | ₹2,00,000 | product decision |
| Risk per trade | 1 % of equity (₹2,000 at start) | matches ORB-VC; with a ~0.7 % stop the cash cap binds first — expected |
| Max open paper trades | 3 | one screen of attention |
| Max trades per day | 5 | strategy default |
| Max exposure per trade / per stock | 35 % of equity | with no leverage, 3 trades fit |
| Max sector exposure | 60 % | NIFTY 50 is bank-heavy |
| Max portfolio exposure | 100 % (no leverage) | cash-settled simulation |
| Daily loss halt | −2 % of start-of-day equity → no new entries today | two full losses |
| Drawdown halt | −10 % from peak equity → no new entries until the user resumes (audit) | forces a look |
| Entry gap guard | fill > 0.30 % beyond signal close → rejected | existing rule |
| Entry validity | next candle only (5 min) | market-next entries |
| Square-off | 15:15; entry cutoff 14:30 | §9.4 |

Users may tighten but not loosen beyond CHECK bounds (risk ≤ 2 %, open ≤ 5, per day ≤ 10, exposure caps ≤ 50 %/100 %). Every change bumps `settings_version` and is audited.

---

## 12. Fill and execution assumptions

Three tiers, and the page names the one in use:

| Tier | Data | What it can and cannot claim |
| --- | --- | --- |
| **Quote-based (live, v1)** | Socket ticks (Phase 2) or REST samples every 5 s | Fill at the *next observed price after the signal candle closes* + 2 bps slippage rounded to tick; stop/target on observed touches; gaps through the stop exit at the worse observed price. Cannot see prints between samples; a 5-s sample can miss a wick that a broker would have hit — therefore a coverage gap > 15 s marks the outcome **Unavailable** rather than guessing. |
| **Candle-based (replay/backtest)** | 1-minute OHLC | Open, adverse extreme, favourable extreme, close — in that order — so a bar touching both stop and target **stops out** ("stop wins"). A gap open fills at the open + slippage. Never called live. |
| **Order-book execution** | not available | Not modelled. Nothing here is broker-grade: no queue position, no partial fills, no impact. |

Rules that hold in both simulation tiers:
- Signals from closed candles only; earliest fill strictly after `signalAt`; the signal candle's own O/H/L are never a fill price.
- Full-fill-or-none. Partial *exits* at Target 1 are modelled (shares are ours to split); partial *fills* are not, because neither quotes nor 1-minute bars can honestly model them.
- Tick rounding in the adverse direction on fills, favourable on targets.
- Charges: versioned rate card (`nse-cash-2026-09-12-v1`), per leg, ceiling to paise; **gross and net stored separately**.
- Stale data: observation age > 15 s or exchange time ahead of receipt ⇒ ignored and counted; missing candle ⇒ no signal (existing).
- Entry kinds: v1 supports `MARKET_NEXT`. `STOP_BEYOND_LEVEL` and `LIMIT` are reserved in the contract for future strategies and rejected with `UNSUPPORTED_ENTRY_KIND` until implemented (with their own ambiguity rules).
- Worker delay > 30 s after a candle close ⇒ intent published `LATE` and rejected for entry.

---

## 13. Strategy integration contract

`packages/shared/src/paper.ts` — provider-neutral, versioned:

```ts
interface TradeIntent {
  id: number;                       // strategy_signals.id
  strategyId: 'orb-vc' | string;    // stable id from the code registry
  strategyVersionId: number;        // immutable strategy_versions row
  instrumentId: number; symbol: string; sector: string | null;
  direction: 'BUY' | 'SELL';
  signalAt: number;                 // candle close, ms UTC
  sessionDate: string;
  entry: { kind: 'MARKET_NEXT'; reference: Paise; maxSlipBps: number };
  validUntil: number;               // ms UTC; MARKET_NEXT = signalAt + 5 min
  stop: Paise; target1: Paise; target2: Paise; riskDistance: Paise; tickSize: Paise;
  exits: { partialAtTarget1: number; breakevenAfterTarget1: boolean; trailing: null | {...}; timeExitAt: number | null };
  sizing: { strength: number; };    // ranking metric for allocation ties
  evidence: IntradayEvidence;       // factor breakdown + indicator snapshot, frozen
  invalidation: { reason: string } | null;
}
```

A strategy is a module in `packages/core/src/strategies/<id>/` exporting `{ id, name, revision, config, evaluate(bars, ctx) → intent | reject, describeRules() }` and registered in a code-level catalogue. The paper engine imports the catalogue only for names and rules text — never for evaluation. Adding a strategy = new module + catalogue entry + assignment row; the engine does not change. Positions store `strategy_version_id`; publishing a new version mints a new row and existing positions keep managing under the version that opened them because their stop/targets/exit rules are copied onto the position at open, not re-read.

The ORB-VC evaluator already emits `IntradayEvidence` with everything above; Phase 3 wraps it as the first `TradeIntent` producer.

---

## 14. Performance calculations

Computed by pure functions over closed trades (`resolution=OBSERVED` only; unresolved trades are counted and shown but excluded from rates) and equity snapshots:

- Total / open / closed trades; win rate = wins ÷ closed (breakeven counted separately); average win, average loss (net); **profit factor** = Σ net wins ÷ |Σ net losses| (null when no losses); **expectancy** in ₹ and in × amount risked = mean(net ÷ initial risk); Target 1 / Target 2 / stop hit rates over closed trades; average holding time; Σ simulated charges; gross vs net.
- Equity curve from snapshots; daily net P&L from ledger by trading date; max drawdown over the snapshot series (peak-to-trough, ₹ and %).
- Attribution by strategy, strategy version, instrument, exit reason — same function, grouped.
- **Sample-size warning:** fewer than **30** closed trades in a group ⇒ "Too few trades to judge"; 30–99 ⇒ "Early read"; the win-rate shows a Wilson 95 % interval so 6/10 is visibly not 60 %.
- Every figure carries the disclaimer; no annualised returns, no Sharpe on < 60 sessions.

---

## 15. Security boundaries

1. **No order code path.** `packages/dhan` has no order/portfolio/funds module and gets a `README` line saying so. A new test `packages/market-data/src/__tests__/no-execution.test.ts` greps the whole tree (excluding `docs/`) for `placeOrder`, `/v2/orders`, `orderRequest`, `modifyOrder`, `cancelOrder`, `positions`, `holdings`, `fundlimit`, `tradingPin`, `TRADING_PIN` and fails on any hit outside an allowlist of comments. Same for Fyers order endpoints.
2. **No trading credentials.** `DHAN_PIN`/`DHAN_TOTP_SECRET` are the *login* PIN and TOTP that the documented data-token endpoint requires; no static IP, no order-API key. The runbook states the Dhan account must have **no funds** and, if the platform allows, API order permissions disabled.
3. **Engine purity.** `packages/core/src/paper` cannot import providers (boundary test) and has no network capability by construction.
4. **User isolation.** Repository functions resolve the portfolio by `userId` from the session; real-Postgres tests attempt cross-user reads/writes and expect empty results/403. Admin health endpoint exposes counts, never another user's trades. **Role gate (2026-09-18):** on top of that, every paper and intraday page and endpoint requires the `admin` role while the feature is under evaluation; a normal user never sees the pages, the navigation entries or the data.
5. **Mutations:** same-origin + JSON + size limit + idempotency key + optimistic version; rate-limited per user.
6. **Audit:** every toggle/pause/strategy/settings change is an insert-only row with before/after and IP.

---

## 16. Testing strategy

| Layer | Tests (deterministic fixtures in `packages/core/src/intraday/fixture.ts` + new `paper/fixture.ts`) |
| --- | --- |
| Core: sizing | every cap binding in turn (risk, cash, position, stock, sector, portfolio, charges); zero shares; integer overflow guards |
| Core: allocation | priority order; ties by strength then symbol; input-order invariance; conflicting directions (higher priority wins / equal → both rejected); duplicates; existing position; halts; counts; activation cutoff `signalAt ≤ enabledAt` |
| Core: lifecycle (existing + paper) | no-lookahead truncation; fill strictly after signal; gap guard; gap-up/down through stop; stop+target same bar ⇒ stop; partial at T1; breakeven; T2; EOD; coverage gap ⇒ Unavailable; time exit |
| Core: ledger | reserve/fill/release/exit/charges sequences balance; reconstruct cash from entries; snapshot equity/drawdown; charges per rate-card fixture |
| Core: performance | hand-computed win rate/PF/expectancy/hit rates/holding time; sample-size flags; Wilson interval |
| Core: calendar | holiday, special session, Muhurat timings, unscheduled closure detection |
| DB (real Postgres) | uniqueness/idempotency on orders, fills, events, ledger; append-only triggers; forward-only status trigger; one live trade per stock per portfolio; cross-user isolation; concurrent portfolio decisions; concurrent duplicate observation replay |
| Worker (mocked) | toggle ON/OFF mid-session; entries paused; restart replay from checkpoint produces no duplicates; square-off retry and alert; calendar gating; Dhan socket disconnect → REST fallback → coverage break; token 805 self-heal |
| Web | API auth/validation/CSRF; render tests for every state in §4; stories with SIMULATED fixtures; 320/390/1280 widths; a11y |
| Replay identity | `replay-intraday` extended to portfolios: replay of a stored session equals the live rows on every decision and level; fills differ only by data tier and are reported |

CI keeps running the real-Postgres suites (it did for PR #22).

---

## 17. Monitoring and operational plan

- **Structured logs** per job with `durationMs`; new `paper` child logger; reason-code histograms per cycle in `strategy_scan_runs`-style snapshots (`paper_cycle_runs`).
- **Health endpoint** (admin): feed connected/last tick age, last scan/entries/monitor/snapshot times, portfolios with open trades, positions open after 15:30:15, reconcile mismatches, calendar source for today.
- **Alerts** (log at `error` + a `paper_risk_events` row; Telegram hook is a later option): open after cutoff, reconcile mismatch, feed down > 60 s in session, token self-heal failure, calendar config expiring.
- **Runbook additions** (`docs/operations/deployment.md`): env routes, the "no funds in the Dhan account" rule, how to seed the calendar, how to read a rejected trade, what "Unavailable" means, how to run the replay after close.
- **Dashboards** are the page itself plus `pnpm replay:intraday`; no new infrastructure.

---

## 18. Risks and trade-offs

| Risk | Mitigation / trade-off |
| --- | --- |
| **Quote sampling misses wicks** (a broker would have stopped you out; the simulation did not) | Socket ticks in Phase 2 narrow it; coverage gaps are marked Unavailable; the page says "quote-based simulation" in the header. Never claim broker-grade. |
| **Slippage/charges understate reality** on thin names | Universe is NIFTY 50 with a turnover gate; rate card versioned; results labelled net of *estimated* charges. |
| **Survivorship / small samples** invite over-reading | Sample-size warnings, Wilson intervals, no annualisation; disclaimer everywhere. |
| **Data licence** | Broker data is personal-use; a public multi-user product must move to an authorised vendor before general availability. Beta stays invite-only; the provider boundary makes the swap mechanical. |
| **One worker, many portfolios** | Decisions are O(users × intents per candle) with one query per portfolio; fine to a few hundred users. Beyond that, batch the portfolio state read. |
| **Un-journaled 0019 migration** | Resolve in Phase 0 (journal it or delete it) before adding more hand-written migrations. |
| **Fyers dependency for market status** | Calendar service is the primary; provider status is the cross-check; if both are unavailable, no entries. |
| **Users expect manual control** | Product decision says no; the UI explains *why* every trade did what it did instead. |
| **Complexity** | Each phase ships alone; Phase 1 has no UI and can be proven by tests and replay before any user sees it. |

---

## 19. Phased implementation roadmap — see §21

## 20. Acceptance criteria (whole feature)

1. A new user has paper trading **OFF**, ₹2,00,000 shown, no trades, and the standing disclaimer.
2. Switching ON shows the confirmation with strategies, risk settings and the "from the next signal" rule; the audit row exists; no trade is created for any intent with `signalAt ≤ enabledAt` (test + replay).
3. Every paper trade shows: strategy + version, why entered (evidence), how filled (price, slippage, charges, data tier), Target 1/2 and stop status, why exited, gross and net result.
4. Two users with identical settings get identical decisions for the same intents (determinism test); a user never sees another's data (isolation tests).
5. At 15:30:15 on every session no portfolio has an OPEN position; if one does, a risk event and an alert exist and reconciliation resolves it as Unavailable — never overnight.
6. `Σ ledger = cash` and equity snapshots reconcile to the paise every night; a mismatch is a red health item, not a silent drift.
7. Replaying a stored session reproduces every live decision and level.
8. Performance views show per-strategy, per-version, per-instrument and portfolio figures with sample-size warnings and net-of-charges labels.
9. No code path can reach an order endpoint (`no-execution` test green); Dhan account holds no funds.
10. All §16 suites green in CI, including real-Postgres.

---

## 21. Phased roadmap

### Phase 0 — Repository audit and Dhan proof of concept (1–2 days)
- **Scope:** journal-or-delete `0019_drop_unsourced_columns.sql`; confirm prod env routes; run the Dhan socket for one session against the NIFTY 50 universe writing to a scratch table; measure tick gaps, reconnects, 805 behaviour, LTT vs receipt skew; verify whether a market-status packet exists in v2; confirm the Dhan account holds no funds.
- **Files:** `packages/db/drizzle/meta/_journal.json` (or delete the file), `scripts/dhan-feed-probe.ts` (new, scratch), `docs/planning/paper-trading-plan.md` §3 updated with measurements.
- **Migrations:** none (or 0019 journaled). **APIs/UI:** none. **Jobs:** none.
- **Tests:** none new. **Dependencies:** Dhan Data API subscription active.
- **Risks:** socket silent-while-connected; measure it.
- **Acceptance:** a one-page measurement table (gap p50/p99, reconnects, skew) and a go/no-go for using ticks as the live tier.

### Phase 1 — Portfolio, settings, ledger and deterministic simulation (core + db; no UI)
- **Scope:** `packages/shared/src/paper.ts` contracts; `packages/core/src/paper/{sizing,allocate,ledger,position,performance,calendar}.ts` pure functions; tables in §7.2 except feed-related; repositories with `userId` scoping; idempotency and triggers; `replay-intraday` extended to simulate a portfolio.
- **Migrations:** `0022_paper_portfolios.sql` (portfolios, settings, assignments, orders, fills, positions, position_events, ledger, snapshots, risk_events, audit_events, worker_checkpoints, exchange_sessions, instrument_provider_refs; triggers).
- **APIs:** none yet. **Jobs:** none yet. **UI:** none.
- **Tests:** all Core rows of §16; real-Postgres constraint suite; replay identity on the fixture session and on three stored sessions.
- **Dependencies:** none. **Risks:** getting sizing/ledger semantics wrong is expensive later — review this phase hardest.
- **Acceptance:** replay of a stored session through a ₹2,00,000 portfolio prints decisions with reason codes, a balanced ledger and performance figures; every §16 core test green.

### Phase 2 — Dhan intraday ingestion and closed-candle pipeline
- **Scope:** flip `MARKET_DATA_ROUTE_INTRADAY_BARS`/`QUOTES` to Dhan on the VPS; `feed` job on the Dhan socket (reconnect, resubscribe, ping, disconnect codes → self-heal), writing observations with tick-gap continuity; REST fallback; `instrument_provider_refs` population; calendar job + `config/nse-calendar.yaml` seeded (operator-verified) with 14-day expiry warning.
- **Files:** `apps/worker/src/jobs/{feed,calendar-refresh}.ts`, `packages/providers-dhan` (disconnect-reason mapping), `packages/market-data` (stream capability wiring), `config/nse-calendar.yaml`, `docs/operations/deployment.md`.
- **Migrations:** none beyond Phase 1. **APIs:** none. **UI:** none.
- **Tests:** worker socket disconnect/reconnect/fallback; calendar gating; adapter tick mapping; boundary tests still green.
- **Dependencies:** Phase 0 measurements. **Risks:** two observation sources double-writing — the instrument lock and cursor make the second a no-op.
- **Acceptance:** one full session with ticks: p99 tick gap < 15 s on liquid names, zero duplicate observations, calendar row for the day, scan and level outcomes unchanged versus REST sampling.

### Phase 3 — Strategy integration and automatic paper execution
- **Scope:** `strategy_signals` → trade intents (§7.1 migration and JSON rewrite); ORB-VC wrapped as the first `TradeIntent` producer with a code catalogue; `paper-entries` and `paper-monitor` jobs; checkpoints; settings API (toggle, strategies, emergency stop) with audit; portfolio auto-created on first visit or first enable.
- **Migrations:** `0023_trade_intents.sql` (add columns, rewrite projections, keep old columns until Phase 5 drops them).
- **APIs:** `/api/paper/settings`, `/strategies`, `/emergency-stop`, `/overview` (minimal). **UI:** none beyond a hidden dev toggle. **Jobs:** `paper-entries`, `paper-monitor`.
- **Tests:** worker toggle/pause/activation-cutoff/restart replay; DB idempotency under concurrent replay; API auth/CSRF/isolation.
- **Dependencies:** Phases 1–2. **Risks:** the shared ₹5L book on `/intraday` and per-user books disagree — the shared book is removed in Phase 5; until then `/intraday` shows global level outcomes only.
- **Acceptance:** two test users enabled mid-session receive fills only for intents after their `enabledAt`; replay equals live; re-running a cycle creates nothing.

### Phase 4 — Automatic position management and EOD square-off
- **Scope:** `paper-squareoff` (15:15 exits, verify, retry, alert), `paper-snapshot`, `paper-reconcile`, risk halts (daily loss, drawdown) as risk events, unresolved handling, health endpoint.
- **Files:** `apps/worker/src/jobs/paper-{squareoff,snapshot,reconcile}.ts`, `apps/web/src/app/api/admin/paper/health/route.ts`.
- **Migrations:** none (tables exist). **APIs:** admin health. **UI:** none.
- **Tests:** square-off retry with data outage; open-after-cutoff alert; snapshots/drawdown; reconcile mismatch detection; halts.
- **Dependencies:** Phase 3. **Risks:** a silent feed at 15:15 — retries to 15:29:45 then Unavailable, never overnight.
- **Acceptance:** five sessions with zero open positions after 15:30:15 and nightly reconcile balanced.

### Phase 5 — UI, analytics and strategy comparison
- **Scope:** `/paper-trading` page (header, summary cards, open trades, activity timeline, trade history with filters/pagination/CSV, performance with equity curve/drawdown/attribution/sample-size warnings), status card on `/intraday`, removal of the shared book from `/intraday` and `config/intraday-orb.yaml`, drop of the old projection columns.
- **Files:** `apps/web/src/app/paper-trading/page.tsx`, `components/paper/*`, `server/paper.ts`, `api/paper/{overview,positions,activity,trades,performance,audit}`; `components/intraday/*` (status card; trades card removed); stories + render tests.
- **Migrations:** `0024_drop_shared_book_columns.sql`.
- **Tests:** render tests for every §4 state; API contract tests; a11y; widths.
- **Dependencies:** Phases 3–4. **Risks:** overcrowding — keep the five-card structure; charts only where a number cannot say it.
- **Acceptance:** a non-professional user can answer the ten questions in the brief's "Primary goal" from the page without help; all states reachable in Storybook.

### Phase 6 — Monitoring, reconciliation hardening, testing and controlled beta
- **Scope:** alerts, runbook, no-execution test, load check (≥ 50 portfolios), invite-only beta with the licensing caveat stated to testers, weekly replay-vs-live diff, export of old `vwap_*`/`paper_study*` tables then drop (from the intraday plan's phase 6).
- **Migrations:** `0025_drop_vwap_tables.sql` (after export). **APIs/UI:** none new.
- **Tests:** full §16 matrix green in CI; a soak of five consecutive sessions.
- **Dependencies:** Phase 5. **Risks:** beta users treating simulation as advice — the disclaimer, the "quote-based simulation" label and the sample-size warnings are the answer, not a smaller font.
- **Acceptance:** §20 items 1–10 all demonstrated on production for one week with the health endpoint clean.

---

## 22. Phase 0 — what was done and what the operator must do

Done in code (branch `feat/paper-trading-phase-0`, 2026-09-17):

| Item | Result |
| --- | --- |
| Un-journaled migration | `0019_drop_unsourced_columns.sql` renumbered to **`0022_drop_unsourced_columns.sql`** and added to `meta/_journal.json`. SQL unchanged and idempotent (`DROP TABLE IF EXISTS intraday_signals`, no-op UPDATEs on layouts/views). It runs on the next deploy; the registry test `watchlist-model.test.ts` confirms the column ids it scrubs are indeed gone. |
| Execution guard | `packages/market-data/src/__tests__/no-execution.test.ts`: fails the build if any code line names a Dhan/Fyers order, positions, holdings, funds or trade-book endpoint, an order SDK method, an order request body, broker order state, or a trading PIN; also fails if `packages/dhan` or `packages/providers-dhan` ever gains an order/portfolio/funds module. Green on the current tree (9 checks). |
| Feed probe | `scripts/dhan-feed-probe.ts` (`pnpm dhan:feed-probe [--minutes 30] [--mode ticker|quote] [--out probe.md]`): opens one Dhan socket for NIFTY 50 + index with the worker-minted token and reports tick-gap percentiles, gaps over the 15 s coverage rule, exchange-time vs receipt skew, silences while connected, reconnects, disconnect codes and every packet kind seen. Read-only. |
| Market-status packet | The v2 live-feed documentation lists ticker(2), quote(4), OI(5), prev-close(6), full(8) and disconnect(50) packets only — no market-status packet **(verified 2026-09-17)**. The probe reports any other code seen on the wire. Decision stands: status = Fyers route + exchange calendar. |
| Routes | `.env.example` documents the routes; production values are on the VPS and must be confirmed by the operator (below). |

Operator checklist before Phase 1 sign-off (nothing here needs code):

1. During a live session run `pnpm dhan:feed-probe --minutes 30 --out docs/planning/phase0-feed-probe.md` on the VPS (it needs the worker's Dhan token from `provider_credentials`) and commit the output. Go/no-go for ticks as the live tier: p99 tick gap on liquid names < 15 s, reconnects ≤ 1 per 30 min, no unexplained packet codes.
2. Confirm the VPS `.env` routes: `MARKET_DATA_PROVIDER=routed`, `MARKET_DATA_ROUTE_INTRADAY_BARS`, `MARKET_DATA_ROUTE_QUOTES`, `MARKET_DATA_ROUTE_BARS`, `MARKET_DATA_ROUTE_INSTRUMENTS` = `dhan`; `MARKET_DATA_ROUTE_STATUS`, `MARKET_DATA_ROUTE_STREAM` = `fyers`. Note the values in `docs/operations/deployment.md` §5.
3. Confirm the Dhan account holds **no funds** and, if the platform offers it, that API order permissions are disabled. The application never calls order APIs (guarded by test), but the account should not be able to trade even if it did.
4. After the deploy that carries 0022, check `pm2 logs equitywise-worker` shows the migration applied and `\dt intraday_signals` no longer exists.

## 23. Phase 1 — what was built (2026-09-17)

Branch `feat/paper-trading-phase-1` (on top of Phase 0). No UI, no worker jobs yet; everything is provable from tests and the replay.

| Layer | Files | Notes |
| --- | --- | --- |
| Contracts | `packages/shared/src/paper.ts` | `TradeIntent`, limits/settings/assignment, reason codes, order/position statuses, sizing snapshot, decision, ledger entry, position, position events, exchange session, performance, calendar config |
| Engine (pure) | `packages/core/src/paper/{config,intent,state,sizing,allocate,ledger,position,snapshot,performance,calendar,replay}.ts` | `decidePaperEntries` (§10 rule), `sizePaperEntry` (every cap, binding cap named), append-only ledger with three balances and `reconstructLedger`, `advancePosition` on top of the existing intraday lifecycle (fills → ledger drafts + events), equity snapshot, performance with Wilson intervals and sample-size flags, `sessionFor` calendar, `replayPortfolio` |
| Existing lifecycle | `packages/core/src/intraday/lifecycle.ts` | `BookAllocation.maxShares` — the engine's decision is a ceiling the fill never exceeds; otherwise unchanged |
| Database | `packages/db/src/schema/paper.ts`, migration `0023_paper_trading.sql` (journaled), `repositories/paper.ts` | 14 tables of §7.2. Triggers: fills/events/ledger/audit append-only; orders forward-only status; positions' identity frozen and no reopen. Repositories resolve the portfolio by `userId`; decisions and fills run under a per-portfolio advisory lock (804); every write is idempotent (unique keys, `onConflictDoNothing`) |
| Replay | `scripts/replay-intraday.ts --portfolio [--capital 200000]` | Prints decisions with reason codes, positions with gross/charges/net, and the ledger balances for a ₹2,00,000 book |
| Tests | 39 core (`packages/core/src/paper/*.test.ts`), 5 real-Postgres (`packages/db/src/__tests__/paper.test.ts`, runs in CI) | Worked example on a ₹2L book: 23 shares (35 % position cap binds), reserve ₹68,272.55, fill ₹2,957.10, 11 out at ₹2,977.70, 12 at ₹2,999.55, gross ₹736.00, charges ₹72.85, net ₹663.15; ledger ends at ₹2,00,663.15 and reconstructs with zero mismatches |

Decisions taken while building (all within the plan):

- **Fill-time sizing uses only cash.** The decision already applied risk and exposure caps, so the fill passes `riskBps = 10000` and `maxShares = decidedShares`: the lifecycle re-checks free cash at the actual price and can size down, never up. Live and replay share this rule.
- **Ledger kinds and balances:** `OPENING_BALANCE`, `RESERVE`/`RELEASE` (free ⇄ reserved), `ENTRY` (free → locked), `EXIT` (locked cost + gross → free, with `lockedDeltaPaise` recorded so the book reconstructs), `CHARGES`. Equity = cash + reserved + locked + unrealised.
- **Decision order is part of the answer:** `decidePaperEntries` returns decisions in allocation order (pre-filter rejections as met, then candidates by priority → strength → symbol), and `replayPortfolio` assigns intent ids in symbol order, so results are identical for any input order (tested).
- **Sample-size thresholds:** < 30 closed trades "TOO_FEW", < 100 "EARLY".
- The `strategy_signals` → intent column changes (§7.1) are deferred to Phase 3; `intentFromSignal()` builds the intent from the existing row and evidence.

Not yet done: the real-Postgres suite ran only in CI terms (Docker absent locally); `config/nse-calendar.yaml` is seeded in Phase 2; no worker or web code touches these tables yet.

### Assumptions stated (no blocking questions found)
- Production routes are set as in §3 R1; Phase 0 confirms.
- One strategy (ORB-VC) ships; the contract supports more.
- ₹2,00,000 is per user, non-editable in v1; a "reset portfolio" action is a later feature (the `reset_generation` column is ready for it).
- The old shared ₹5,00,000 book is removed in Phase 5, not kept in parallel.
- Charges rate card stays `nse-cash-2026-09-12-v1` until an operator updates it; a change mints a new strategy version because it is hashed in.

## 24. Phases 2–6 — what was built (2026-09-18)

All on branch `feat/paper-trading-phase-1` (one branch for the whole feature; nothing committed until reviewed). 950 tests green locally; the real-Postgres suites run in CI.

### Phase 2 — feed and calendar

| Item | Where | Notes |
| --- | --- | --- |
| Exchange calendar | `config/nse-calendar.yaml`, `apps/worker/src/jobs/calendar-refresh.ts` | 2026 NSE equity holidays (cross-checked against a broker's published list), timings 09:15/15:30, entry cutoff 14:30, square-off 15:15; Muhurat 2026-11-08 as a placeholder with conservative timings. `calendar-refresh` 06:30 writes `exchange_sessions`; `calendar-check` 09:20 detects an unscheduled closure (calendar open + provider closed + no price since the open) and raises a risk event; a 14-day expiry warning becomes a `CALENDAR_EXPIRING` risk event and a red item on the admin page. Every in-session job is gated by `sessionToday` (cached 60 s). |
| Socket feed | `apps/worker/src/jobs/feed.ts`, `apps/worker/src/context.ts` | Dhan socket (ticker mode) for the NIFTY 50 universe, 09:05–15:35. Ticks are coalesced to one observation per instrument per second and written through `observeIntradayPrice` (ordering, continuity and the per-instrument lock live there). Reconnect/resubscribe/heartbeat come from the shared reconnecting stream; an `auth` failure invalidates and re-mints the credential once per 10 min. `instrument_provider_refs` is refreshed from the scrip master at start. The 5-second REST sweep now checks `feed.healthy()` and stands down while the socket delivers — it is the fallback, not a second writer. |
| Startup recovery | `apps/worker/src/index.ts` | On boot: calendar row, then (in session) socket, one decision pass, a monitor pass from the checkpoint, and the square-off if past 15:15. |

### Phase 3 — strategy integration and automatic entries

| Item | Where | Notes |
| --- | --- | --- |
| Strategy catalogue | `packages/core/src/paper/catalogue.ts` | `STRATEGY_CATALOGUE` (id, name, revision, timeframe, strength metric, plain rules); the engine reads names and rules only. |
| Trade intents | `apps/worker/src/jobs/paper.ts` (`entries`) | `strategy_signals` rows become `TradeIntent`s via `intentFromSignal` with the sector from `config/indices.yaml`; the §7.1 column rewrite was not needed — the frozen intent lives on `paper_orders.intent`. The scan no longer allocates a shared book: every signal is published with `skipReason = null` and each portfolio decides for itself. |
| Entries job | `paper.ts` | Per active portfolio: undecided intents → `loadPaperState` (marks from `signal_quotes`, peak/start-of-day from snapshots) → `decidePaperEntries` → `recordPaperDecisions`. Runs after every scan and each minute as a sweep. Halts raise one `DAILY_LOSS_HALT`/`DRAWDOWN_HALT` risk event; daily-loss halts clear at the nightly reconcile, drawdown halts wait for the user. The sweep cancels unfilled entries whose portfolio switched off (`PAPER_TRADING_DISABLED`), paused (`ENTRIES_PAUSED`) or whose window passed (`SIGNAL_EXPIRED`). |
| Monitor job | `paper.ts` (`monitor`) | Every second: observations after the `paper-monitor` checkpoint, applied to the portfolios holding that instrument via `applyPaperObservation` (idempotent), checkpoint advanced. First run ever starts from the newest observation. |
| Engine additions | `packages/core/src/paper/position.ts` | A market-next entry past `validUntil` is cancelled, never filled late; a fill that leaves room for no share declines the trade (`QUANTITY_ZERO`); the session's own square-off instant overrides the config's 15:15 (special sessions). |
| Settings API | `apps/web/src/server/paper.ts`, `apps/web/src/app/api/paper/{settings,strategies,emergency-stop}` | Same-origin + JSON + 4 KB + idempotency key (remembered per process for an hour) + optimistic `expectedVersion`; `enabledAt` is stamped server-side; every change audited with IP. Portfolio auto-created on first read. |

### Phase 4 — position management and end of day

| Item | Where | Notes |
| --- | --- | --- |
| Square-off | `paper.ts` (`squareOff`), `packages/db/src/repositories/paper-ops.ts` | From 15:15 every 15 s: unfilled entries cancelled (`EOD_SQUARE_OFF`), filled trades flagged `EXIT_PENDING` while the monitor waits for the first covered price ≥ 15:15 (the lifecycle exits there). After 15:30:15 anything still live raises `OPEN_AFTER_CUTOFF` once and is resolved by `resolvePaperPositionUnavailable`: exit at the last sampled price, `resolution = UNAVAILABLE`, ledger EXIT + CHARGES, event `UNRESOLVED`. Never overnight. |
| Snapshots | `paper.ts` (`snapshot`) | Every 5 min in session for switched-on portfolios and any with live trades: `equitySnapshot` over ledger balances and marks; unique per instant. |
| Reconcile | `paper.ts` (`reconcile`) | 15:45 and 06:45: `reconstructLedger` mismatches, Σ open `lockedPaise` = ledger locked, Σ pending `reservePaise` = ledger reserved. A problem is one `RECONCILE_MISMATCH` risk event (resolved automatically when clean) and an `error` log line. |
| Health | `/api/admin/paper/health`, `/admin/paper` | Session, calendar expiry, feed mode, portfolio counts, open-after-close, unresolved risk events by kind, last cycle per job, ledger mismatches. Counts only. |

### Phase 5 — page

| Item | Where |
| --- | --- |
| `/paper-trading` | **Admin-only** (`app/paper-trading/page.tsx` redirects a non-admin to `/watchlists`; the nav entry lives in `ADMIN_NAVIGATION`, shown in the user menu and on `/admin`). `apps/web/src/components/paper/paper-dashboard.tsx`: header with "Simulation only — no real orders", phase, feed and worker badges; state banners (holiday/weekend/unscheduled closure, stale or missing feed, worker delayed, halts, reconcile mismatch, open after close); `ControlsCard` (toggle with the confirmation dialog of §4, emergency stop with confirm, strategy switches, limits summary); `SummaryCards` (value, free cash, today net, open count, drawdown); `OpenTradesCard`; `ActivityCard` (decisions with "why 23 shares" and "why declined", position events; newest first, live region); `HistoryCard` (filters, paging, CSV); `PerformanceCard` (range, Wilson interval, sample-size badge, equity curve, daily net, attribution by strategy/version/stock/exit). Tables ≥ md, stacked cards below. |
| `/intraday` | **Admin-only** (same gate as `/paper-trading`; `/api/intraday/*` answers 403 to a non-admin). `PaperStatusCard` replaces the shared ₹5,00,000 book and the "coming soon" controls; the page shows global level outcomes only (`LEVEL_TRACKER`: one reference share, never short of cash). `config/intraday-orb.yaml` lost `capitalPaise`; `intradayTodaySchema` lost `book`. |
| Contracts | `packages/shared/src/paper.ts` §"Page contracts": overview, settings response, activity, trades page, performance report, health. |
| Tests | `apps/web/src/components/paper/paper.test.ts` (render tests over fixtures produced by the real engine; vocabulary guard), `paper.stories.tsx` (every state of §4). |

### Phase 6 — hardening

| Item | Where |
| --- | --- |
| Legacy tables | `scripts/export-legacy-tables.ts` (`pnpm data:export-legacy`), migration `0024_drop_legacy_vwap_tables.sql`; `packages/db/src/schema/vwap-signals.ts` keeps only `minute_candles`, `signal_quotes`, `signal_observations`. **Export before the merge that deploys 0024.** |
| Runbook | `docs/operations/deployment.md` §9 "Paper trading": what runs, no orders/no funds, calendar upkeep, reading the health page, reading a declined signal, what "Unavailable" means, replay after close, the 0024 export. |
| Vocabulary | The boundary test's order-vocabulary grep forced `/api/paper/positions` → `/api/paper/open-trades`; page copy never says order/quantity/position. |

### Not done / operator-dependent

- The Phase 0 feed probe has still not been run on the VPS during a session; the socket path is exercised only by unit tests with a fake provider. Run it before trusting ticks as the live tier.
- Load check (≥ 50 portfolios) and the five-session soak are production activities, not code.
- Muhurat 2026 timings are placeholders until the NSE circular.
- The Fyers socket is still what the watchlist hub uses (`MARKET_DATA_ROUTE_STREAM`); the worker's feed uses the Dhan socket directly regardless of that route.
