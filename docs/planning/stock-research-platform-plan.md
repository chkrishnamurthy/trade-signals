---
name: Stock research platform
status: draft
horizon: later
created: 2026-09-07
updated: 2026-09-07
board: EW-052
area: [web, db]
blocked_by: [market-data-scaling-plan, dhan-provider-plan]
confidence: 1
summary: Stock screener + stock detail/analysis platform — UX architecture, wireframes, data model and roadmap (deliverables A–G).
owner: krishna
---

# EquityWise — Stock Screener + Stock Detail/Analysis Platform

> **Status:** Plan. Nothing here is implemented. This is the architecture and roadmap
> document requested before any code is written. It answers deliverables **A–G**
> (UX architecture, wireframes, component architecture, design-system requirements,
> data model, roadmap) and grounds every recommendation in an audit of the *actual*
> EquityWise codebase as it stands on 2026-09-07.
>
> **Companion visual:** a diagram-rich HTML artifact accompanies this document for
> at-a-glance understanding of the system, data flow, page IA, and roadmap.

---

## 0. The one finding that shapes everything

Before designing screens, I audited the codebase against the vision. **The single
most important fact:**

> **EquityWise today is a price / candle / technical-indicator system. It has
> NO fundamentals data domain of any kind.**

Concretely, from the audit:

- **Database** (`packages/db/src/schema`) contains: `instruments`, `corporate_actions`,
  `ingestion_runs`, `daily_candles`, `daily_indicators`, `provider_credentials`,
  `signals` / `signal_factors` / `strategy_versions`, `intraday_signals`, `watchlists`,
  and the `auth` tables. **There is no table for income statements, balance sheets,
  cash flows, quarterly results, shareholding, financial ratios, peers, announcements,
  or concalls.**
- **The data provider interface** `MarketDataProvider`
  (`packages/market-data/src/provider.ts`) exposes only `listInstruments`,
  `fetchQuotes`, `fetchBars`, `fetchMarketStatus`, `streamTicks`. **Fyers is a
  market-data (OHLCV) provider. It does not supply fundamentals.** No method returns
  a revenue figure, a shareholding pattern, or a filing.
- `daily_indicators` holds *technical* indicators (EMA, RSI, MACD, ATR, relative
  volume, 52w high/low). It does **not** hold P/E, ROE, ROCE, D/E, margins, or any
  fundamental ratio — those require statements the app doesn't ingest.

**Implication:** Screener.in's entire reason for existing (deep fundamental financials
+ ratios + history) rests on a data domain EquityWise must **build from zero** — new
external data source(s), a new provider abstraction, new tables, new pure-core
calculators, and new ingestion jobs. This is the true weight of the project. The UI is
the visible half; the fundamentals data pipeline is the larger, harder half, and it
gates everything downstream (screener filters, comparisons, insights, "what changed").

This document therefore treats **the fundamentals data spine as MVP work item #1**,
not an afterthought, and structures the roadmap so the UI is never built on data that
does not exist yet.

---

## 1. What already exists (audit — reuse, don't rebuild)

The prompt (§34) is explicit: *inspect the existing project, reuse infrastructure, do
not introduce a new library when one already solves the problem.* Here is the ground
truth.

### 1.1 Stack (as built)

| Concern | Reality | Verdict |
| :-- | :-- | :-- |
| Framework | Next.js 15 App Router, React 19 | Reuse. |
| Language | TypeScript strict, `noUncheckedIndexedAccess` | Reuse. |
| Monorepo | pnpm workspaces: `apps/web`, `apps/worker`, `packages/{core,db,fyers,market-data,providers-fyers,shared}` | Extend, don't restructure. |
| Styling | Tailwind **v4** (CSS-first, no config file), OKLCH token layer in `globals.css`, CVA + `cn()`, Radix primitives, `lucide-react` | Reuse. **World-class already** — see §1.2. |
| DB | Neon/self-hosted Postgres 17 + TimescaleDB, Drizzle ORM, append-only candle rules | Extend with new tables. |
| Charts | one `ChartContainer` primitive + `--chart-1..5` token ramp | Extend (needs financial chart types). |
| Storybook | SB9 + `nextjs-vite` installed; stories colocated; both-theme toggle | Reuse as the component workbench. |
| Scheduler | croner in `apps/worker`; write boundary = only worker writes derived data | Extend with fundamentals jobs. |
| Auth | first-party sessions, per-user data isolation via repositories | Reuse for saved screens/follows. |
| Money | **integer paise everywhere**, `formatPaise()` at the render boundary | Hard rule — extend to fundamentals. |

### 1.2 The design system is already strong — build on it

`docs/planning/design-system-plan.md` documents (and the audit confirms) a mature
system: a single OKLCH token source in `globals.css`, a **financial 4-slot colour
convention** (`bullish`/`bearish`/`neutral` × accent/strong/soft/line), a directional
`tone.ts` authority that always pairs colour with a `▲/▼/→` glyph (colour-blind safe),
tabular `figure` figures for price alignment, one `Button`, one focus treatment, and a
full states set (empty / error / **data-unavailable** / loading). **Raw hex in
components: zero.**

Two assets matter enormously for this project:

1. **The `data-unavailable` state already distinguishes "no data" from "possibly-wrong
   data."** This is exactly the financial-correctness discipline the vision's §36
   demands ("show unavailable data rather than guessing"). It generalises directly to
   missing fundamentals cells.
2. **`MetricCard` uses the slot pattern** (`value` is a slot; the card knows nothing
   about paise/percent/crore). This is the correct base for the vision's `MetricCard` /
   metric-intelligence components.

**We do not build a new design system. We extend this one** with the financial-research
component layer (§5) and a small set of new tokens.

### 1.3 Component layers already named (from the DS plan)

```
Layer 0  Foundations   tokens (globals.css), Text, tone.ts, cn, icons
Layer 1  Primitives    ui/* (24): button, input, select, dialog, popover, tabs, table, ...
Layer 2  Domain        market/* , data-display/* , charts/*  (Numeric, Sparkline, MetricCard, DataTable, ChartContainer, states)
Layer 3  Feature       watchlists/*, forms/*, auth/*, profile/*
Layer 4  Shell         layout/* (AppShell, Topbar, Sidebar, Page, Grid) + route pages
```

The new work slots cleanly into this: **new Layer-2 financial primitives** (metric
intelligence, financial table, peer table, filter builder) and **new Layer-3 features**
(`stock-detail/*`, `screener/*`), assembled by **new Layer-4 routes** (`/stocks/[symbol]`,
`/screener`).

### 1.4 Constraints from CLAUDE.md that bind this work

- **Broker independence.** No Fyers type may leak above the adapter. A *fundamentals*
  provider must follow the same boundary: a `FundamentalsProvider` interface, adapters
  behind it, nothing Screener-specific or vendor-specific above the adapter.
- **`packages/core` is pure.** All ratio/CAGR/margin/valuation math is deterministic,
  data-in → result-out, no DB / no `Date.now()` / no env. This is what lets the same
  calculators run in ingestion, in tests against hand-computed fixtures, and (later) in
  screening.
- **Integer paise for money.** Revenue, profit, cash, debt — all paise (or a documented
  larger integer unit for crore-scale sums; see §6.4). Never float money.
- **TIMESTAMPTZ UTC**, IST only at the boundary. Fiscal periods stored explicitly.
- **Only the worker writes derived data.** `apps/web` reads; ingestion + computed
  metrics are written by `apps/worker`.
- **No order execution, ever.** BUY/SELL only ever labels a signal's *direction*.
  The research platform must keep this: no "buy" affordance, valuation labels are
  "expensive / cheap vs history", never "buy now".
- **Do not present AI opinion as fact** (vision §5, §36). Enforced by a
  `DataSourceBadge` provenance component (§5) distinguishing Data / Calculated /
  Rules-based / AI.
- **Current product scope is "watchlists only"** per CLAUDE.md — the dashboard,
  all-stocks, and old screener pages were *removed*. This project is therefore a
  deliberate, planned **scope expansion**, and the roadmap (§8) sequences it so the
  data spine lands before the surfaces that need it. This must be confirmed with the
  owner as an explicit product-direction decision (see §9 open questions).

---

## 2. Data architecture — the layered spine (deliverable F, part 1)

The vision's §35 mandates strict separation of layers, with the AI **never** doing
fundamental calculation. This maps onto the existing "pure core + worker writes +
web reads" architecture as follows.

```
  EXTERNAL SOURCES                (new — no source exists today)
    fundamentals data vendor(s) · filings · shareholding · corporate announcements
        │
        ▼  ingested by apps/worker, parsed + validated with Zod at the boundary
  ┌─────────────────────────────────────────────────────────────────────┐
  │  L1  RAW / NORMALIZED FINANCIAL DATA        (new DB tables)           │
  │      income_statements · balance_sheets · cash_flows (annual+quarter) │
  │      shareholding_patterns · corporate_announcements · company_meta   │
  │      + existing daily_candles / instruments / corporate_actions       │
  └─────────────────────────────────────────────────────────────────────┘
        │  pure functions in packages/core  (deterministic, tested)
  ┌─────────────────────────────────────────────────────────────────────┐
  │  L2  CALCULATED METRICS                                                │
  │      ratios (ROE, ROCE, ROA, D/E, margins, interest cover, PE, PB,    │
  │      EV/EBITDA, PEG, FCF yield) · CAGR (3/5/10Y) · TTM roll-ups       │
  └─────────────────────────────────────────────────────────────────────┘
        │
  ┌─────────────────────────────────────────────────────────────────────┐
  │  L3  HISTORICAL AGGREGATIONS                                           │
  │      5Y/10Y averages, highs, lows, percentile-of-own-history          │
  └─────────────────────────────────────────────────────────────────────┘
        │
  ┌─────────────────────────────────────────────────────────────────────┐
  │  L4  PEER / INDUSTRY BENCHMARKS                                        │
  │      sector & industry medians, peer percentiles, peer sets           │
  └─────────────────────────────────────────────────────────────────────┘
        │
  ┌─────────────────────────────────────────────────────────────────────┐
  │  L5  RULES-BASED INSIGHTS   (deterministic, traceable to L1–L4 cells) │
  │      "ROCE declined from 13.2%→10.5%"  · "P/E 22% above 5Y avg"       │
  └─────────────────────────────────────────────────────────────────────┘
        │
  ┌─────────────────────────────────────────────────────────────────────┐
  │  L6  AI EXPLANATION LAYER  (narration ONLY; consumes L1–L5, invents   │
  │      no numbers; every claim cites a source cell; clearly labelled)   │
  └─────────────────────────────────────────────────────────────────────┘
        │
        ▼
       L7  UI  (apps/web) — reads precomputed L1–L6, never recomputes fundamentals
```

**Design rules that fall out of this:**

1. **L2–L5 are pure and precomputed by the worker**, stored in a `computed_metrics` /
   `metric_snapshots` table so the UI does one indexed read — exactly the pattern
   `daily_indicators` already uses for technicals ("one indexed scan versus 500
   recomputations"). The screener queries this table.
2. **L5 insights are rules, not prose generation.** Each insight is a row/record with:
   a rule id, the L1–L4 cells it read, the computed delta, and a severity
   (`positive` / `caution` / `negative`). The *sentence* is a template. This makes
   every insight traceable and clickable back to its evidence (vision §6, §9, §25).
3. **L6 (AI) is optional, additive, and last.** It narrates L5; it is fed structured
   numbers and told to cite them; it is gated behind a `DataSourceBadge` reading
   "AI-generated". It is **never** in the calculation path. (Roadmap V2.)
4. **Provenance is a first-class field.** Every displayed value carries where it came
   from: `source` (vendor + as-of date), `layer` (data / calculated / rule / AI). The
   UI renders it via `DataSourceBadge`. This is how §36 ("distinguish estimated,
   show periods, source attribution") is honoured mechanically, not by hope.

---

## 3. UX architecture (deliverable A)

### 3.1 Product surfaces and how the user moves between them

```
                         ┌──────────────┐
                         │   SCREENER   │  discover: filters, NL query, presets
                         │  /screener   │  results table → select rows
                         └──────┬───────┘
             "why matched?" ▲   │ open stock            ▲ save / run
                            │   ▼                       │
   ┌──────────────┐   ┌─────────────────┐   ┌───────────────────┐
   │  WATCHLIST   │◀─▶│  STOCK DETAIL   │◀─▶│    COMPARE        │
   │ /watchlists  │add│ /stocks/[symbol]│   │ /compare?ids=...  │
   └──────────────┘   └────────┬────────┘   └───────────────────┘
        (exists)               │ find similar / screen similar
                               ▼
                        ┌──────────────┐
                        │ SAVED SCREENS│  monitor, alerts (V2/V3)
                        └──────────────┘
```

Four core flows the design must make frictionless:

- **Discover → Understand:** Screener result row → Stock Detail, arriving with a
  "Why this matched" banner tying the detail page back to the screen's conditions (§25).
- **Understand → Verify:** every insight/score is clickable and jumps (sticky-nav
  scroll) to the underlying financial table; every metric has an info popover with
  definition + history + peer context (§10). *Interpretation first, evidence one click
  away.*
- **Understand → Compare:** "Compare" / "Find similar" from the header → Compare view
  preloaded with peers.
- **Any → Monitor:** "Follow" / "Add to watchlist" from header or screener; saved
  screens with (later) alerts.

### 3.2 Progressive disclosure model (the core UX principle, vision §2 & §33)

Every important metric supports **four levels**, revealed progressively so beginners and
analysts share one product:

```
 L1 value        ROE  10.2%
 L2 trend        ↓ from 13.4% (5Y avg)              ← shown inline, compact
 L3 comparison   Industry median 14.8%              ← shown inline where space allows
 L4 interpretation ⚠ Below industry average         ← popover / expanded row
                  "ROE has declined 3 years, now below industry median."
```

- **Default view** shows L1 + a compact L2/L3 hint.
- **Info popover** (`MetricInfoPopover`) shows definition + L2 + L3 + L4 + "Learn more".
- **Advanced disclosure** (DuPont, percentile distribution, full history chart) lives
  behind an "Advanced" toggle within a section, never in the default flow.

### 3.3 States (reuse the existing `states.tsx` discipline)

Every section renders one of: **loaded · loading (skeleton) · empty · data-unavailable
(known missing, not an error) · error**. A financial UI must never render a blank where
a number should be — `data-unavailable` with the reason is mandatory (vision §36).

### 3.4 Interaction inventory

Sticky section nav (scroll-spy); collapsible sections (persisted per user);
period selectors (3Y/5Y/10Y/TTM, Annual/Quarterly); column customiser; metric info
popovers; score-breakdown drill-down; insight → section jump; peer picker;
filter builder (AND/OR/nested); NL-screen review-before-apply; save/run/duplicate screen.

---

## 4. Wireframes (deliverables B & C)

### 4.1 Desktop — Stock Detail (`/stocks/[symbol]`)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ AppShell topbar: search ⌘K · theme · user                                          │
├────────────┬───────────────────────────────────────────────────────────────────── ┤
│ STICKY     │  ┌── STOCK HEADER ───────────────────────────────────────────────┐   │
│ SECTION    │  │ Tata Power   TATAPOWER · NSE · BSE      ₹368.00  ▲ +1.24%      │   │
│ NAV        │  │ Power Gen · Transmission · Distribution   Large Cap · upd 3:30 │   │
│            │  │ [Follow] [+ Watchlist] [Compare] [Find similar] [Screen similar]│  │
│ Snapshot   │  │ MktCap 1.17L Cr | P/E 30.2 | ROE 10.2% | ROCE 10.5% | D/E 1.72 │   │
│ Insights   │  └───────────────────────────────────────────────────────────────┘   │
│ What chg?  │  ┌── INVESTMENT SNAPSHOT (6 score bars, click → breakdown) ───────┐   │
│ Price      │  │ Growth ███████░ Strong   Profitability █████░ Moderate  ...    │   │
│ Business   │  └───────────────────────────────────────────────────────────────┘   │
│ ─Financials│  ┌── KEY INSIGHTS ──────────────┐ ┌── WHAT CHANGED? (latest Q) ──┐   │
│ P&L        │  │ 🟢 Rev CAGR 12.4% (5Y)        │ │ Revenue 12,420→13,180 +6.1%  │   │
│ Balance    │  │ 🟠 Debt +6.4% YoY             │ │ EBITDA margin 18.2→19.4 +120b│   │
│ Cash Flow  │  │ 🔴 ROCE 13.2%→10.5%           │ │ PAT 920→810 −12.0%  [Why?]   │   │
│ Ratios     │  │ [View all insights →]         │ │ "Margins up, higher finance  │   │
│ ─Analysis  │  └──────────────────────────────┘ │  cost cut net profit."       │   │
│ Growth     │                                    └──────────────────────────────┘   │
│ Profitab.  │  ┌── PRICE & TECHNICAL (reuses ChartContainer + daily_indicators)─┐   │
│ Health     │  │ [1M 6M 1Y 5Y MAX]  candles/line · 52w range bar · RSI/EMA tags │   │
│ Valuation  │  └───────────────────────────────────────────────────────────────┘   │
│ ─Compare   │  ┌── PROFIT & LOSS ─────────────────────────────────────────────┐    │
│ Peers      │  │ KEY FINDINGS: 🟢 Rev CAGR 12.4% · 🟢 margin +190bps · 🟠 ...  │    │
│ Similar    │  │ [Annual|Quarterly] [3Y 5Y 10Y TTM]        [Customize cols ⚙]  │    │
│ ─Ownership │  │            FY22  FY23  FY24  FY25  FY26  TTM   (horiz-scroll)  │    │
│ Sharehold. │  │ Sales      ...   ...   ...   ...   ...   ...   ⓘ per-row info  │    │
│ Segments   │  │ EBITDA     ...                                 sparkline col   │    │
│ ─Discl.    │  │ PAT / EPS  ...                                                 │    │
│ News       │  └───────────────────────────────────────────────────────────────┘   │
│ Concalls   │  ┌── BALANCE SHEET ┐ ┌ CASH FLOW ┐ ┌ RATIOS ┐  (same table pattern)   │
│ Documents  │  ...  Growth · Profitability(DuPont adv) · Health · Valuation(hist)    │
│ Ask AI     │  ┌── PEER COMPARISON (peer picker + highlighted matrix + note) ──┐    │
│            │  ┌── SHAREHOLDING (stacked-area trend + Δ callouts) ────────────┐     │
│ [scroll-   │  ┌── SEGMENTS ┐ ┌ NEWS/EVENTS ┐ ┌ CONCALLS ┐ ┌ DOCUMENTS ┐           │
│  spy]      │  ┌── ASK ABOUT THIS STOCK (suggested Qs; answers cite data) ────┐     │
└────────────┴────────────────────────────────────────────────────────────────────── ┘
```

Layout: **left sticky section rail** (scroll-spy, collapsible groups), **main column**
of stacked sections. Two-up cards where they pair naturally (Insights ↔ What Changed).
Tables scroll horizontally inside their own `overflow-x:auto` shell; the page body never
scrolls sideways.

### 4.2 Desktop — Screener (`/screener`)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  SCREENER                                    [My screens ▾] [Save] [Run]            │
├───────────────────────────────┬───────────────────────────────────────────────────┤
│ FILTER BUILDER (left panel)    │  RESULTS                                           │
│ ┌ NL: "large-cap ROE>20% low ┐ │  Showing 74 of 4,862   [Customize columns ⚙]      │
│ │  debt, profit growth>15%"  │ │  ┌ FILTER IMPACT (funnel) ─────────────────┐      │
│ │  → "I understood as…"      │ │  │ All 4,862 → MktCap>5kCr 1,240 → ROE>15%  │      │
│ │  [Apply] [Edit]            │ │  │ 438 → P/E<25 127 → D/E<0.5 74            │      │
│ └────────────────────────────┘ │  └──────────────────────────────────────────┘     │
│ ALL of:                        │  ☐ Co.    Price  MktCap  P/E  ROE  RevGr  D/E ...  │
│   ROE        [>] [15 %]  ⓧ     │  ☐ ...    sortable · search-in-results · virtual   │
│   Rev CAGR   [>] [15 %]  ⓧ     │  ☐ ...    row → Stock Detail (with match banner)   │
│   P/E        [<] [25  ]  ⓧ     │                                                    │
│ ANY of:  (nested group)        │  [Compare selected] [Add to watchlist] [Export]    │
│   D/E        [<] [0.5 ]  ⓧ     │                                                    │
│   Int cover  [>] [5   ]  ⓧ     │                                                    │
│ [+ Add filter ▾ by category]   │                                                    │
└───────────────────────────────┴───────────────────────────────────────────────────┘
```

### 4.3 Mobile (intentional, not a shrink — vision §31)

Mobile is **not** the desktop scaled down. Key transforms:

```
STOCK DETAIL (mobile)                    SCREENER (mobile)
┌───────────────────────────┐            ┌───────────────────────────┐
│ ‹ Tata Power    ₹368 ▲1.2%│ sticky     │ Screener        [Run 74]  │
│ TATAPOWER·NSE   Large Cap │ mini-header │ ┌ NL search ─────────────┐│
├───────────────────────────┤            │ └────────────────────────┘│
│ [Snapshot▾][Fin▾][Peers▾] │ section     │ Active: ROE>15 ⓧ RevGr>15ⓧ│ chips
│  tab/accordion selector    │ chips      │ [+ Add filter]  (bottom   │
├───────────────────────────┤            │                  sheet)   │
│ Snapshot scores (stacked)  │            ├───────────────────────────┤
│ Key insights (list)        │            │ Results (cards, not grid) │
│ What changed (list)        │            │ ┌ TATAPOWER  ₹368 ▲1.2% ┐ │
│ ── P&L ──                  │            │ │ P/E 30 · ROE 10 · ...  │ │
│ table scrolls → horizontally│           │ └────────────────────────┘│
│ metric tap → bottom sheet  │ (info)     │  [Filters ⚙ bottom sheet] │
└───────────────────────────┘            └───────────────────────────┘
```

Mobile priorities: sticky mini-header with price; sections as accordion + a jump chip
bar; financial tables keep their table shape but scroll horizontally (never reflow into
cards — a P&L is a matrix); **metric info + filters open as bottom sheets** (reuse the
existing `Sheet` primitive); screener results become **cards**, not a dense grid.

---

## 5. Component architecture & design-system requirements (deliverables D & E)

New components slot into the existing layer model (§1.3). **Every one is a Storybook
candidate** (both themes, all states) — the DS plan's workflow (§10 of that doc) applies
verbatim: build in Storybook first, tokens only, story per state, axe-clean.

### 5.1 Layer 2 — new domain primitives (reusable, financial, paise-aware)

| Component | Role | Notes / reuses |
| :-- | :-- | :-- |
| `MetricValue` | one metric: value + optional L2 trend + L3 compare inline | extends existing `market/numeric` |
| `MetricInfoPopover` | definition + L2 + L3 + L4 + learn-more | reuses `Popover`; content = 4-level model |
| `MetricTrend` | ↑/↓ vs baseline with `tone.ts` glyph | reuses `tone.ts` |
| `MetricComparison` | current vs 5Y/10Y avg/high/low, industry, percentile | pure display of L3 data |
| `HistoricalComparison` | mini distribution / range bar (e.g. P/E vs its band) | new small chart |
| `FinancialTable` | dense period×line-item matrix, sticky first col, sparkline col, per-row info, horiz-scroll | extends `data-display/data-table`; `figure` figures |
| `FinancialTableHeader` | period + Annual/Quarterly + column customiser | reuses `ToggleGroup`, `Select` |
| `PeriodSelector` | 3Y/5Y/10Y/TTM · Annual/Quarterly | reuses `ToggleGroup` |
| `KeyFindings` | the "interpretation first" strip above a table | list of `InsightChip` |
| `InsightCard` / `InsightList` | 🟢🟠🔴 insight, clickable → section, traceable | reuses `Alert`/`Badge` tones |
| `ScoreBar` / `ScoreBreakdown` | snapshot score bar + drill-down of factors | **must** show components (never a mystery number — CLAUDE.md rule) |
| `HealthIndicator` | 🟢/🟠/🔴 status w/ glyph + label | reuses `tone.ts` |
| `WhatChangedRow` | before→after + delta + "Why?" | composes `MetricValue` |
| `PeerComparisonTable` | company×metric matrix, best/worst highlight, peer picker | extends `FinancialTable` |
| `MatchExplanation` | "why this stock matched" ✓/≈ conditions | screener↔detail bridge |
| `DataSourceBadge` | provenance: Data / Calculated / Rule / AI + as-of date | **enforces §36 / no-AI-as-fact** |
| `ChartContainer` (extend) | add valuation-band, stacked-area (shareholding), bar/line financial series | extends existing `charts/*` |

### 5.2 Layer 3 — new feature composites

- `stock-detail/*`: `StockHeader`, `InvestmentSnapshot`, `KeyInsightsPanel`,
  `WhatChangedPanel`, `PriceTechnicalPanel`, `BusinessOverview`, `PnlSection`,
  `BalanceSheetSection`, `CashFlowSection`, `RatiosSection`, `GrowthSection`,
  `ProfitabilitySection` (+ DuPont advanced), `FinancialHealthSection`,
  `ValuationSection`, `PeerComparisonSection`, `ShareholdingSection`, `SegmentSection`,
  `NewsEventsSection`, `ConcallsSection`, `DocumentsSection`, `AskAboutStock`,
  `SectionNav` (scroll-spy).
- `screener/*`: `FilterBuilder`, `FilterGroup`, `FilterCondition`, `MetricSelector`,
  `FilterChip`, `NaturalLanguageBar`, `FilterImpactFunnel`, `ScreenResultTable`,
  `ColumnPicker`, `ScreenPresetCard`, `SavedScreensPanel`.
- `compare/*`: `CompareBuilder`, `CompareMatrix`, `FindSimilarPanel`.

### 5.3 Layer 4 — routes

`/screener`, `/stocks/[symbol]`, `/compare`, `/screens` (saved). All assemble Layer 3;
no new styling originates here. `AppShell`/`Sidebar` gain nav entries.

### 5.4 New design tokens required (additive only)

The existing tokens cover almost everything. Additions:

- **Score/quality ramp** — a neutral-to-strong scale for the snapshot bars that is
  *not* bullish/bearish (a score isn't directional). Propose `--score-1..5` or reuse
  the sequential logic; sign-off needed (tokens are "the constitution" per DS plan).
- **Provenance/labelling** — muted styles for `DataSourceBadge` (reuse `muted` + `info`).
- Everything else (surfaces, financial 4-slot, status, chart ramp, micro type sizes
  `text-2xs/3xs`, radius, shadow) **already exists** and is reused unchanged.

### 5.5 Formatting authority (must be centralized, vision §30)

Extend `packages/shared` with the single source for number/percent/currency/crore
formatting and positive/negative rendering, consumed by every component — mirroring how
`formatPaise()` already centralizes money. No component formats a number ad hoc.

---

## 6. Data model (deliverable F, part 2)

New Drizzle tables (in `packages/db/src/schema`), following existing conventions
(integer money, TIMESTAMPTZ UTC, explicit provenance, append-only where it is history).

### 6.1 Company metadata (extends, doesn't duplicate, `instruments`)

`company_profiles` — 1:1 with an equity `instrument`: sector, industry, business
description, listing details, market-cap category, website, management. (`instruments`
stays the tradeable-universe table; this is the fundamentals-side profile.)

### 6.2 Financial statements (raw / normalized — L1)

Period-keyed, one row per statement per fiscal period. Money as integers (§6.4).

- `income_statements` (`instrument_id`, `period_type` ∈ {annual, quarter}, `fiscal_period`
  e.g. `FY24`/`Q1FY25`, `period_end` date, revenue, other_income, expenses, ebitda,
  depreciation, interest, pbt, tax, pat, eps, `source`, `as_of`, `is_estimated`)
- `balance_sheets` (equity, reserves, borrowings, net_block, investments, current
  assets/liabilities, total_assets, cash, …)
- `cash_flows` (cfo, cfi, cff, net_cash, fcf, …)
- `segment_results` (segment_name, revenue, profit, per period)
- `shareholding_patterns` (promoter, fii, dii, public, pledge %, per quarter)
- `corporate_announcements` (kind, title, date, url, `source`)

Each carries `source` + `as_of` for provenance. History rows are append-only; a
restatement is a **new row with a later `as_of`**, never an UPDATE (mirrors the
`corporate_actions` / candle append-only discipline).

### 6.3 Computed layer (L2–L5 — worker-written, UI-read)

- `metric_snapshots` — the screener/detail hot table (analogous to `daily_indicators`):
  one row per instrument per as-of, holding all point-in-time ratios & valuation
  (ROE, ROCE, ROA, margins, D/E, interest cover, P/E, P/B, EV/EBITDA, PEG, FCF yield,
  dividend yield, market cap) + CAGRs (3/5/10Y) + TTM roll-ups + own-history
  aggregates (5Y avg/high/low, percentile). Indexed per metric for screening — the
  same "one indexed scan, not 500 recomputations" rationale the indicators table cites.
- `industry_benchmarks` — sector/industry medians & distributions per as-of (L4).
- `peer_sets` — precomputed peer/similarity sets + similarity scores (L4).
- `insights` — rules-based insight records: `rule_id`, severity, source cells, computed
  delta, template params, as-of (L5). **The UI reads these; it never recomputes.**

### 6.4 Money units decision (must be explicit)

Paise (₹×100) is correct for prices but **overflows for crore-scale sums** (revenue of
₹13,180 Cr = 1.318e15 paise — still within `bigint`, but care needed). Decision:
**store statement money as `bigint` paise** (Postgres bigint max ≈ 9.2e18 ≈ ₹9.2e16,
comfortably above any Indian company). Confirm in review; document alongside CLAUDE.md
rule 3. Never float.

### 6.5 Screener persistence (L7 user data — per-user, existing auth)

- `saved_screens` (`owner_id`, name, `definition` jsonb = the filter AST, created/updated)
- `saved_screen_columns` (per-user column preference), or fold into the jsonb.
- (V3) `screen_alerts` (owner, screen, condition, channel).

Reuses the per-owner isolation pattern already proven by `watchlists` (owner-scoped
repository; routes never see ownership).

### 6.6 Filter AST (the screener's core type)

A typed, serializable expression tree (lives in `packages/core` or `packages/shared`):

```
FilterNode =
  | { op: 'and' | 'or', children: FilterNode[] }
  | { metric: MetricId, cmp: '>'|'<'|'>='|'<='|'='|'between',
      value: number | [number, number],
      basis?: 'absolute' | 'industry_median' | 'sector_median' | 'own_5y_avg' }
```

One definition powers: the visual `FilterBuilder`, the NL-parser output, the SQL
compiler (AST → parameterized query over `metric_snapshots`), and the "why matched"
evaluator. **The NL parser only ever *produces an AST for the user to review* — it never
auto-applies** (vision §23).

---

## 7. AI / interpretation layer (bounded)

- **Rules-based insights (L5)** are the backbone and ship first — deterministic,
  testable, traceable. Most of the "intelligence" the vision describes (§6, §7, §9,
  §15, §16, §18) is *rules*, not LLM.
- **AI narration (L6)** is a thin, late, clearly-labelled layer that (a) turns L5
  records + L1–L4 numbers into prose and (b) answers the "Ask about this stock"
  questions **from supplied structured data only**, citing source cells. It runs behind
  a `DataSourceBadge` reading "AI-generated", is never in a calculation path, and is
  told (system prompt) never to state a number not present in its input. Uses the latest
  Claude models via the existing API conventions.
- **Guardrails:** no personalized investment advice (CLAUDE.md / safety); valuation is
  framed as "vs history / vs peers", never "buy/sell"; scores always render with their
  breakdown or don't render (CLAUDE.md).

---

## 8. Implementation roadmap (deliverable G)

Sequenced so **no surface is built on absent data**, and so a flagship page ships early.

### Phase 0 — Architecture sign-off (this document)
Confirm scope expansion with owner; confirm fundamentals data source(s); ratify the
data-layer model and money-unit decision. **No code.**

### MVP — Flagship Stock Detail on mock data + the real data spine (parallel tracks)

The vision's §37 Phase 1 says: build ONE flagship Stock Detail page (Tata Power) using
**realistic structured mock data clearly isolated from production**. Do exactly that,
while in parallel starting the real fundamentals pipeline.

- **Track A (UI):** Stock Detail route + all Layer-2/3 components (§5) built in
  Storybook first, both themes, all states, driven by a **mock fundamentals fixture**
  (paise-correct, matching the real DTO shape, in `src/stories/fixtures`). Sections:
  Header, Snapshot, Key Insights, What Changed, Price/Technical (this one uses *real*
  existing candle/indicator data), P&L, Balance Sheet, Cash Flow, Ratios, Growth,
  Profitability, Health, Valuation, Peers, Shareholding, Section Nav.
- **Track B (data):** `FundamentalsProvider` interface + first adapter behind the
  broker-independence boundary; L1 tables; the pure-core L2 calculators (ratios, CAGR,
  TTM) with hand-computed fixture tests; the worker ingestion + `metric_snapshots`
  job. Deliverable: **one company's real fundamentals flowing end-to-end.**
- **Exit:** the flagship page renders Tata Power from mock, and the same DTO shape is
  proven fillable by Track B for at least one real company.

### V1 — Real data across the universe + Screener
- Backfill fundamentals + `metric_snapshots` across the NSE universe; L3 (history
  aggregates) + L4 (industry medians, peer sets).
- **Screener** (`/screener`): Filter AST, `FilterBuilder` UI, AST→SQL over
  `metric_snapshots`, result table, filter-impact funnel, column customiser,
  save/run/duplicate screens, "why matched" bridge into Stock Detail.
- Swap the flagship page off mock onto real data; roll Stock Detail out to all symbols.
- Rules-based insights (L5) live on both surfaces.

### V2 — Connect the graph + interpretation
- **Compare** view + **Find Similar** (peer/similarity).
- Screener ↔ Detail ↔ Compare ↔ Watchlist fully wired.
- Segment analysis, shareholding trends, News/Events/Documents, Concalls.
- **AI narration (L6)** + "Ask about this stock", strictly bounded (§7).
- DuPont / advanced disclosures.

### V3 — Monitoring & advanced
- **Natural-language screener** (review-before-apply), **screen alerts** (new
  entrant/exit/threshold), screen history, advanced analytics, export, sharing.

*(This intentionally mirrors the vision's §37 phases, re-sequenced so the data spine
is never behind the UI that needs it.)*

---

## 9. Open questions for the owner (blocking Phase 0)

1. **Scope expansion.** CLAUDE.md says the product is *"watchlists only"* right now, by
   deliberate stripping. This project re-adds a screener + a large analysis surface. Is
   this a confirmed new product direction (it appears to be, from this request), and
   should CLAUDE.md's scope section be updated to match?
2. **Fundamentals data source.** This is the gating dependency. Options: a paid
   fundamentals API/vendor, licensed datafeed, or parsing filings. Which? Licensing,
   cost, coverage, refresh cadence, and redistribution terms all flow from this and
   determine the `FundamentalsProvider` adapter. **Nothing downstream can be real
   without this answer.**
3. **Money unit for crore-scale statement figures** — confirm `bigint` paise (§6.4).
4. **AI scope for V2** — how far do we take "Ask about this stock"? (Affects cost,
   guardrails, and the provenance UX.)
5. **Coverage target** — full NSE universe, or a curated large/mid-cap set first?
   (Affects ingestion volume and screener universe size.)

---

## 10. Summary

EquityWise already owns the hard-won half most projects lack: a **disciplined, mature,
token-driven design system**, a clean layered monorepo, a pure-core + worker-writes +
web-reads architecture, and strong financial-correctness instincts (integer paise,
data-unavailable state, provenance thinking). **What it entirely lacks is a fundamentals
data domain** — and that, not the UI, is the true bulk and the true risk of this
project.

The plan therefore: **extend the existing design system** with a financial-research
component layer; **build a new fundamentals data spine** (provider boundary → L1 tables
→ pure-core calculators → computed snapshots → rules-based insights → optional AI
narration → UI); and **sequence delivery** so a flagship Stock Detail page ships early on
isolated mock data while the real pipeline is proven on one company, then widened to the
universe alongside the Screener. Accuracy → Clarity → Usability → Depth → Polish, in
that order, with every number traceable to its source and no AI opinion ever dressed as
fact.
