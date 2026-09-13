# Signals implementation and rollout

Implemented locally on 13 September 2026 following approval to build the Signals
plan. The page uses the existing App Router, account sessions, app shell, UI tokens,
Radix sheet, and React/fetch polling conventions. It adds no execution integration.

## Delivered

- `/signals`: responsive cards at every width, strategy name on page/cards/details,
  BUY/SELL direction icons, technical levels, quality breakdown, freshness, lifecycle,
  new-card accent, bookmarkable filters, stable pagination and sorting.
- A detail sheet with closed five-minute candles, frozen VWAP/EMA overlays, opening
  range and technical levels, confirmation marker, checklist and immutable event timeline.
- Shared scanner status and NIFTY direction/VWAP/ADX regime; daily pending, active,
  closed, target and stop counts. View pause affects only the viewer's refresh.
- Private prospective paper studies with cost-aware sizing, account-wide capital
  reservations, idempotent enrolment, optional breakeven after T1, and daily results.
  Resolved sample size, expectancy in R, profit factor and recorded intraday drawdown
  accompany win rate. Unfilled/unavailable studies do not enter the result denominator.
- Pure mirrored BUY/SELL evaluation, 250-bar warm-up, exact five-minute coverage,
  session-reset VWAP, all rejection gates, tick-rounded levels and explained scoring.
- Immutable minute history and signal evidence, append-only observations/events,
  worker-only shared writes, authenticated reads, user-owned watchlist filtering and
  private journal writes. Signal publication and events commit atomically; database
  locks and constraints enforce one pending/active setup and two publications per
  stock/session across strategy versions.

## Source map

| Concern | Files |
| --- | --- |
| Page and UI | `apps/web/src/app/signals/page.tsx`, `apps/web/src/components/signals/` |
| API boundary | `apps/web/src/server/trade-signals.ts`, `apps/web/src/app/api/signals/`, `apps/web/src/app/api/paper-trades/` |
| Contracts | `packages/shared/src/trade-signals.ts` |
| Strategy and lifecycle | `packages/core/src/vwap-strategy.ts`, `signal-lifecycle.ts`, `paper-journal.ts` |
| Persistence | `packages/db/src/schema/vwap-signals.ts`, `repositories/vwap-signals.ts`, migration `0016_striped_toad_men.sql` |
| Scheduling | `apps/worker/src/jobs/vwap-signals.ts`, `apps/worker/src/index.ts`, `config/vwap-signals.yaml` |
| Provider normalization | Existing quote mapper and closed-candle filtering in the provider packages |
| UI review fixtures | `apps/web/src/components/signals/signals.stories.tsx` (explicit SIMULATED origin) |

## Adopted implementation details

**Observation model.** The first implementation uses one worker-owned REST quote
batch every five seconds, through the existing normalized provider. It does not wire
a new WebSocket transport. Quotes are sampled observations, not an exhaustive trade
tape. A connected feed cannot prove that every intrabar crossing was captured.
Publication requires covered observations spanning confirmation, a quote within five
seconds, acceptable spread, and no observed trigger/invalidation crossing before
publication. Missing, stale or interrupted coverage suppresses signals or makes
outcomes permanently unavailable. Historical OHLC never invents an earlier fill.

**Lifecycle.** Setup detection is part of the closed-candle evaluation checklist;
it is not a separately tradeable published alert. The first public state is Entry
Pending. Trigger monitoring begins after publication; a personal study begins after
its enrolment transaction acquires the signal lock. Expiry is anchored to confirmation
plus three five-minute windows, capped at 15:00 IST. T1 records a milestone without
partial realisation; T2 exits the whole simulation. Adverse observed stop gaps and
configured slippage apply. Square-off uses the first covered observation at/after
15:20. A minute-based reconciliation job releases expired or end-of-session unresolved
studies without fabricating an exit or P&L.

**Versioning.** Operational settings are YAML. Evaluator thresholds and all scoring
weights live in frozen `VWAP_CONFIG`; its complete serialized value, costs, settings
and configured universe are hashed by `registerStrategy`. A weight change therefore
mints a new immutable version. Frozen factors/checklists/overlays belong to that
publication, not a recalculation in React. Changes to structural algorithms or
indicator conventions must also bump the strategy revision and update fixtures.

**History.** The worker warms 14 calendar days of 1m history at 08:50 IST, evaluates
at 2 and 17 seconds after five-minute boundaries, and rejects publication beyond
30 seconds. Normal market hours and authoritative market-open status are both
required; special sessions outside that window are suppressed. Five-minute reads use
Timescale `time_bucket` aligned to 09:15 IST and require all five distinct minutes.
Only 1m/1d candles are persisted. Stocks with a corporate action in the warm-up window
are conservatively withheld until it leaves the window; this implementation does not
publish from unadjusted history across such an action. Missing index volume is
`BENCHMARK_UNAVAILABLE`; no ETF substitution or invented volume is used.

**Costs.** The declared NSE cash intraday simulation uses version
`nse-cash-2026-09-12-v1`: brokerage 0.03% capped at ₹20 per side, sell-side STT
0.025%, exchange 0.0030699%, SEBI 0.0001%, IPFT 0.0000001%, buy-side stamp duty
0.003%, and 18% GST on brokerage/exchange/SEBI/IPFT. Each fee rounds upward to
integer paise; adverse slippage is two basis points per side, rounded to the tick.
Rates were checked against the [official charges list](https://fyers.in/charges-list/)
on 12 September 2026. These are declared research assumptions, not a broker bill.
Sizing includes estimated invalidation costs and full cash reservation without
leverage. A gap can exceed an estimated loss; no maximum-loss guarantee is made.

## Local validation

Final checks: **523 offline tests passed**, plus **8 local PostgreSQL integration
tests passed**. The 22 legacy external-database tests were skipped. Workspace
TypeScript checking, web production build and worker build passed. All changed
TypeScript/JSON files passed Biome. Repository-wide `pnpm lint` still reports
pre-existing tracker lint/format issues and one formatting issue in
`apps/worker/src/jobs/auth-maintenance.ts`; these are outside this feature.

Browser checks covered desktop cards at 1280px, the full-width detail sheet at
320px, mobile empty/stale views at 390px, light/dark themes, paused refresh,
recoverable API errors and interactive paper sizing. No horizontal page overflow
or browser console errors were observed in these checks. The mobile chart has its
own horizontal scroll area to keep labels readable.

The test suites cover mirrored fixtures, stale/incomplete/low-ADX/low-volume and
conflicting benchmark rejection, levels/score, lifecycle expiry/targets/stop/square-off,
slippage/costs/sizing, provider normalization, scanner suppression, API authentication
and request validation, and server-rendered loading/error/empty/stale card states.

Real PostgreSQL 17 tests use only an explicitly supplied localhost `*_test` database.
They exercise all ordinary migrations and actual locks, triggers and constraints,
including concurrent publication/enrolment, cross-user access, immutable evidence,
idempotency, daily limits across versions, filters/sorting, capital reservations,
missed-trigger suppression and deadline reconciliation.

The temporary PostgreSQL runtime lacks TimescaleDB. Its test migration runner omits
the extension/hypertable statements; it does not replace or fake `time_bucket`.
Consequently this verifies relational behavior, **not** Timescale aggregation or
compression. The legacy external Neon integration suites remain skipped. Automatic
approval review rejected creating an external test branch, so local PostgreSQL was
used instead. No production migrations, token refresh, or worker launch were performed.

Storybook review uses isolated synthetic fixtures, never production API responses.
Its cards, detail sheet and paper-study estimates can be reviewed without a live
market session. The ordinary page has no simulated fallback.

## Before live rollout

1. Apply the complete migration chain, including 0016, on an isolated PostgreSQL 17
   + TimescaleDB instance. Verify hypertable creation, session-aligned `getSignalBars`
   with a missing-minute case, and the compression policy on the installed license.
2. Verify the configured NIFTY 50 membership against the effective constituent list.
   The existing `config/indices.yaml` includes an unresolved Tata Motors seat comment;
   this feature preserves the existing universe rather than silently changing it.
3. During a normal session, validate NIFTY spot minute history for nonzero constituent
   volume, coverage, timing and VWAP convention; measure stock bar delivery under the
   shared account's actual request limits. Missing data must remain visibly unavailable.
4. Observe startup/restart and a full session through 15:20/15:30 with sampled quotes,
   checking the scanner's rejection reasons and immutable event history. Do not run
   a second credential-refreshing worker against the production account from a laptop.
5. Use the existing reviewed main-branch deployment process. This implementation does
   not merge, deploy or migrate production. `enabled` in the signal YAML controls the
   shared scanner; the page's pause control does not change that setting.
