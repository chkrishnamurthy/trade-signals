---
name: Screener and stock page on Dhan + Fyers + our data
status: built-on-branch
horizon: now
created: 2026-10-03
updated: 2026-10-03
area: [web, worker, db, core, providers, design]
blocked_by: [owner-review, deploy]
confidence: 4
summary: A full-market technical, flow and ownership screener, a stock page and a market-breadth page built only from Dhan, Fyers and data EquityWise already collects — no new vendor. Data spine, metric catalogue, UI/UX, data model, jobs, API, phases and mockups.
related: [company-research-implementation-plan.md, dhan-provider-plan.md, institutional-flow-plan.md, design-system-plan.md]
owner: krishna
---

# Screener & Stock Page on Dhan + Fyers + Our Data — V1 Plan

> Planning only; no code is authorized by this document.
>
> **Relationship to the company-research plan.** [company-research-implementation-plan.md](company-research-implementation-plan.md)
> remains the long-term plan, including fundamentals, licensing and AI. **This plan is the
> V1 the owner chose on 2026-10-03:** build everything that Dhan, Fyers and EquityWise's
> own data can support, and nothing that needs a new provider. Fundamentals (P/E, ROE,
> statements, market cap) stay out of V1 and are tracked in the company-research plan.

## 0. Implementation status (2026-10-03, branch `feat/stock-analysis`)

Built end to end, all five phases. Owner decisions taken before coding: **every
signed-in user** sees the three pages (signals stay admin-only); universe **NSE
EQ/BE/BZ**; bhavcopy bars count as closed the **same evening**; prices are
**split/bonus-adjusted, dividend-unadjusted**.

| Area | Where |
| --- | --- |
| Indicators (Stochastic, Bollinger, Supertrend), metric catalogue (95 keys), per-stock metrics, filter AST, breadth, corporate-action parser | `packages/core/src/indicators`, `packages/core/src/screener` |
| Schema + migration `0032_stock_analysis` (instrument_reference, index_memberships, screener_snapshots, screener_snapshot_builds, market_breadth_daily, saved_screens) and the SQL compiler | `packages/db/src/schema/screener.ts`, `packages/db/src/repositories/screener.ts` |
| NSE source (equity list, index files, bhavcopy bars, corporate actions) and jobs | `apps/worker/src/sources/nse-market.ts`, `apps/worker/src/jobs/stock-analysis.ts` |
| Screener API + page, presets | `apps/web/src/app/api/screener/*`, `apps/web/src/app/screener`, `config/screener-presets.yaml` |
| Stock page, market breadth, Discover navigation | `apps/web/src/app/stocks/[symbol]`, `apps/web/src/app/markets/breadth`, `apps/web/src/lib/navigation.ts` |
| Local real-data loader | `scripts/load-stock-analysis.ts` (refuses non-local hosts) |

**Deviations from the plan text below, and why:**

- **Ownership is promoter and public only.** NSE's shareholding summary carries no
  FII/DII split (the existing source returns null for both), so the FII/DII metrics
  and the "FII accumulation" preset were dropped rather than shown empty. A
  "promoter holding up two quarters running" preset replaces it.
- **Reference and classification share one table** (`instrument_reference`) instead
  of `instrument_reference` + `instrument_classifications`; industry comes from the
  NSE index constituent files (~750 stocks), the rest are "Unclassified".
- **The screener API is POST** (`/api/screener/run`, `/api/screener/counts`) because
  the filter is a tree; the page URL still carries it (`?f=` base64url, `?p=` preset).
- **Deal counts use a 4-week window** (labelled so), not "20 sessions".
- **Signals stay on the configured universe** (`config/indices.yaml`); indicators now
  cover every active equity, which also fills watchlist rows outside the old 56.

**Not built yet (follow-ups):** shareholding revisions/`numeric` storage (§3.5),
option-chain PCR/IV and the admin intraday snapshot (Phase 5 optional items),
relative strength vs a sector index (RS is vs Nifty 50 only, and needs NIFTY50 daily
bars from the provider path), and Storybook stories for the new components.

**Deploy notes:** the worker runs `backfill-stock-analysis` once on start (≈2 years
of bhavcopy files, paced; about half an hour) and then the nightly
`stock-analysis-eod` at 19:25/21:25 IST. Futures OI needs `MARKET_DATA_PROVIDER=routed`
(or `dhan`) in production to populate the F&O metrics. Data-display rights (§12) are
unchanged by this build: the pages are signed-in only.

## 1. Scope in one page

**V1 delivers three surfaces:**

1. **`/screener`** — multi-condition screening over the whole NSE equity universe
   (~2,000+ stocks): price, returns, trend, momentum, volatility, breakouts, patterns,
   relative strength, volume, delivery, F&O open-interest build-up, ownership, deals,
   events. Saved screens, presets, URL-shareable state, column picker, mobile layout.
2. **`/stocks/[symbol]`** — one stock in full: price and chart, technical summary,
   relative strength, delivery and deals, F&O panel, ownership trend, announcements,
   events, corporate actions, peers, and (admin-only) signals with their factors.
3. **`/markets/breadth`** — the market's internals: advance/decline, % above key
   averages, new highs vs lows, sector rotation, delivery and OI leaders.

**V1 does not deliver:** any fundamental metric (P/E, P/B, ROE, ROCE, EPS, revenue,
profit, margins, debt, dividend yield), market cap, financial statements, analyst
estimates, documents, AI summaries, public SEO pages, or real-time prices to other users.
Each of these needs a source this plan deliberately excludes (§15).

**Delivery estimate:** about 7–9 engineering weeks for one contributor (§13).

## 2. Data sources and what each contributes

| Source | Capabilities used | Limits that shape the design | Status in repo |
| --- | --- | --- | --- |
| **Dhan** | Daily history (all NSE equities and indices), intraday history, instrument master with ISIN, `POST /marketfeed/quote` (≤1,000 instruments per call), 5,000-symbol socket, derivatives history (futures OI) | Quote APIs 1 req/s; data APIs rate-limited per path (`packages/dhan/src/http.ts`); token minted nightly 01:35 IST | Adapter and client exist; futures-OI job exists (`ingest-futures-oi.ts`) but has never run in production (prod is `fyers` only) |
| **Fyers** | Fallback history and quotes, 200-symbol socket, symbol master | 10 req/s, 200/min, 100k/day; single session; display to third parties forbidden by its terms | Primary provider today |
| **NSE end-of-day files already ingested** | `sec_bhavdata_full` (OHLC, prev close, volume, turnover, trades, delivery for every EQ/BE/BZ stock), shareholding master, bulk/block deals, FII/DII flows, participant OI, announcements, IPO data | Best-effort public endpoints, monitored with `withFeedHealth`; one file per session | In production; bhavcopy rows for untracked symbols are currently discarded |
| **NSE public files to add** (same class as above) | `EQUITY_L.csv` (universe, ISIN, listing date, face value), corporate actions (splits/bonuses/consolidations with ex-dates), index constituent lists (membership; industry column for covered names) | Same policy as existing NSE files | New adapters |
| **EquityWise computed data** | Daily indicators, signals and factors, watchlists, market events, announcement interpretation | — | In production |

**Rule:** every source enters through an adapter that returns normalized domain types.
No Dhan, Fyers or NSE column name crosses into `packages/core`, the web app, or a DTO.

### 2.1 Provider routing for V1

Use `MARKET_DATA_PROVIDER=routed` in production (the intended shape in CLAUDE.md):

| Capability | Primary | Fallback |
| --- | --- | --- |
| Daily bars, full universe | **NSE bhavcopy** (new `DailyBarsSource`) | Dhan → Fyers |
| Daily backfill (2 years) | Dhan history | NSE bhavcopy archives → Fyers |
| Quotes for the stock page and intraday snapshot | Dhan (1,000 per call) | Fyers (50 per call) |
| Futures OI | Dhan derivatives history | — (panel shows unavailable) |
| Intraday bars for the stock-page chart | Fyers | Dhan |
| Instruments | NSE `EQUITY_L` + Dhan master (ISIN, provider refs) | Fyers master |

### 2.2 Request budget (daily, steady state)

| Job | Calls | Notes |
| --- | --- | --- |
| Bhavcopy | 1 file | Replaces ~2,000 per-symbol history calls |
| Futures OI | ~3 × 230 Dhan calls | Already sized in the existing job |
| Intraday snapshot (if enabled) | 2 Dhan quote calls per sweep | 2,000 stocks ÷ 1,000 per call; every 5 min = ~150 calls/day |
| Shareholding (quarterly season) | ~2,000 NSE calls spread over days | Gentle rate, resumable |
| Stock-page quote | 0 per page view | Pages read the DB; quotes come from the snapshot/fan-in |

One-off backfill: ~2,000 Dhan daily-history calls (two years each), checkpointed and
resumable, comfortably inside Dhan's data-API limits over an evening.

## 3. Data spine (must land before the screener)

### 3.1 Universe widening

- New `reference-universe-sync` job reads `EQUITY_L.csv` daily before the open and
  upserts `instruments` for series EQ/BE/BZ (SME series SM/ST behind a flag, §16).
- Adds listing date, series and face value (small `instrument_reference` table; §9).
- Instruments that leave the list become `active = false`, never deleted (no
  survivorship bias).
- `config/indices.yaml` stops defining the universe; it remains the headline-index and
  intraday-strategy configuration.

### 3.2 Full-universe daily bars from the bhavcopy

- New `DailyBarsSource` adapter parses `sec_bhavdata_full_DDMMYYYY.csv` once and returns
  normalized closed daily bars for every instrument. The existing delivery job and the
  new bars job share one download per session.
- **Closed-candle rule (hard rule 2):** the bhavcopy is the exchange's final published
  file for a completed session, so a bar sourced from it is closed by construction. This
  lets the evening snapshot screen *today's* session, unlike the provider path which
  treats a session as forming until the next IST date. This distinction must be reviewed
  against the `closed-candles` skill before implementation and recorded in the adapter.
- Bars are appended to `daily_candles` (append-only, hard rule 5); only `1d` is stored
  (hard rule 4).
- `cross-check-bars` compares a daily sample of bhavcopy bars with Dhan bars and alerts
  on divergence beyond tolerance.

### 3.3 Corporate-action adjustment (currently broken)

`corporate_actions` exists and is applied on read, but nothing writes it. Without this,
any split or bonus makes returns, EMAs, ATR and 52-week figures wrong.

- New `corporate-actions-sync` job reads NSE corporate actions daily and writes split,
  bonus and consolidation rows with exact `numeric` ratios and the source text.
- Dividends are stored as events; price adjustment for dividends is **off** in V1
  (documented choice — most Indian terminals show split/bonus-adjusted, dividend-unadjusted
  prices).
- Backfill two years of actions before the first indicator recompute.
- **Gap guard:** a >40% overnight move with no recorded action flags the instrument and
  nulls its history-dependent metrics until resolved, rather than screening wrong numbers.

### 3.4 Classification and index membership

- `index-membership-sync` reads index constituent lists (Nifty 50, Next 50, 100, 200,
  500, Midcap 150, Smallcap 250, Microcap 250, Total Market, sector indices) into
  `index_memberships` with effective dates.
- Industry comes from those lists where they carry it (~750 names via the broad lists);
  everything else is **"Unclassified"**, shown honestly — never guessed.
- Size buckets (Large/Mid/Small/Micro) come from index membership, not market cap,
  and are labelled "by index membership".

### 3.5 Ownership, F&O and intraday

- **Shareholding:** widen `ingestShareholding` from watchlisted symbols to the full
  universe; preserve revisions instead of overwriting; store percentages as `numeric`.
- **Futures OI:** enable the existing `ingest-futures-oi` job in production under
  `routed`; it already labels build-up (long build-up, short covering, short build-up,
  long unwinding) in core.
- **Intraday snapshot (optional, Phase 4):** every 5 minutes during market hours,
  two Dhan quote calls refresh last price, change, volume and day high/low for the whole
  universe into an `intraday_snapshots` table. Used by the admin view and, only once
  display rights exist, by users (§12).
- **Option chain (optional, Phase 4):** a Dhan option-chain adapter for F&O underlyings
  to derive put-call ratio and ATM implied volatility end-of-day. Verify Dhan's
  option-chain rate limit before sizing; skip if it cannot cover ~200 underlyings per
  evening.

## 4. Metric catalogue (V1)

Every metric has: key, label, unit, category, source, calculation (pure function in
`packages/core` with hand-computed fixtures), null rule, and freshness. Paise metrics
are integers; ratios/percentages are `numeric`.

### 4.1 Price & returns

| Key | Label | Unit | Calculation |
| --- | --- | --- | --- |
| `close` | Close | paise | Bhavcopy close |
| `change_pct` | Change % | % | vs previous close |
| `ret_1w` … `ret_1y` | 1W / 1M / 3M / 6M / 1Y return | % | Adjusted close vs N sessions ago (5/21/63/126/252) |
| `ret_ytd` | YTD return | % | vs last session of previous year |
| `gap_pct` | Gap % | % | Open vs previous close |
| `dist_52w_high`, `dist_52w_low` | From 52W high / low | % | Adjusted |
| `dist_ath` | From all-time high (in stored history) | % | Labelled with history start date |
| `range_pos_day` | Close in day's range | % | (close − low) ÷ (high − low) |

### 4.2 Trend

`close_vs_ema20/50/200`, `close_vs_sma20/50/200` (% distance and above/below flag),
`ema_stack` (bullish / bearish / mixed), `golden_cross_n` / `death_cross_n` (50/200
cross within N sessions), `supertrend_10_3` (direction + flip within N sessions),
`adx14` with `+di`/`−di`, `higher_highs_20` (structure flag).

### 4.3 Momentum

`rsi14`, `rsi14_cross` (above 50/60/70, below 40/30), `macd`, `macd_signal`,
`macd_hist`, `macd_cross_n`, `stoch_k14`, `stoch_d3`, `roc20`.

### 4.4 Volatility & range

`atr14` (paise), `atr_pct`, `bb_width20` and `bb_squeeze` (width at 6-month low),
`nr4`, `nr7`, `range_20_pct`, `volatility_20` (stdev of daily returns, annualised).

### 4.5 Breakouts & candlestick structure

`breakout_20d`, `breakout_52w`, `breakdown_20d`, `breakdown_52w` (close beyond prior
N-day high/low), `inside_bar`, `outside_bar`, `bullish_engulfing`,
`bearish_engulfing`, `hammer`, `shooting_star`, `doji`, `consolidation_n`
(range < X% for N sessions). Pattern labels describe price structure only — no
"buy/sell" wording.

### 4.6 Relative strength

`rs_vs_nifty_1m/3m/6m` (stock return − Nifty 50 return), `rs_rank` (percentile of
3M return across the universe, 1–99), `rs_vs_sector_3m` (vs the stock's sector index
when known), `rs_line_new_high` (RS line at 52-week high).

### 4.7 Volume & liquidity

`volume`, `avg_volume20`, `rel_volume` (volume ÷ 20-day average), `volume_spike`
(≥2×/3×/5×), `turnover` (paise), `avg_turnover20`, `trades`, `avg_trade_size`.

### 4.8 Delivery (NSE bhavcopy)

`delivery_pct`, `avg_delivery_pct20`, `delivery_vs_avg` (pp difference),
`delivery_spike` (≥1.5× average with rel_volume ≥ 1.5), `delivery_qty`.

### 4.9 F&O (Dhan; ~230 stocks with futures)

`fno_eligible`, `fut_oi`, `fut_oi_chg_pct`, `oi_buildup` (long build-up / short
covering / short build-up / long unwinding), `oi_buildup_streak` (sessions in the same
state), optional `pcr_oi` and `atm_iv` (Phase 4, option chain).

### 4.10 Ownership (NSE shareholding)

`promoter_pct`, `fii_pct`, `dii_pct`, `public_pct`, and QoQ change for each;
`promoter_change_streak` (quarters of consecutive increase/decrease). Always shown with
the quarter-end date.

### 4.11 Deals, flows & events

`bulk_deal_n`, `block_deal_n` (in last N sessions), `results_in_n` (board meeting for
results within N days), `exdate_in_n`, `announcement_n` (any announcement in last N
days, by category), `listed_days`, `ipo_recent` (listed within 12 months).

### 4.12 Classification & membership

`index_member` (multi-select), `industry`, `size_bucket` (by index), `series`.

### 4.13 Signals (admin-only)

`has_signal`, `signal_direction`, `signal_age` — visible only to admins, per CLAUDE.md;
the filter does not exist in a non-admin's catalogue response.

**Count:** ~95 filterable metrics in V1.

## 5. The screener

### 5.1 Filter model

```text
FilterNode =
  | { op: 'and' | 'or', children: FilterNode[] }        // max depth 3, ≤ 25 leaves
  | { metric: MetricKey, cmp: '>' | '>=' | '<' | '<=' | 'between' | 'is' | 'in',
      value: number | [number, number] | boolean | string | string[] }
```

- `MetricKey` is a closed enum generated from the catalogue; no user text reaches SQL.
- The AST type and a pure evaluator ("matched because …") live in `packages/core`; the
  SQL compiler lives in `packages/db`. The existing `screen()` 15-filter builder maps
  onto catalogue leaves and is retired once the compiler lands.
- Zod validates at the API boundary; the AST round-trips through the URL
  (`/screener?f=<compressed>`), so screens are shareable and back/forward work.
- **Comparisons between metrics** (e.g. `close > ema200`, `ema20 > ema50`) are a leaf
  variant `{ metric, cmp, rhsMetric }` limited to same-unit pairs.

### 5.2 Query engine

- A worker-built **wide `screener_snapshots`** table: one row per (session, instrument),
  typed nullable columns for every catalogue metric, industry, index keys and a build ID.
- A screen = one parameterised `WHERE` + sort + limit/offset + total count over ~2,000
  rows: a single indexed scan, target p95 < 150 ms.
- Snapshots are append-only per session, so **"screen as of a past date"** works for
  every session since collection started — and technical screens can be backfilled from
  candles for the full two-year history.
- A failed build leaves the previous session visible with a stale banner.

### 5.3 Presets (versioned YAML, neutral names)

| Group | Preset | Conditions (summary) |
| --- | --- | --- |
| Trend | Strong uptrend | EMA stack bullish, ADX > 25, RS rank > 70 |
| Trend | Pullback to 50 EMA in uptrend | EMA stack bullish, close within 2% of EMA50, RSI 40–55 |
| Breakout | 52-week high on volume | breakout_52w, rel_volume ≥ 2 |
| Breakout | Tight range, volume dry-up | nr7, bb_squeeze, rel_volume < 0.7 |
| Momentum | RSI crossing 60 | rsi14_cross 60 within 1 session, close > EMA50 |
| Momentum | MACD bullish cross above zero | macd_cross_n ≤ 3, macd > 0 |
| Volume | Delivery spike | delivery_spike, change_pct > 0 |
| Volume | Unusual volume | rel_volume ≥ 3, turnover ≥ ₹10 Cr |
| F&O | Long build-up | oi_buildup = long build-up, fut_oi_chg ≥ 5% |
| F&O | Short covering | oi_buildup = short covering |
| Ownership | Promoter holding up | promoter_pct QoQ > 0 |
| Ownership | FII accumulation | fii_pct QoQ ≥ 1 pp for 2 quarters |
| Weakness | Below 200 EMA, lower lows | close < EMA200, EMA stack bearish |
| Weakness | 52-week low breakdown | breakdown_52w, rel_volume ≥ 1.5 |
| Events | Results this week | results_in_n ≤ 7 |
| Events | Recent bulk/block deal | bulk_deal_n or block_deal_n within 5 sessions |

Presets are named by their conditions. Never "multibaggers", "undervalued", "buy now",
"top picks" or anything implying a recommendation.

### 5.4 Saved screens and "screen my watchlist"

- `saved_screens` per user (name, AST, columns, sort), owner-scoped like watchlists.
- Universe selector at the top of the builder: **All NSE · an index · one of my
  watchlists**. Screening inside a watchlist reuses existing owner-scoped tables.
- V2: daily digest of new matches for a saved screen (needs notification work).

### 5.5 Freshness and data honesty

- Every result set states the session screened: "Session Thu 2 Oct 2026 · built 19:42 IST".
- Per-column freshness where sources differ (shareholding quarter, OI session).
- Unavailable values render "—" with a reason on hover/tap, never `0`.
- A stock with a corporate-action gap flag is excluded from history-dependent filters
  and marked in results.

## 6. The stock page (`/stocks/[symbol]`)

Canonical lowercase URL; aliases and old symbols redirect. Server Component with a
composition service returning independent sections, each with
`available | stale | unavailable | error`, `asOf` and source.

| Section | Content | Source |
| --- | --- | --- |
| Header | Ticker, name, industry, index badges, close, change, session date, 52W range bar, watchlist button | Snapshot, instruments |
| Key stats strip | Volume vs average, delivery %, ATR %, RS rank, OI build-up (F&O), promoter % | Snapshot |
| Chart | Adjusted daily candles (1M–5Y), volume, EMA 20/50/200 toggles, corporate-action markers, intraday tab (Fyers/Dhan) | Candles, actions |
| Technical summary | Trend / momentum / volatility / structure cards with plain-language readings ("Price above all three EMAs") and the numbers behind them | Snapshot |
| Levels | 20-day and 52-week high/low, pivot levels, distance from each | Candles |
| Relative strength | RS line vs Nifty and sector index, 1M/3M/6M comparison | Candles |
| Delivery & deals | Delivery % bars vs price (60 sessions), bulk/block deal list | Delivery, deals |
| F&O | Futures OI vs price, build-up timeline, PCR/IV when available | Futures OI |
| Ownership | Promoter/FII/DII/public stacked bars over quarters, QoQ deltas | Shareholding |
| Announcements | Latest filings with interpretation tags and source links | Announcements |
| Events | Upcoming results, ex-dates, AGM; past corporate actions | Events, actions |
| Peers | Same industry or sector index, with the same technical columns | Classification |
| Signals (admin) | Active setups with factor breakdown | Signals |

No fundamental cards appear in V1, and no empty "coming soon" fundamentals placeholders —
the page is complete on its own terms.

## 7. Market breadth (`/markets/breadth`)

| Module | Content |
| --- | --- |
| Breadth summary | Advances / declines / unchanged, A/D ratio, % above EMA 20/50/200 — universe and Nifty 500 |
| Breadth trend | % above 200 EMA and A/D line over 1 year |
| New highs vs new lows | 52-week highs/lows count per session, with lists |
| Sector rotation | Heatmap of sector-index returns 1D/1W/1M/3M; RS of sector vs Nifty |
| Leaders | Top delivery spikes, top relative volume, OI build-up leaders |
| Institutional flow | Link-through to existing `/flows` |

Each module links into a pre-filled screener (e.g. clicking "312 new 52W highs" opens
`/screener` with `breakout_52w` applied).

## 8. UI / UX design

### 8.1 Information architecture

New navigation group **"Discover"** above "Market record":

```text
Tracking        Market Brief · My watchlists
Discover        Screener · Market breadth          ← new
Market record   Announcements · Market Calendar · Institutional Flow · IPOs
Account         Your profile
```

Stock pages are reached from screener rows, search, watchlists, announcements, flows and
IPO pages (listed IPOs), not from the navigation.

### 8.2 Screener layout

**Desktop (≥1280 px):** three regions.

1. **Top bar** — screen name (editable), universe selector, session/freshness pill,
   actions: Save, Save as, Share link, Reset.
2. **Left rail (320 px, collapsible)** — the builder:
   - Preset picker (grouped chips) and "My screens".
   - Condition groups: each row is `metric · operator · value` with a unit-aware input
     (%, ₹, ×, sessions), a live match count per condition, and a remove control.
   - "ALL of / ANY of" group toggles; "Add condition" opens a searchable metric picker
     grouped by category with one-line definitions.
3. **Results** — funnel strip ("2,031 → 846 → 212 → 38"), a sticky-header table with a
   frozen ticker column, sortable columns, density toggle, column picker (category tabs,
   drag to reorder), and bulk actions (add to watchlist, compare later). Row hover reveals
   a 60-session sparkline; click opens the stock page with a "Matched because …" banner.

**Tablet (768–1279 px):** builder becomes a collapsible panel above results.

**Mobile (<768 px):** results first. A sticky bottom bar shows "Filters (4) · Sort ·
Columns"; tapping opens a bottom sheet builder. Rows become two-line cards (ticker,
name, close, change, and two user-chosen metrics) with a horizontal-scroll mode for the
full table.

### 8.3 Stock page layout

- **Desktop:** header + key-stats strip full width; below, a two-column grid — chart and
  tabbed analysis (Technicals · Delivery & deals · F&O · Ownership · Announcements ·
  Events) on the left (8 cols), a sticky right rail (4 cols) with levels, 52W range, RS
  summary, upcoming events and peers.
- **Mobile:** header collapses to a compact sticky bar on scroll; key stats become a
  horizontally scrolling chip row; tabs become a segmented, scrollable tab bar; the right
  rail content moves below the chart.

### 8.4 Breadth page layout

A dashboard grid of compact modules (the `/ipos` dashboard pattern): breadth summary
tiles, a breadth trend chart, highs/lows bar chart, sector heatmap, leader tables.
Mobile stacks modules in priority order.

### 8.5 Components

Reuse: `AppShell`, `Sidebar`, `Topbar`, `DataTable`, `MetricCard`, `Numeric`,
`Sparkline`, `StockIdentity`, `MarketStatus`, `ChartContainer`, `states.tsx`, `Tabs`,
`Sheet`, `Popover`, `Select`, `Tooltip`, `Badge`, `ToggleGroup`.

New domain primitives (each with a Storybook story, both themes):

| Component | Purpose |
| --- | --- |
| `FilterRow` | metric · operator · value, unit-aware, live count, invalid state |
| `FilterGroup` | ALL/ANY container with nesting depth guard |
| `MetricPicker` | Searchable, categorised metric list with definitions |
| `PresetChips` | Grouped preset selector |
| `FunnelStrip` | Filter-impact counts |
| `FreshnessPill` | Session/as-of label with stale state |
| `RangeBar` | 52-week / day range with marker |
| `BuildupBadge` | OI build-up state (text + icon, not colour-only) |
| `DeliveryBars` | Delivery % columns with average line |
| `OwnershipStack` | Stacked quarterly ownership bars |
| `SectorHeatmap` | Returns heatmap with accessible table fallback |
| `MatchBanner` | "Matched because …" on the stock page |
| `ColumnPicker` | Category tabs, search, reorder |

### 8.6 Visual language

- Existing tokens only: `--bullish`/`--bearish` for direction, `--neutral` for flat,
  `--chart-*` for series, `--surface*` layering; Inter for UI and tabular figures,
  JetBrains Mono for technical readings, Bricolage Grotesque for headings.
- Direction is never colour-only: every change carries a sign and an arrow glyph.
- Numbers right-aligned with tabular figures; units in column headers, not cells.
- Light and dark themes verified in the running app at phone and desktop widths
  before any UI phase is called done.

### 8.7 Interaction details

- Live per-condition counts update debounced (300 ms) as values change.
- Keyboard: `/` focuses metric search, `Enter` adds, `⌘S` saves, arrow keys move rows.
- Empty result: show which condition eliminated the most stocks and offer to relax it.
- Loading: skeleton rows, never a blank table; errors keep the last good result visible.

### 8.8 Wording rules

Technical and neutral everywhere: "Above 200 EMA", "Long build-up", "Delivery spike",
"Promoter holding up 1.2 pp QoQ". Never "buy", "sell", "target", "undervalued",
"recommended", "position", "entry price". BUY/SELL appears only as a signal's direction
badge, and signals are admin-only.

## 9. Data model

| Table | Kind | Key columns |
| --- | --- | --- |
| `instruments` (existing) | widened | full universe; `active` flag kept |
| `instrument_reference` | new | instrument, series, listing date, face value (paise), source |
| `index_memberships` | new | instrument, index key, effective from/to, source |
| `instrument_classifications` | new | instrument, scheme, level, value, effective from, source |
| `corporate_actions` (existing) | now written | exact `numeric` ratio, ex-date, kind, source note |
| `daily_candles` (existing) | widened | bhavcopy as an additional source; append-only |
| `daily_indicators` (existing) | extended | add ADX, Supertrend, Stochastic, Bollinger, ROC columns (or move all to snapshots) |
| `delivery_stats` (existing) | widened | full universe |
| `shareholding_patterns` (existing) | revised | revisions preserved, `numeric` percentages, full universe |
| `derivative_oi_daily` (existing) | enabled in prod | — |
| `screener_snapshots` | new | PK (trading_date, instrument_id); typed column per metric; build_id |
| `screener_snapshot_builds` | new | calc versions, session, timings, row counts, failures |
| `breadth_daily` | new | session, universe key, advances, declines, % above EMAs, highs, lows |
| `saved_screens` | new, per user | owner_id, name, definition jsonb, columns jsonb, sort |
| `intraday_snapshots` | new, optional | session, instrument, observed_at, last, change, volume, high, low |

Money stays integer paise (`integer` for prices, `bigint` for turnover); timestamps are
`timestamptz` UTC; IST only at presentation.

## 10. Worker jobs and schedule (IST, trading days unless noted)

| Time | Job | Status |
| --- | --- | --- |
| 01:35 daily | Dhan token mint | existing |
| 06:35 daily | `market-calendar-sync` | existing |
| 06:45 | `ingest-futures-oi` (previous session) | existing, enable in prod |
| 08:30 | `reference-universe-sync` | new |
| 08:40 | `corporate-actions-sync` | new |
| Sat 07:00 | `index-membership-sync` | new |
| Sat 06:15 | `shareholding-sync` (full universe, resumable) | existing, widened |
| 09:15–15:30 every 5 min | `intraday-snapshot` | new, optional |
| 19:10 / 20:10 | `ingest-eod-bhavcopy` (bars + delivery from one file) | merges existing delivery job |
| after bhavcopy | `compute-indicators` (full universe) | existing, widened |
| after indicators | `screener-snapshot-build` + `breadth-build` | new |
| 18:50 / 19:45 | deals, FII/DII | existing |

All jobs use the existing overlap prevention, graceful shutdown, retry/backoff,
`withFeedHealth` and `ingestion_runs` bookkeeping. The provider-path daily ingest at
16:15 remains as fallback for instruments the bhavcopy misses.

## 11. API

```text
GET    /api/screener?f=<AST>&universe=<all|index:KEY|watchlist:ID>&sort=<metric:dir>&limit&offset&asOf
GET    /api/screener/metrics                 # catalogue (role-filtered: no signal metrics for non-admins)
GET    /api/screener/presets
GET    /api/screener/screens                 # caller's saved screens
POST   /api/screener/screens
PATCH  /api/screener/screens/[id]
DELETE /api/screener/screens/[id]
GET    /api/screener/count?f=<AST>           # live per-condition counts (debounced client)
GET    /api/markets/breadth?universe=&range=
GET    /api/stocks/[symbol]/chart?range=&interval=
```

The stock page itself is server-rendered from a composition service. Every route:
authenticated, Zod-validated, delegating to `apps/web/src/server`, the standard error
envelope, and no provider call on the request path.

## 12. Access, compliance and display rights

- All three surfaces are **signed-in only**. Signals remain **admin-only**.
- **Display rights:** building is unaffected, but showing Fyers- or Dhan-sourced prices
  to other users conflicts with Fyers' terms (and Dhan's must be checked). V1 therefore
  launches to the owner and invited testers. Before opening to general users, either
  obtain NSE's EOD display licence (₹1,00,000/yr per medium, 2026 tariff) — which also
  covers the bhavcopy-derived screener — or keep access invite-only. Intraday snapshot
  data stays admin-only until a delayed-data licence exists.
- Existing exposure to fix in the same decision: live watchlist quotes currently shown
  to every signed-in user.
- No advice language (§8.8); presets named by conditions; screens are user-defined tools.

## 13. Phases and estimates

| Phase | Scope | Estimate | Exit criteria |
| --- | --- | --- | --- |
| **0. Review** | Owner answers §16; closed-candle review of bhavcopy bars | 1–2 days | Decisions recorded |
| **1. Data spine** | Universe sync, bhavcopy bars source, two-year backfill, corporate actions + gap guard, index memberships/classification, full-universe shareholding, futures OI enabled | 2–2.5 weeks | Adjusted, cross-checked daily history and indicators for ~2,000 stocks |
| **2. Metrics & engine** | Catalogue, new indicators (ADX, Supertrend, Stochastic, Bollinger, patterns, RS), snapshot + breadth builds, AST + evaluator + compiler, API | 1.5–2 weeks | Screens over the full universe return in < 150 ms p95 with correct fixtures |
| **3. Screener UI** | Builder, results table, column picker, presets, saved screens, URL state, mobile sheet, nav group | 2 weeks | Owner can build, save, share and reopen screens on desktop and phone, both themes |
| **4. Stock page** | Composition service, header, chart, technicals, levels, RS, delivery/deals, F&O, ownership, announcements, events, peers, admin signals | 1.5–2 weeks | Every screener row opens a complete page |
| **5. Breadth + extras** | Breadth page; optional intraday snapshot (admin); optional option-chain PCR/IV | 1 week | Breadth modules link into pre-filled screens |

**Total:** about 7–9 engineering weeks. Phases 3 and 4 can overlap once Phase 2's API
contract is fixed.

## 14. Verification

- **Spine:** bhavcopy parser fixtures (series filter, holiday 404, malformed rows);
  cross-check vs Dhan within tolerance; corporate-action fixtures (split, bonus,
  consolidation, two actions in one window) matching hand-computed adjusted series;
  gap-guard fires on an unrecorded split.
- **Metrics:** every new indicator and pattern against independently hand-computed
  fixtures, including warm-up nulls (indicator-math discipline).
- **Engine:** AST validation (depth, leaf count, unknown metric, unit mismatch);
  compiler emits parameterised SQL only; evaluator and SQL agree on a randomised
  fixture universe; snapshot rebuild idempotent.
- **Web:** auth on every route; role-filtered catalogue; saved-screen owner isolation;
  stale-session labelling; "—" never "0"; no provider call during a request.
- **UI:** Storybook stories for each new component; QA in the running app at 375 px and
  1440 px, light and dark; keyboard and screen-reader pass on builder and table.
- **Performance:** snapshot build < 2 min for the universe; screen p95 < 150 ms;
  stock page TTFB < 500 ms from DB.

## 15. Explicitly not in this plan

| Not in V1 | Needs | Tracked in |
| --- | --- | --- |
| P/E, P/B, ROE, ROCE, EPS, revenue, profit, margins, debt, dividend yield | A fundamentals source (XBRL parsing, Upstox, NSE corporate data or a vendor) | company-research plan §5, §6 |
| Market cap and cap-based size | Shares outstanding | company-research plan §4.2 |
| Financial statements, documents, peers by fundamentals | Fundamentals source | company-research plan |
| Real-time prices to users | NSE display licence | company-research plan §2.2 |
| Analyst estimates, AI summaries, public SEO | Licences / counsel / LLM pipeline | company-research plan |
| BSE-only stocks | Multi-exchange branch | multi-exchange work |

Free extension worth noting for later: parsing NSE **XBRL** shareholding and results
filings (public, same class as the bhavcopy) would add shares outstanding (market cap),
quarterly EPS (P/E) and revenue/profit without any vendor. It is excluded from V1 only to
keep scope tight.

## 16. Decisions for the owner

| Decision | Recommendation |
| --- | --- |
| Universe | NSE EQ/BE/BZ now; SME (SM/ST) behind a filter later |
| Navigation | New "Discover" group with Screener and Market breadth |
| Launch audience | Owner + invited testers until the display-rights decision |
| Intraday snapshot | Build in Phase 5 as admin-only |
| Option chain PCR/IV | Phase 5, only if Dhan's limits allow an evening sweep |
| Dividend adjustment | Off (split/bonus-adjusted, dividend-unadjusted) |
| Bhavcopy bars as closed same evening | Approve, after the closed-candle review |

## 17. Mockups

Interactive mockups of the screener (desktop and mobile), the stock page and the
market-breadth page, built on the EquityWise design tokens, accompany this plan. They
use illustrative sample data only.
