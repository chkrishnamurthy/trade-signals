---
name: /signals page (VWAP)
status: superseded
horizon: none
created: 2026-09-12
updated: 2026-09-17
superseded_by: intraday-strategy-dhan-plan
area: [web, core]
summary: Design history of the removed /signals page (Confirmed VWAP Trend Pullback).
owner: krishna
---

# Intraday Signals — prompt assessment and proposed build

Status: **Implemented locally; live rollout validation remains.**
The user approved proceeding with the plan, cards, visible strategy names, a private
paper journal, and prospective trigger observations. See [implementation notes](signals-implementation.md)
for the current source map, verification results and operational differences. The
original assessment below is retained as design history; its pre-build inventory is
not a description of the current tree. Storybook fixtures are explicitly simulated.

## Recommendation

Build `/signals` inside the existing app, in the stages below. This is one new
product page, but it requires a new intraday data pipeline, strategy evaluator,
durable lifecycle, and personal paper journal. Treating it as a frontend-only
change would produce an attractive screen without trustworthy signals.

Keep the supplied strategy and its numerical thresholds as the starting specification.
The two product decisions below were adopted for implementation. Benchmark validation
is enforced at runtime and remains a required live rollout check.

### Confirmed design requirements

- **Signal cards on desktop, tablet and mobile.** This supersedes the original
  prompt's desktop signal table. Use a responsive grid, with one column on mobile.
- Display **Confirmed VWAP Trend Pullback** in the page heading, on every signal
  card and in the selected signal's details. Store strategy ID/version separately
  from its human-readable name so historical signals retain their identity.
- Every card exposes symbol/company, BUY/SELL with arrow, signal time, lifecycle,
  data freshness, LTP, trigger, invalidation, both targets, R, quality, RVOL and ADX.
  A quality control opens the evidence breakdown; an Inspect action opens details.
  Keep filtering, URL state, sorting and pagination independent of the presentation.

### Adopted decisions and remaining live integration validation

1. **Paper research scope.** The prompt requests capital/risk sizing and a paper-trade
   form; `AGENTS.md` currently excludes order-shaped forms and uses technical-level
   vocabulary. Proposed: a private **paper journal**, with explicit simulated-share
   sizing, no broker connection, and labels such as “Trigger level” and “Invalidation
   level.” The mockup previews that adaptation. If accepted, update only the relevant
   product-scope/vocabulary paragraphs when this feature lands. Alternatives: retain
   signal-level outcome tracking only, or adopt the prompt's literal paper-trade wording.
2. **Trigger versus simulated fill.** The prompt specifies a stop-style trigger beyond
   the confirmation high/low and a three-bar pending window; the repository says fill
   at the next candle's open. These are different models. Proposed for fidelity to the
   prompt: preserve the published trigger, simulate a fill only from observations
   after publication/enrolment, and persist the actual simulated fill separately.
   This requires an explicit revision to the next-open rule, while retaining the
   closed-candle/no-lookahead rule. Alternative: keep next-open fills and revise the
   prompt's pending/trigger behavior. Do not implement a silent hybrid.
3. **NIFTY confirmation — integration validation.** FYERS documents derived index
   volume calculated from constituent trading volume, usable for VWAP. Its community
   response directs API consumers to History for index volume, rather than WebSocket.
   Proposed first choice: use NIFTY spot history with that documented volume basis;
   validate nonzero, complete, timely minute data and compare our five-minute VWAP
   against the same timeframe/source convention. Persist `volumeBasis` in evidence
   and explain “NIFTY VWAP · constituent volume” in details. An ETF proxy is a fallback
   requiring a separate strategy decision, not a presumed necessity. Until validation
   succeeds, use `BENCHMARK_UNAVAILABLE` when appropriate. This corrects the earlier
   assumption that lack of volume in index quotes would also block historical VWAP.

## Can FYERS support this plan?

**Yes for the planned data-backed scanner, charts and paper-research system, with
the integration work below.** FYERS supplies observations; our pure engine, worker,
database and UI supply the indicators, strategy, explanations, lifecycle and paper
accounting. This is documented capability, not a completed live account test.

| Need | FYERS capability / implementation responsibility |
| --- | --- |
| Stock OHLCV and warm-up | History offers minute candles; ingest 1m, validate completeness, derive closed 5m bars in our database. |
| Live price and spread | Quotes/depth and market-data WebSocket expose price/bid/ask observations. Extend the existing normalized mappings; do not infer a spread from candle range. |
| NIFTY VWAP | Use constituent-derived index volume from History after validating its data and latency; no assumption that index WebSocket volume is present. |
| EMA9/21, ADX14, ATR14, RVOL, opening range | Compute in our pure core from verified candles. FYERS need not provide precomputed indicator endpoints. |
| Signal cards, explanations, filters, chart, statuses | Our application implements these using the shared persisted feed and immutable evidence. |
| Paper sizing, costs, outcomes, performance | Our application simulates and records these; no real account trading endpoints are needed. Cost configuration is versioned independently of market-data delivery. |

Sources checked 12 September 2026:
[FYERS market-data reference](https://github.com/FyersDev/fyers-skills/blob/master/skills/fyers-trading/references/market-data.md),
[FYERS market-data socket reference](https://github.com/FyersDev/fyers-skills/blob/master/skills/fyers-trading/references/websocket.md),
[FYERS index-volume explanation](https://support.fyers.in/portal/en/kb/articles/can-i-track-volume-on-indices-in-fyers),
[index volume through History API](https://fyers.in/community/t/index-volume-in-tickbytick-feed/13638).

The stock-feed protocol, timestamps, reconnect gaps and history publication latency
must pass an account-level probe. `apps/worker/src/context.ts` currently supplies no
`createTransport`, so its provider advertises streaming as false: socket helpers exist,
but the live transport is not wired. Build this inside the provider packages and
enable it through the composition root; never describe the current worker as streaming.

Historical candles cannot reconstruct past bid/ask spreads or the exact ordering of
intrabar touches. Record live observations going forward for these checks; mark older
replays unavailable/approximate where the evidence is missing. A connected quote feed
is not proof of an exhaustive exchange trade tape. The 30-second bar-availability and
15-second quote-age thresholds remain targets to measure, not FYERS service guarantees.
Paper fills are simulations with declared assumptions, not broker-confirmed fills.

## What the current application actually contains

Source code takes precedence over old planning prose and skills. Several skill
examples still reference deleted engines and Clerk; neither describes today's app.

| Concern | Verified source | Reuse / required work |
| --- | --- | --- |
| Runtime and routing | `package.json`, `apps/web/package.json`, `apps/web/src/app/watchlists/page.tsx` | pnpm 10.33.2, Node >=24, Next 15 App Router, React 19, strict TypeScript. The root instructions' Node 22 line is stale. `/signals` does not exist. |
| App frame | `apps/web/src/components/layout/app-shell.tsx`, `page.tsx`, `apps/web/src/lib/navigation.ts` | Reuse AppShell, PageContainer/Header/Title/Content; add one navigation entry at implementation. Do not replace navigation or layout. |
| Visual language | `apps/web/src/app/globals.css`, `docs/design-system/tokens.md`, `apps/web/src/app/layout.tsx` | Existing semantic teal/graphite palettes, Inter, JetBrains Mono, compact spacing, theme-aware surfaces. No new design system. |
| Cards and panels | `components/ui/card.tsx`, `sheet.tsx`, `dialog.tsx`, `badge.tsx`, `components/forms/filter-bar.tsx` | Reuse Card and detail/form primitives. Use a responsive card grid on all screens, a toolbar sort control and server pagination. Add a keyboard-accessible Inspect button to every card. |
| Chart | `apps/web/src/components/watchlists/chart.tsx`, `components/charts/chart-container.tsx` | Current chart is a custom SVG close/volume chart, not a candlestick library. Reuse the container/legend, add a dedicated candle renderer; leave watchlist chart behavior intact. No library needed for a bounded session of 75 five-minute bars. |
| Client state | `apps/web/src/lib/feed.ts`, `use-watchlists.ts`, `api-routes.ts`, `session-guard.ts` | Existing React hooks, fetch, AbortController, visibility-aware polling, retry hints, Feed union. No React Query/SWR/Redux dependency to reuse or introduce. Add response validation rather than copy unchecked payload casts. |
| Authentication | `apps/web/src/middleware.ts`, `server/auth/require-user.ts`, `server/watchlists.ts` | First-party sessions. Middleware only checks cookie presence; use the authoritative `getSessionUser()` check in Node server code. Paper data and watchlist filters must be scoped to that user. |
| Provider | `packages/market-data/src/provider.ts`, `types.ts`; `packages/providers-fyers/src/adapter.ts` | Existing fetchBars/fetchQuotes/market status/optional ticks. Preserve this interface and adapter; do not add the prompt's competing provider abstraction. |
| Data limitations | `packages/market-data/src/types.ts`, `packages/fyers/src/quotes.ts` | Normalized Quote/Tick lack bid/ask. Raw quote parsing knows bid/ask but the normalized quote drops them. Extend through the adapter with nullable paise values, timestamp/provenance and capabilities. Unknown spread cannot pass a required gate. |
| Reusable math | `packages/core/src/indicators/{vwap,adx,atr,moving-average}.ts`, `intraday-indicators.test.ts` | Session VWAP, ADX, ATR, SMA-seeded EMA remain. Build strategy-specific opening range, volume baseline, trend/pullback/confirmation, score and lifecycle around them. |
| Worker | `apps/worker/src/index.ts`, `scheduler.ts`, `context.ts`, `universe.ts` | Credential, daily ingestion, daily indicators, auth maintenance only. No minute ingestion or intraday scanner is scheduled. Reuse context, scheduling, overlap prevention and structured logging. |
| Candle storage | `packages/db/src/schema/candles.ts`, `repositories/candles.ts` | Daily storage remains. Migration 0012 dropped minute storage; migration 0016 now restores it. Add append-only minute ingestion and session-aligned five-minute reads with completeness checks. |
| Old intraday storage | `packages/db/src/schema/intraday.ts`, `repositories/intraday-signals.ts`, migrations | The old intraday schema/repository were removed. The implementation creates dedicated VWAP signal, event, observation and journal tables; it does not restore the removed engine. |
| Universe | `config/indices.yaml`, `apps/worker/src/universe.ts` | Reuse configured `nifty50` constituents/sector metadata. Validate membership before calling this the current NIFTY 50; the YAML explicitly flags an unresolved Tata Motors index seat. Snapshot the accepted universe per session. |
| Checks | `vitest.config.ts`, package scripts, `apps/web/.storybook` | Vitest in Node includes `.test.ts`/`.spec.ts`, not browser `.tsx` tests. Storybook and a11y addon are installed. Browser interaction checks need a deliberate runner; do not claim component coverage from Node tests. |

## Strategy specification to freeze in versioned config

These are proposed engineering definitions, not claims that the strategy is profitable.
The supplied hard thresholds remain: ADX >=22, RVOL >=1.2, extension <=2.5 ATR,
touch distance <=0.15%, pullback depth <=1.2 ATR, confirmation body >=50%,
confirmation volume >=1.2x previous-20 mean, stop buffer 0.10 ATR, maximum risk
1.2 ATR, targets 1.5R/2R, quality >=70.

### Time, warm-up and completeness

- Bar timestamps identify **opens**. At evaluation time `asOf`, accept only bars with
  `openTime + 5 minutes <= asOf`, and require all five distinct expected minute bars
  per bucket. Missing, duplicate, invalid or out-of-session minutes never become a
  synthetic flat candle. Expected overnight/weekend gaps are not missing session data.
- Derive five-minute OHLCV with `time_bucket` anchored to 09:15 IST; persist only 1m
  and 1d candles. Inject time/session boundaries into pure functions.
- Normal NSE equity hours are 09:15–15:30 IST. Opening range is `[09:15,09:30)`;
  create signals only after the range is complete and before 15:00. Evaluate both
  the confirmation close and publication time against the cutoff. Use authoritative
  session status and a session calendar for holidays, halts and special sessions.
  [Source: NSE market timings](https://www.nseindia.com/static/market-data/market-timings).
- Proposed warm-up: continuous prior-session five-minute history for EMA/ADX/ATR;
  VWAP and opening range reset each session. EMA9 first emits at index 8, EMA21 at
  20, ATR14 at 14, ADX14 at 27 for a valid nondegenerate series. Null still blocks.
  Fetch a stable history prefix of at least 250 closed bars, record the seed/window
  policy, and use the same policy on replay; a rolling seed must not rewrite earlier
  decisions. Reset VWAP slope comparisons at the session boundary as well.
- Proposed RVOL: confirmation volume / mean volume of the preceding 20 closed bars,
  excluding itself, using the same warmed historical session sequence. This overlaps
  the confirmation-volume gate intentionally. A time-of-day volume baseline would be
  a different strategy version. Zero/missing denominator is unavailable, never 1.0.
- Proposed operational limits to review: quote/spread age <=15 seconds; completed
  five-minute bucket available within 30 seconds of its close; no late publication
  after that window; at most two published signals per stock/session. Benchmark bars
  must be aligned to the exact decision bar. Thresholds belong in YAML, not components.

### Ordered trend → pullback → confirmation

- A trend must be valid on a preceding completed bar before a pullback starts.
  Proposed EMA21 slope comparison: current EMA21 against three bars earlier, matching
  the explicit three-bar VWAP slope lookback. Require trend gates again at confirmation.
- Proposed pullback duration: 1–3 closed bars; confirmation is a distinct subsequent
  bar. All are within the same session. Expire a candidate when it exceeds this window.
- Long touch: a pullback low is within 15 basis points of that bar's VWAP or EMA21;
  short uses the high. A deep penetration is not automatically a touch.
- Proposed depth anchor: high of the last valid trend bar minus the minimum pullback
  low (short: maximum pullback high minus that bar's low), bounded by 1.2 times ATR
  frozen at pullback start. Require a positive depth.
- Define “materially below both” as a close below each line by more than 0.10 times
  that frozen ATR; invert for short. Any such bar invalidates the candidate.
- Confirmation compares only with the immediately preceding closed candle's high/low.
  Reject zero range. Use ATR at confirmation for published stop buffer and risk limits.
  All short rules, including touch/depth/stop limits, mirror the long rules.

### Levels, reward and score

- Every money field is an integer with a `Paise` suffix; index points use the existing
  hundredths representation and are displayed as index levels, not currency. Use the
  shared paise formatter for UI. Ratios may remain fractional; do not store rupee floats.
- Resolve tick size from current instrument metadata. Proposed trigger buffer: one
  instrument tick. Round long trigger up/short trigger down, long invalidation down/
  short invalidation up. Reject nonpositive risk and risk over 1.2 ATR after rounding.
  Round targets in the favorable direction so gross minimum R is not reduced by ticks.
- A target defined as exactly 1.5R **already satisfies** gross reward/risk >=1.5 by
  construction. Do not present that gate as independent evidence. Show gross and
  cost-adjusted R separately. Requiring net T1 R >=1.5 with a gross 1.5R target would
  reject essentially every nonzero-cost setup; review a net threshold explicitly.
- All mandatory checks are gates. A high score cannot compensate for a failed gate.
  Binary category scoring would give every eligible setup 100, so the prompt does not
  yet define a usable quality ranking. Proposed graded rubric below totals exactly 100;
  keep all earned/max values and measurements in the persisted evidence.

| Factor | Maximum | Proposed scoring for an otherwise eligible setup |
| --- | --- | --- |
| VWAP and EMA trend | 25 | 20 for all trend gates, +5 if both absolute three-bar slopes >=0.03% |
| Pullback quality | 20 | 12 for valid sequence, +4 for depth <=0.8 ATR, +4 for touch distance <=0.05% |
| Confirmation | 15 | 10 for all confirmation gates, +5 for body/range >=0.65 |
| Relative volume | 15 | 8 at >=1.2, 12 at >=1.5, 15 at >=2.0 |
| NIFTY alignment | 10 | 10 for the approved benchmark rule; missing/conflicting benchmark rejects |
| ADX strength | 10 | 5 at >=22, 8 at >=25, 10 at >=30 |
| Liquidity/spread | 5 | 3 for liquidity gate and spread <=limit, +2 for spread <=half limit |

The minimum eligible score under this proposal is 68; the >=70 gate therefore has
an effect. Scores 85–100 are “High quality,” 70–84 “Valid”; rejected evaluations
stay out of the published signal feed. The mockup's illustrative breakdown is not
evidence that its drawn candles passed this rubric.

Liquidity needs a definition independent of index membership. Proposed starting
gate for review: preceding 20 closed sessions' mean turnover >=₹25 crore, using
documented candle-derived turnover as an estimate, plus valid two-sided spread
<=10 basis points. Require complete daily history. These are configurable research
assumptions, not verified trading-cost or liquidity guarantees.

## Lifecycle and paper accounting

Keep shared signal state and a user's paper study separate. A private journal action
must never mark the global signal active or alter another user's data.

| State | Meaning / exit |
| --- | --- |
| Setup detected | Internal candidate; not published as an actionable signal |
| Entry pending | Published after closed confirmation; begins expiry clock |
| Active | Trigger observed after publication; personal studies require enrolment before their own fill |
| Target 1 hit | Milestone, still nonterminal; original levels remain immutable |
| Target 2 hit / Stop-loss hit | Terminal; release the stock's active-signal slot |
| Expired | Three scheduled five-minute intervals elapse without activation; also expire pending setups at session cutoff |
| Invalidated | Premise breaks, delivery was missed, or risk/levels cannot be used before activation |
| Squared off | Proposed research cutoff 15:20 IST; terminal only when a valid observation supports a simulated close |

Expiry at exactly the third close happens after considering eligible observations
strictly inside the three-bar window. Missing data does not extend the wall-clock
window, but also cannot prove whether a fill happened: mark resolution unavailable,
reconcile gaps, then record the supported result. Do not invent a terminal P&L.

- Store immutable generatedAt, publishedAt, confirmation interval, trigger, original
  stop/targets, initial risk, strategy version and condition/indicator snapshots.
  Store deliveredAt for a personal journal/feed acknowledgement when relevant.
- On every transition append an event with event ID, sequence, effective time,
  recorded time, observation reference and reason; transactionally update a mutable
  current-state projection. Enforce append-only events and frozen snapshot fields
  in the database, not only TypeScript.
- First T1: proposed default is no partial realization, optional stop-to-fill-price
  enabled from the next observable interval. T2 closes the entire remaining study.
  “Breakeven” refers to price; after costs it can still be a net loss. Partial T1 exits
  would require a separately approved allocation/rounding model.
- With ordered ticks, use actual observation ordering. With OHLC-only replay, stop
  wins if stop and target share a bar; do not assume a target preceded a fill in the
  activation bar. Use finer complete observations or mark ambiguous activation
  unavailable. Gap-through fills use the worse observable price plus configured
  slippage; if the premise or risk limit is already invalid, reject activation.
- Latest LTP alone cannot prove that the trigger was never crossed during delivery.
  Require continuous observations covering confirmation close through publication;
  suppress missed/unknown delivery windows. After a restart, reconcile state before
  publishing anything new. Never backdate user fills into an already active signal.
- A user can add a study only while entry is pending. Revalidate the immutable signal,
  freshness, expiry and ownership server-side; never trust submitted levels or shares.
- Capital input is decimal text converted exactly to integer paise; risk is integer
  basis points. `riskBudgetPaise = floor(capitalPaise * riskBps / 10000)`.
  Start with `floor(riskBudgetPaise / riskPerSharePaise)`, cap by unreserved capital
  (no leverage), then reduce to satisfy worst-case loss including versioned fees and
  slippage. Validate safe integer products or use bigint intermediates. Reserve
  capital atomically across concurrent studies; zero shares is an explained rejection.
- Costs must have explicit source/effective date and a config hash. Handle both legs,
  fixed/capped charges and directional taxes as applicable; do not paste stale flat
  rates from the old removed engine. The preview leaves costs/net outcomes unavailable.
- Record unique `(userId, signalId)` and a scoped idempotency key/request hash;
  duplicate/retried POSTs cannot double-book capital. Different users can follow the
  same shared setup. Never accept `userId` from the browser.

## Page and API design

Header: Intraday Signals / Confirmed VWAP Trend Pullback; NSE phase, IST clock,
source mode, last data timestamp, paper badge, scanner status, refresh. Distinguish
market closed, data missing and scanner paused. A successful HTTP response is not
proof of a live feed. Keep source mode separate from stale/unknown quality flags.

Scanner runs once for the shared universe. Proposed user's pause control pauses
**their view refresh**, visibly labelled as such; it cannot stop the shared worker.
Global scanner status is read-only here. A literal global Running/Paused toggle from
the prompt needs an additional admin-only operations decision, not a public user control.

Use compact market context plus active/pending/target/stop counts. Keep global signal
outcomes separate from **Your paper performance**, including its own denominator.
The signal feed uses cards on every screen: two or three columns when space permits,
one on mobile. Each card visibly names the strategy and keeps all requested readings
accessible. A toolbar sort control replaces sortable column headings. No dependence
on color alone. New cards get a subtle static accent. A wide detail sheet contains technical levels,
candles, overlays, generation marker, all required/actual checklist values, score
breakdown and timeline. Mobile sheet fills available width with 44px touch targets.
The chart's post-signal observations are visibly separate from frozen decision evidence.

Performance includes total/active/closed, wins/losses/breakeven, closed sample size,
win rate, average win/loss, expectancy in net R, profit factor, net paise P&L and
maximum intraday drawdown. Compute return rates over resolved personal studies only;
expired unfilled signals are not losses. Define drawdown over the timestamped equity
curve (realized + marked open studies, net estimated costs); disclose unavailable
marks. Zero sample/zero-loss denominator yields `null` and a label, not 0%/Infinity.
Global T1/T2 are distinct milestones: combined “target hits” counts distinct signals,
not two wins for one setup. Display completed signals at the bottom of this same page.

Always display the supplied disclaimer:

> Signals are generated using predefined technical rules for educational and research purposes. They are not guaranteed to be profitable and are not investment advice.

Proposed endpoints, all protected, Node runtime, no-store, validated input **and** output:

| Endpoint | Contract |
| --- | --- |
| `GET /api/signals` | symbol, owned watchlistId, direction, state/group, sector, minimumScore, UTC from/to, page/pageSize (max 100), allowlisted sortBy/sortDirection. Default today's IST session; stable ID tie-break. Include total, snapshot revision, source/freshness and scanner coverage. |
| `GET /api/signals/[id]` | Frozen evidence, event history, bounded persisted chart observations/overlays. No engine/provider calls on read. |
| `GET /api/signals/summary` | One session snapshot; separately named global signal counts and current-user paper summary. Summary scope is explicit and does not accidentally reflect only the current page. |
| `POST /api/paper-trades` | Signal ID, capitalPaise/riskBps and idempotency key. Server resolves current user and recalculates. Creates only a private paper record. |

Keep filters/sort/page/selected signal in validated URL search parameters where useful;
debounce symbol search, reset pagination when filters change, support browser Back,
abort superseded requests and reject old responses. Share one snapshot revision
between feed/counts or disclose changing totals. Honor 429 retry hints.

Error envelope remains `{error, code, remedy?, retryAfterSeconds?}`. Reuse `ok`,
`parseBody`, `jsonError` conventions. Do not reuse watchlist `handle()` unchanged:
it maps all unique violations to “watchlist name exists,” which is wrong for signals.
Return domain-specific conflicts and keep the existing cookie-clearing behavior.
Use same-origin/CSRF checks for paper mutations following auth patterns.

## Storage and pipeline proposal

`provider → worker minute ingestion → persisted closed 5m aggregation → pure evaluator
→ transaction (signal + evidence + events + scan status) → read API → React`

- New intraday jobs run after five-minute closes with measured ingestion lag and
  use the existing provider/context. Publication has no dependency on open browsers.
  Worker lifecycle processing continues while users pause their views.
- Budget the 50 equities plus benchmark/proxy history and quote polling together with
  the existing web/worker usage. Existing in-memory limiters do not coordinate across
  separate processes. Stagger history calls, batch quotes, persist shared snapshots,
  respect backoff/circuit state and report scanned/skipped/failed coverage. Do not
  multiply upstream scans by the number of signed-in users.
- Proposed separate versioned signal tables in `schema/vwap-signals.ts`, evidence,
  append-only events and scanner-run/quote snapshots, plus private paper records and
  ledger/events in `schema/paper-trades.ts`. Reuse `strategy_versions`, instruments
  and candle tables. Audit the full applied migration chain before generating SQL.
- Keep legacy `intraday_signals` and its watchlist reader intact initially. Reusing
  it blindly would change old state CHECKs and watchlist interpretations. Integrating
  new signals into watchlist columns is a separate scope decision, not part of this page.
- Enforce one live record per instrument/session for this scanner with a partial unique
  index spanning pending/active/T1 states; unique setup identity includes strategy
  version, instrument, session, direction and confirmation timestamp. The strategy
  version must not allow bypassing the one-stock limit. Serialize daily-limit checks
  and state changes in the same transaction, with event sequence checks on retry.
- Retain immutable audit evidence when the current projection changes; do not mutate
  candles, strategy versions or historical published levels. No new service or queue.

NIFTY is a free-float market-capitalization index. A VWAP using its index levels and
FYERS' constituent-derived volume is a documented analytical construction, not an
average execution price for spot-index trades. Preserve that meaning in strategy
evidence. [Source: NIFTY Indices](https://www.niftyindices.com/indices/equity/broad-based-indices/nifty--50).

## Implementation stages and review criteria

1. **This review:** signal cards and visible strategy names are confirmed. Agree on
   paper journal scope, fill semantics and proposed quantitative/operational defaults;
   validate FYERS index-volume integration. Prototype interactions
   are local only; no API, scanner, paper persistence or performance claim.
2. **Deterministic strategy:** add `packages/core/src/strategies/vwap-pullback/` with
   config, typed inputs/outputs, ordered setup state, levels, rubric and explanations.
   Reuse indicators unchanged unless separately reviewed. Add mirrored, independently
   calculated BUY/SELL fixtures. Gate: exact evidence and no-lookahead tests pass.
3. **Persistence and worker:** add minute repository/aggregation, provider fields,
   migrations/repositories, scanner/lifecycle jobs and validated
   `config/vwap-trend-pullback.yaml`. Gate: real-Postgres constraints, retries and
   restart reconciliation tested; data-mode/coverage verified before any live label.
4. **Page integration:** new `app/signals/page.tsx`, focused `components/signals/*`,
   `lib/use-signals.ts`/DTOs/filter model, `server/signals*`, four endpoint groups,
   and one navigation entry. Reuse existing components. Add private noindex metadata;
   do not expose signals through public sitemap/SEO routes. Gate: responsive,
   accessible states and authenticated read contracts verified.
5. **Personal paper journal:** pure sizing/cost/accounting functions, owned records,
   idempotent mutation, simulated lifecycle and performance aggregation. Gate: no
   retrospective fills, no cross-user data, costs and drawdown reconcile to events.
6. **Validation and release preparation:** complete checks below, review local UI and
   replay outcomes, then review the implementation diff. Deployment is a later action;
   this review neither merges to main nor runs the worker against production.

## Verification required for the actual implementation

- Indicator fixture provenance, exact first non-null indices, zero-volume VWAP,
  session reset, gap handling and ascending/deduplicated bar preconditions.
- BUY/SELL sequences, thresholds at equality and just outside, incomplete candle,
  missing minute, low ADX/volume, benchmark conflict/unavailability, opening range,
  final-30-minute cutoff, publication latency, stale spread and unknown tick size.
- Future append/truncation invariance, deterministic repeated evaluation, no array
  access beyond the decision index, and no fill before publication/enrolment.
- Independent arithmetic for tick rounding, gross/net R, every score component,
  cost bounds, integer sizing and capital reservation. Do not generate expected
  indicator outputs by calling the implementation under test.
- Pending expiry, T1/T2/stop, ambiguous OHLC, gap-through activation, breakeven timing,
  end-of-day close with/without data, event immutability and restart replay.
- Real-Postgres concurrent duplicate publication, daily limits, event ordering,
  retry idempotency, concurrent paper creation and ownership/CSRF isolation. Mocked
  SQL tests cannot prove unique indexes/triggers. Report skipped integration tests.
- URL parse/roundtrip/back navigation, server filtering/sorting before pagination,
  stable ties, stale-response races, snapshot counts and sample denominators.
- Storybook/browser: loading, refresh, empty, filtered empty, error, stale, paused,
  closed/unknown session; mouse/keyboard drawer, focus return/Escape, mobile cards,
  chart overlay/marker labels, light/dark contrast and 320/768/1440px layouts.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and the relevant
  Storybook/browser checks after implementation. Do not report these as completed
  for a plan/mockup-only change. Avoid starting the credential-refreshing worker or
  touching the shared production database during local validation.

## Review deliverables and limitations

This change adds the plan and its planning-index entry. The accompanying inline
mockup uses the application's visual language and supports filters, details,
simulated paper sizing and preview states; it is intentionally outside the production
route tree. It does not establish strategy validity, benchmark availability, live
data connectivity or actual results. Review notes can change the plan before any
production implementation is started.

The preview is selective: it uses an expanding detail panel for in-conversation
inspection; production will use the existing accessible Sheet. Its cards show
the strategy and signal readings, and the chart shows representative candles/VWAP/EMAs
and technical levels. Opening-range overlays, persisted URL state,
pagination and completed-paper accounting belong to the implementation stages above.

Review-package verification completed: JavaScript syntax and unique IDs; BUY/SELL
filtering and filtered-empty reset; detail/chart/checklist navigation; sizing of
₹1,00,000 at 0.5% risk with ₹10/share risk (50 shares, ₹75,025 required, ₹500
pre-cost risk), invalid zero-capital rejection, and the explicitly local saved-state
preview. Browser checks covered 320px/390px mobile cards and 1024px desktop, light
and dark appearance, and no captured console errors. No application test suite,
typecheck or production build was run for these documentation/preview-only changes.

Follow-up revision: replaced the signal table with cards on every screen and made
the strategy name visible in the page, every card and details. Verified five card
strategy labels, quality sorting, SELL filtering, detail navigation, a two-column
1024px view and single-column 320px view with no card overflow. Checked both themes
and captured no browser console errors. FYERS feasibility above is based on current
documentation and inspected code; authenticated live feed probes remain to be done.
