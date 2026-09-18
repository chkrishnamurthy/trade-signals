---
name: Market indices strip
status: in-progress
horizon: now
created: 2026-09-18
updated: 2026-09-18
board: EW-133
area: [web, docs]
blocked_by: []
confidence: 4
summary: A sticky one-line ticker of seven live indices under the top bar on every app page (AppShell) — snapshot API, live SSE, index drawer, per-user selection — in five phases.
owner: krishna
---

# Market indices strip — design & build plan

Status: **phases 0–3 built 2026-09-18** (as-built reference: [`reference/market-indices-strip.md`](../reference/market-indices-strip.md)); phases 4–5 open · Target: every app page, via `PageHeader` · Mockup: https://claude.ai/artifact/J6KydDSR1doqCm9h4tH5tM

> A single row of index cards directly below `PageHeader` that answers the first
> of the product's three questions — *"What is happening in the market?"* — before
> the user reads a single row of their watchlist. Every broker and data terminal
> the user compares us against (Kite, Groww, Upstox, TradingView, NSE's own site,
> Moneycontrol) puts this row at the top of the screen, and its absence here is the
> most visible gap left by the 2026-09 strip-to-watchlists work.

---

## 1. What "market standard" means here

Surveying the reference products, an index card converges on the same anatomy.
The table is what each shows; the last column is what we build.

| Element | Kite | Groww | TradingView | NSE site | Moneycontrol | **EquityWise** |
| --- | --- | --- | --- | --- | --- | --- |
| Index name | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ overline, with `NSE`/`BSE` tag |
| Level (LTP) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ `IndexLevel`, tabular figures |
| Abs change + % | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ `PriceChange` — ▲ 123.45 (0.52%) |
| Colour by direction | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ tone tokens; **VIX inverted** |
| Session sparkline | – | ✓ | ✓ | ✓ | – | ✓ 1-minute closes, today's shape |
| Day range (L — ● — H) | – | – | – | ✓ | ✓ | ✓ in the drawer (not on the card — height budget) |
| Open / high / low / prev close | – | – | – | ✓ | ✓ | ✓ on hover and in the drawer |
| Live tick flash | ✓ | ✓ | ✓ | – | – | ✓ respects `prefers-reduced-motion` |
| Market-state label | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ Live / Pre-open / At close 15:30 |
| Click → detail | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ drawer: chart, OHLC, 52-week, breadth |
| Choose which indices | ✓ | – | ✓ | – | – | ✓ per user, from a YAML allow-list |
| 52-week high/low | – | – | – | ✓ | ✓ | ✓ in the drawer (from `daily_candles`) |

The one thing the reference products get wrong that we will not: **INDIA VIX
coloured green when it rises.** A VIX rise is risk-off. The old dashboard's
`index-cards.tsx` (removed in `5a93607`) already expressed this as a tone
override on the number, never a flip of the number; that rule is carried over
unchanged.

### Default set

Four cards by default, in this order — the four an Indian equity trader looks
at first, and what fits in one row at 1280px:

1. **NIFTY 50** — the benchmark
2. **SENSEX** — BSE benchmark (a new `exchange: BSE` entry; see risk R1)
3. **BANK NIFTY** — the most-traded sector index
4. **INDIA VIX** — the risk gauge, `kind: volatility`

FIN NIFTY (currently in `headlineIndices`) moves to the selectable pool along with
NIFTY NEXT 50, NIFTY MIDCAP 100, NIFTY SMALLCAP 100, NIFTY IT, NIFTY PHARMA, NIFTY
AUTO, NIFTY FMCG, NIFTY METAL, NIFTY REALTY, NIFTY ENERGY. Anything in the pool is
a line in `config/indices.yaml`; nothing in code enumerates index names.

---

## 2. What already exists (do not rebuild)

| Need | Already in the tree | Notes |
| --- | --- | --- |
| Index list, names, VIX flag | `config/indices.yaml` → `headlineIndices`; `apps/web/src/server/indices.ts` `getHeadlineIndices()` | Schema already has `kind: volatility` → `display: 'volatility'`. Needs `exchange` added. |
| Index instruments in the DB | `apps/worker/src/universe.ts` includes every headline index; `ingest-daily.ts` writes their daily bars | So 52-week range and a daily sparkline are a DB read, no provider call. |
| Provider-neutral index quotes | `MarketDataProvider.fetchQuotes(refs)` with `InstrumentRef.kind = 'index'` | Both Fyers and Dhan adapters translate the symbol; nothing outside the adapter names a provider format. |
| Live ticks, fan-in | `apps/web/src/server/live-quotes.ts` `liveQuoteHub` | Accepts index refs today. One upstream subscription however many browsers are open. |
| Intraday bars for the sparkline | `apps/web/src/server/history.ts` `getBars()` + the `1D` spec in `/api/history/[symbol]` | Cached per `(symbol, kind, resolution, day)`. |
| Market session state | `apps/web/src/server/market-status.ts` `getMarketStatus()`; `components/market/market-status.tsx` `LiveIndicator`, `LastUpdated` | |
| Number rendering | `components/market/numeric.tsx` `IndexLevel`, `PriceChange`, `PercentChange` | Paise in, string out — the only place a rupee string is made. |
| Sparkline w/ tone override | `components/market/sparkline.tsx` | Has the `tone` prop for VIX. |
| Card shell | `components/data-display/metric-card.tsx` `MetricCard` (+ `DefinitionRow`) | Label / hint / value / change / aside / footer slots. |
| Responsive grid | `components/layout/grid.tsx` `ContentGrid columns="metrics"` | 1 / 2 / 4 columns. |
| Stale-serving error shape | `server/errors.ts` `canServeStale`, `MarketDataError` | The removed `/api/market/ticker` route is the template. |
| Wire type | `lib/dashboard-types.ts` `HeadlineIndexDto` | Orphaned; move to `lib/market-types.ts` and extend. |
| Self-fetching chart | `components/watchlists/chart.tsx` `MarketChart` → `/api/history/[symbol]` | For the drawer. Verify `resolveSymbol` resolves an index. |

Roughly: the data spine is 80 % built. The work is one server module, two routes,
four components, and the page placement.

---

## 3. Design

### 3.1 Placement

```
┌ PageHeader ───────────────────────────────────────────────────────────────┐
│ My watchlists / Nifty 50 names                          [Live] [↻] [+ Add] │
│ Live prices and daily technical readings for the names on this list.      │
└───────────────────────────────────────────────────────────────────────────┘
┌ IndexStrip (≈ 62px incl. hairline) ───────────────────────────────────────┐
│ ┌ NIFTY 50 NSE ──────┐ ┌ SENSEX BSE ────────┐ ┌ BANK NIFTY NSE ───┐ ┌ INDIA VIX ⓘ ─────┐  ● Live · 14:32 IST  Collapse ▴ │
│ │ 25,312.40 ▲142.85 (0.57%) ╱╲╱│ │ 82,910.78 ▲464.66 (0.56%) ╱╲╱│ │ 55,612.90 ▼221.20 (0.40%) ╲╱╲│ │ 12.89 ▼0.53 (3.95%) ╲╲╱ │                                │
│ └────────────────────┘ └────────────────────┘ └───────────────────┘ └──────────────────┘                                │
└───────────────────────────────────────────────────────────────────────────┘
┌ WatchlistTabs ──────────────────────────────────────────────────────────────┐
```

- **It is page chrome, delivered the same way the page header is.**
  `PageHeader` in `components/layout/page.tsx` renders `<IndexStrip />` as its
  last child, below the title/description/actions row, so every route that
  composes a `PageHeader` — watchlists, Market Brief, Announcements,
  Institutional Flow, profile, the admin pages — carries the strip in the same
  place without wiring anything. A page opts out with `<PageHeader indices={false}>`;
  the public/marketing and auth pages never use `PageHeader`, so they never
  see it. The strip fetches its own data and holds its own state, so a page
  that renders `PageHeader` three times across loading/error/ready (as
  `watchlists-page.tsx` does) still mounts one strip with one SSE stream —
  the hook is keyed on a module-level singleton, not on the component.
- Inside `PageContainer`, so it shares the page's width and gutters; a
  hairline below it hands off to the page's own content.
- Rendered on **every** state of every page — no list yet, loading, empty,
  error — because it depends on nothing the page owns. The first paint of any
  app page always shows the market.
- **Mockup for review:** https://claude.ai/artifact/J6KydDSR1doqCm9h4tH5tM
  (in place on three pages, every card state, tablet/phone, drawer, decisions).
- Height budget: **one row of small cards, ≈ 50px each; the whole strip
  including its hairline ≈ 62px on desktop** (decided 2026-09-18 — the first
  cut at 104px covered too much of every page). The header comment in
  `components/layout/page.tsx` is explicit that every row of pixels above the
  table is paid for; the strip earns its row by being the fastest read on the
  page, and it is collapsible to a 28px ticker (§3.5). Cards are fixed-width
  (~212px) and left-aligned, not stretched across the container, so on a wide
  monitor the row reads as a compact instrument cluster and the status text
  sits at the right end of the same row.

### 3.2 The card (`IndexCard`)

A small, two-line card. `MetricCard` is too tall for this row, so `IndexCard`
is its own ~40-line component in `components/market/`, built from the same
primitives:

```
┌ NIFTY 50  NSE                    ╱╲╱ ┐   ← overline 10px + exchange tag · 56×22 sparkline, rows 1–2
│ 25,312.40  ▲ 142.85 (0.57%)          │   ← IndexLevel 15.5px + PriceChange 11.5px on one baseline
└──────────────────────────────────────┘   6px 10px padding · ≈ 50px tall · ~212px wide
```

| Part | Content |
| --- | --- |
| Line 1 | Index name (overline) + a 2xs `NSE`/`BSE` tag; VIX adds the ⓘ hint; a state badge (Pre-open / At close / Delayed) when applicable |
| Line 2 | `<IndexLevel paise={ltp} size="md" />` then `<PriceChange paise={change} percent={changePercent} tone={tone} />` on the same baseline |
| Right | `<Sparkline values={session} tone={tone} width={56} height={22} />` — today's 1-minute closes with a dashed previous-close line, spanning both rows |
| `title` / tooltip | Open · High · Low · Prev close — the detail that left the card |
| VIX footer | none on the card; "Volatility rising — risk-off / easing" moves to the tooltip and the drawer |

The **large card** (the first proposal — level at 22px, three-column O/H/L and
the day-range bar, 104px) is kept only as a Storybook variant, `size="lg"`,
so a future page that wants a full index tile does not rebuild it.

`tone` is `toneOf(change)` for an index and `invertedToneOf(change)` for
`display === 'volatility'`. The number is never flipped, only its colour.

**Tick flash.** When `ltp` changes, the value gets a 400 ms background pulse in
the direction's soft tone (`bg-bullish-soft` / `bg-bearish-soft`), the way every
terminal does. Disabled under `prefers-reduced-motion`. Implemented as a
`data-flash="up|down"` attribute set for one animation frame, not as React state
churn per tick.

**Density variants.** `density="comfortable"` (above) and `density="compact"`:
name, level, change% on one line, no sparkline or range — used inside the mobile
strip and available to any future page that wants a ticker rather than cards.

### 3.3 Day-range bar (`DayRange`) — new primitive, used in the drawer

```
24,650.10 ──────────●─────┼──────── 24,880.45
   low             ltp   prev            high
```

- Track: `bg-surface-sunken`, 4px, rounded.
- Marker: current LTP, filled dot in the change tone.
- Tick: previous close, a thin neutral tick — so the eye reads "above/below
  yesterday" without a number.
- Labels: low left, high right, `IndexLevel size="sm"`.
- Degrades: if `high`/`low` are null (pre-open, provider gap) the bar renders as
  a neutral track with "Range unavailable" `sr-only` text, never a 0–0 bar.
- Lives in `components/market/day-range.tsx`. Used by the index drawer
  (phase 4), the `size="lg"` card variant, and reusable by the stock drawer.
  **Not on the small card** — it is the element that pushed the card to 104px.

### 3.4 Market-state behaviour

Driven by `getMarketStatus()` on the server and the hub's `LiveSourceState`.

| Session | Card shows | Data source |
| --- | --- | --- |
| Open (09:15–15:30 IST) | Live level, tick flash, "● Live · hh:mm:ss IST" | SSE from the hub (socket, or poll fallback) |
| Pre-open (09:00–09:15) | Indicative level, change vs prev close, "Pre-open" | Hub in poll mode (socket is too quiet) |
| Closed, session today | Closing level, full-session sparkline, "At close · 15:30 IST" | Snapshot only; no SSE opened |
| Closed, holiday/weekend | Last session's close, "At close · Fri 12 Sep" | Snapshot only |
| Provider down | Last known values, "Delayed" badge, muted tone | Stale cache with `X-Stale-Reason` |
| No data ever | Skeleton for 3 s, then "Index data unavailable" `EmptyState` inside the strip | — |

The strip **never blanks**. A blip in the provider must not remove the market
from the top of every page; an expired credential is not a blip and does surface
(same policy as the removed ticker route).

### 3.5 Responsive

- **≥ 1024px:** one flex row — four fixed-width (~212px) cards, status at the
  right end. Not a stretched grid.
- **768–1023px:** the same cards wrap to two rows of two; status drops to a
  line below.
- **< 768px:** horizontal scroll-snap strip of narrower cards (~148px, no
  sparkline),
  `overflow-x-auto`, `scroll-snap-type: x mandatory`, edge fade to hint there is
  more. The user's thumb swipes; no arrows. This is the Groww/Kite mobile
  pattern and the shape the planned Expo app will mirror
  (`docs/mobile/README.md`).
- **Collapse:** "Collapse ▴" in the status text collapses the row to a single
  28px ticker line (name · level · change% ×4). Persisted in `localStorage`
  (`ew.indexStrip.collapsed`) in phase 2, per user in phase 5.

### 3.6 Interaction

- The whole card is a button (`role="button"`, focusable, Enter/Space) that
  opens the **index drawer** (phase 4). Until phase 4 lands the card is static —
  no dead click targets.
- `aria-label` on each card reads the full sentence: "NIFTY 50, 24,812.35, up
  128.40 or 0.52 percent, day range 24,650.10 to 24,880.45". No `aria-live` —
  a region that announces every second is hostile to screen-reader users. The
  strip's status line ("Live · 14:32") is `aria-live="off"`.
- Hover on the card shows Open / High / Low / Prev close in a tooltip on
  desktop; on touch those are in the drawer. This is deliberate: the small
  card carries the three numbers a glance needs, the drawer carries the rest.

### 3.7 Vocabulary

Everything on the card is a market fact. Index level, change, range, previous
close, volatility. No "buy", no "sell", no arrows that could read as an
instruction — the ▲/▼ glyph is `PriceChange`'s existing direction glyph, the
same one the watchlist table uses. Nothing here is a signal, so no score, no
factor breakdown, and no confidence number (CLAUDE.md "Do not").

---

## 4. Data & API

### 4.1 Wire type

Move `HeadlineIndexDto` out of `lib/dashboard-types.ts` (the rest of that file
describes the removed dashboard) into `lib/market-types.ts` as:

```ts
export interface IndexSnapshotDto {
  readonly symbol: string;            // NIFTY50 — our symbol, never a provider's
  readonly name: string;              // NIFTY 50
  readonly exchange: 'NSE' | 'BSE';
  readonly display: 'index' | 'volatility';
  readonly ltp: number;               // paise
  readonly change: number | null;     // paise, signed
  readonly changePercent: number | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly previousClose: number | null;
  /** Closing prices of today's 1-minute bars, paise, oldest first. Empty when unavailable. */
  readonly sparkline: readonly number[];
  /** Exchange feed instant, ISO. Null when the provider omitted it. */
  readonly at: string | null;
}

export interface IndexStripDto {
  readonly indices: readonly IndexSnapshotDto[];
  readonly market: MarketStateDto;    // existing shape
  /** Set when the response is a stale cache being served through a provider fault. */
  readonly stale?: { readonly reason: string; readonly asOf: string };
}
```

All prices integer paise (hard rule 3). `changePercent` is a ratio, so a float
is correct. Timestamps are ISO UTC; the card converts to IST at render.

### 4.2 Server module — `apps/web/src/server/index-strip.ts`

```
getIndexStrip(): Promise<IndexStripDto>
getStaleIndexStrip(): IndexStripDto | null
```

- Refs come from `getHeadlineIndices()` (extended to carry `exchange`).
- **Quotes:** one `provider.fetchQuotes(refs)` call. Cached process-wide for
  **5 s** — one call serves every user who loads a page in that window
  (`market-data-scaling-plan.md`: provider load scales with distinct
  instruments, not users). With four indices this is at most 12 quote requests
  a minute for the whole site.
- **Sparkline:** `getBars({ ref, resolution: '1m', from: sessionOpen, to: now,
  includeForming: true })` per index, cached **60 s** during the session and
  until the next session once closed. This is display, not a signal input, so a
  forming bar is acceptable here — but it goes through `history.ts`'s
  `includeForming` flag explicitly, never by accident (closed-candles skill).
- **Stale fallback:** the last successful `IndexStripDto` is kept in module
  memory; `getStaleIndexStrip()` returns it with `stale` set. This is the one
  permitted module-level cache in `apps/web` server code — it holds derived,
  reproducible data, never a stored price.
- Exchange-specific handling stays inside the adapters. If an adapter cannot
  serve a BSE index (R1), the module drops that card and logs once; the strip
  renders three cards rather than a broken fourth.

### 4.3 Routes

**`GET /api/market/indices`** — `apps/web/src/app/api/market/indices/route.ts`

- Auth via middleware like every `/api` route (api-boundary skill). It reads
  no user data, but it costs provider budget, so it is not public.
- Returns `IndexStripDto`, `Cache-Control: no-store`.
- On `MarketDataError` with `canServeStale`: 200 with the stale body plus
  `X-Stale-Reason`; otherwise the standard error shape
  `{ error, remedy?, code, retryAfterSeconds? }`.

**`GET /api/market/indices/live`** — SSE, phase 3

- Same frame format as `/api/watchlists/[id]/live`: `{ state, quotes }` with
  `LiveQuoteDto[]`. The client already knows how to consume it.
- Subscribes the index refs on `liveQuoteHub`; releases on close. Because the
  hub de-duplicates by symbol, a user with the strip and a watchlist open costs
  the upstream the union of both sets, once.
- Not opened when the market is closed — the snapshot route says so and the
  client skips the connection.

**Connection budget.** A page will now hold two SSE streams (strip + watchlist).
Behind Nginx with HTTP/2 that is fine; on HTTP/1.1 the browser's six-per-host
cap still leaves four. Recorded as R3; the alternative (multiplex indices into
the watchlist stream) is rejected because the strip must work on pages that
have no watchlist.

### 4.4 Config

`config/indices.yaml` `headlineIndices` becomes:

```yaml
headlineIndices:
  - { symbol: NIFTY50,   name: NIFTY 50,   exchange: NSE, default: true }
  - { symbol: SENSEX,    name: SENSEX,     exchange: BSE, default: true }
  - { symbol: NIFTYBANK, name: BANK NIFTY, exchange: NSE, default: true }
  - { symbol: INDIAVIX,  name: INDIA VIX,  exchange: NSE, default: true, kind: volatility }
  - { symbol: FINNIFTY,  name: FIN NIFTY,  exchange: NSE }
  - { symbol: NIFTYNEXT50, name: NIFTY NEXT 50, exchange: NSE }
  - { symbol: NIFTYMIDCAP100, name: NIFTY MIDCAP 100, exchange: NSE }
  # … sector indices
```

`exchange` defaults to `NSE` in the Zod schema so the existing file stays valid.
Both readers (`apps/web/src/server/indices.ts` and `apps/worker/src/universe.ts`)
learn the new fields; the worker keeps ingesting daily bars for every entry so
52-week ranges are ready when the drawer ships.

### 4.5 No new tables until phase 5

Phases 1–4 write nothing. Phase 5's per-user selection needs one JSONB column
`index_strip` on the existing user-preferences store (the watchlist `layout`
endpoint is the precedent — same shape, same validation path). No new table.

---

## 5. Phases

> **Shape change (2026-09-18, third revision):** after the 50px cards were seen
> in the running app (fixed 212px width overflowed; boxes read as widgets on
> the chrome), four shapes were mocked up (mockup v3) and the **one-line
> ticker (V1)** was chosen: name · level · change per index, hairline
> dividers, 36px, sticky, no sparkline, no condensing (nothing to fold to).
> Cells size to content. As-built: [`reference/market-indices-strip.md`](../reference/market-indices-strip.md).
>
> **Placement change (2026-09-18, later the same day):** the strip moved from
> `PageHeader` (under the title) to **`AppShell`, directly under the top bar,
> sticky, above the page title**, and grew to **seven indices** (NIFTY 50,
> NIFTY NEXT 50, BANK NIFTY, FIN NIFTY, MIDCAP 100, NIFTY IT, INDIA VIX). It is
> one non-wrapping scroll row and **condenses to a 28px ticker on scroll**
> without a layout jump. `PageHeader` is back to a plain header and is not
> sticky. §3.1 below describes the first placement; the as-built truth is
> [`reference/market-indices-strip.md`](../reference/market-indices-strip.md).
>
> **Build notes (2026-09-18):** SENSEX and the selectable pool were NOT added —
> the Fyers symbol layer is NSE-only (R1 confirmed), so the default four stay
> NIFTY 50 · BANK NIFTY · FIN NIFTY · INDIA VIX, which the tree already
> ingested. `dashboard-types.ts` was left alone (other modules still import
> `SignalDirection` from it); the new DTOs live in `market-types.ts`. The
> per-card session badge was dropped in favour of the strip's status line — a
> badge did not fit beside "BANK NIFTY" at card width. `DayRange` moved to
> phase 4 with the drawer.

### Phase 0 — Config and types (½ day)

- [x] Extend `headlineIndices` schema in `apps/web/src/server/indices.ts` and
      `apps/worker/src/universe.ts` with `exchange` (default `NSE`) and `default`.
- [x] Add SENSEX and the selectable pool to `config/indices.yaml`.
- [x] Move `HeadlineIndexDto` → `IndexSnapshotDto` in `lib/market-types.ts`;
      delete what is left of `lib/dashboard-types.ts` if nothing imports it.
- [x] Update the landing page (`app/page.tsx` Hero) to read the new field names.
- [x] Confirm each adapter resolves `{ symbol: 'SENSEX', kind: 'index', exchange: 'BSE' }`
      — write the adapter test first (R1).

### Phase 1 — Snapshot API (1 day)

- [x] `server/index-strip.ts` with the 5 s quote cache, 60 s sparkline cache,
      stale fallback. Pure builder `buildIndexStrip(quotes, bars, market, now)`
      unit-tested against fixtures (change sign, VIX passthrough, missing
      high/low, empty sparkline, stale flag).
- [x] `GET /api/market/indices` with the stale-serving policy; route test for
      the 200-stale and 401 paths.
- [x] `lib/api-routes.ts` entry.

### Phase 2 — Cards on `/watchlists` (1½ days)

- [x] `components/market/index-card.tsx` — small card (default), `size="lg"`
      variant, phone variant — + stories: up, down, flat, VIX up, VIX down,
      pre-open, closed, stale, skeleton, large.
- [x] `components/market/index-strip.tsx`: fetch, skeleton, error/empty,
      collapse toggle (localStorage), responsive grid ↔ scroll-snap.
- [x] Render from `PageHeader` (`components/layout/page.tsx`) with an
      `indices` prop defaulting to `true`; verify on `/watchlists`, `/today`,
      `/announcements`, `/flows`, `/profile` that the row sits identically.
      Adjust `PageContent`'s `mt-4` so rhythm stays one gap.
- [x] Measure: the mounted strip (cards + status + hairline) is ≤ 64px at
      1280px in both themes; fail the PR if it is not.
- [x] Storybook fixtures are labelled simulated (storybook-plan convention).

### Phase 3 — Live (1 day)

- [x] `GET /api/market/indices/live` SSE on the hub.
- [x] `useIndexLive()` hook (mirror the watchlist live hook); merge ticks into
      the snapshot; recompute `change`/`changePercent` from `ltp − previousClose`
      client-side in integer paise.
- [x] Tick flash with `prefers-reduced-motion` guard.
- [x] Status line: Live / Updating every few seconds / Pre-open / At close.
- [x] Verify on a live session that the strip and an open watchlist share one
      upstream subscription (hub log line).

### Phase 4 — Index drawer (1½ days)

- [ ] `components/market/day-range.tsx` + story (moved here from phase 2).
- [ ] `components/market/index-drawer.tsx` reusing the stock drawer's shell:
      `MarketChart` (1D/5D/1M/3M/1Y), O/H/L/Prev close, `DayRange`, 52-week
      high/low and "% from 52-week high" from `daily_candles`.
- [ ] For indices with configured constituents (NIFTY 50, BANK NIFTY): a
      one-line breadth read — *"31 advancing · 18 declining · 1 unchanged"* —
      computed from the same quote batch the watchlist uses. This is the seed of
      the Breadth page (EW-132) and shares its helper, not a second one.
- [ ] Cards become buttons; keyboard path tested.

### Phase 5 — Per-user selection (1 day, after auth prefs exist)

- [ ] "Customise" in the collapse menu: pick up to 6 from the YAML pool, drag to
      order. Saved to the user-preferences store; defaults from `default: true`.
- [ ] Collapse state moves from localStorage to the same preference.
- [ ] The Expo app reads the same preference (mobile plan D-list).

**Total: ~6½ days** across five independently shippable phases. Phases 0–2 are
the visible win; ship them together as one PR.

---

## 6. Acceptance criteria

1. On every page that renders `PageHeader`, in every page state, four small
   index cards render under the header within one skeleton cycle; no layout
   shift when data arrives (cards have a fixed min-height). The whole strip
   is ≤ 64px tall at 1280px.
2. During a session the NIFTY 50 level moves at least once a second while the
   socket is live, and the Live indicator says so; when the socket is not live
   the label says "Updating every few seconds" and never claims "Live".
3. With the provider returning 5xx, the strip keeps its last values, shows
   "Delayed", and the page's watchlist still loads.
4. INDIA VIX up renders red; down renders green; the sign of the number is
   unchanged.
5. Every number is produced by `IndexLevel`/`PriceChange` from integer paise —
   `grep` finds no `/ 100` or `toFixed` in the new components.
6. No file under `apps/web` imports `@equitywise/fyers`, `@equitywise/dhan`, or
   names a provider symbol format (provider-boundary skill).
7. Lighthouse: the strip adds < 8 KB gzipped to the page and no CLS.
8. Storybook has every card state listed in phase 2.
9. `pnpm test` / `pnpm biome check` / `pnpm tsc` clean.

---

## 7. Risks & open decisions

| # | Risk / decision | Mitigation / proposal |
| --- | --- | --- |
| R1 | **BSE index coverage.** Fyers serves `BSE:SENSEX-INDEX`; Dhan needs the BSE index security id in its instrument master. In `routed` mode a miss on one provider falls to the other. | Adapter test in phase 0. If neither serves it, SENSEX is dropped from defaults and NIFTY NEXT 50 takes the slot — config change only. |
| R2 | **Socket symbol cap** (Fyers 200 / Dhan 5,000 per connection). Four more symbols is negligible; the pool of 15 is still negligible. | None needed; noted so the cap arithmetic in `live-quotes.ts` stays honest. |
| R3 | **Two SSE streams per tab.** | Fine on HTTP/2 (Nginx is configured for it — verify in `deployment.md`). Revisit only if a third stream appears. |
| R4 | **Sparkline cost** — one 1-minute-bars request per index per minute across the site. | 4–6 req/min against a 100/min budget. Acceptable; the cache is process-wide. |
| R5 | **Forming bar in the sparkline.** | Display only, explicit `includeForming: true`, and nothing downstream reads it. Documented in the module header. |
| D1 | Session sparkline (today's shape) vs 30-session daily sparkline (trend)? | **Session.** The strip answers "what is the market doing *today*"; the drawer's chart covers trend. |
| D2 | Which pages get the strip? | **Decided 2026-09-18 (revised the same day): every `AppShell` page, rendered once by `AppShell` under the top bar, sticky, above the page title.** Not the public landing page (it has its own static index tiles) or auth pages. |
| D3 | Default four: SENSEX or FIN NIFTY? | **SENSEX** — it is what a retail user expects beside NIFTY 50. FIN NIFTY stays one click away in the pool. |
| D4 | Collapse state per device or per user? | localStorage in phase 2, user preference in phase 5. |
| D5 | Card size | **Decided 2026-09-18: small (≈ 50px).** The 104px card with the day-range bar covered too much of every page. Day range and O/H/L/PC move to hover and the drawer; the large card survives only as a Storybook variant. |
| D6 | How many indices, which | **Decided 2026-09-18: seven** — NIFTY 50, NIFTY NEXT 50 (standing in for SENSEX), BANK NIFTY, FIN NIFTY, MIDCAP 100, NIFTY IT, INDIA VIX. Only tickers the repo's symbol layers already know; SMALLCAP 100 waits on verification. Per-user choice stays phase 5. |
| D7 | Sticky | **Decided 2026-09-18: sticky under the top bar.** First built as 60px cards condensing to a 28px ticker on scroll; superseded by D8. Page titles are not sticky. |
| D8 | Shape | **Decided 2026-09-18: one-line ticker (V1 of mockup v3), 36px.** Cards overflowed at a fixed width and competed with the top bar; divided cells (V2) and chips (V4) were the alternatives. Cells are content-sized; abs change shown from 1536px, % only below. Sparkline and condense/collapse removed. |

---

## 8. Files touched

```
config/indices.yaml                                   (+ exchange, default, pool)
apps/web/src/server/indices.ts                        (schema)
apps/worker/src/universe.ts                           (schema)
apps/web/src/lib/market-types.ts                      (+ IndexSnapshotDto, IndexStripDto)
apps/web/src/lib/dashboard-types.ts                   (− HeadlineIndexDto)
apps/web/src/lib/api-routes.ts
apps/web/src/server/index-strip.ts                    (new) + .test.ts
apps/web/src/app/api/market/indices/route.ts          (new)
apps/web/src/app/api/market/indices/live/route.ts     (new, phase 3)
apps/web/src/components/market/index-card.tsx         (new) + .stories.tsx
apps/web/src/components/market/day-range.tsx          (new, phase 4) + .stories.tsx
apps/web/src/components/market/index-strip.tsx        (new) + .stories.tsx
apps/web/src/components/market/index-drawer.tsx       (new, phase 4)
apps/web/src/hooks/use-index-live.ts                  (new, phase 3)
apps/web/src/components/layout/page.tsx                (PageHeader renders the strip)
apps/web/src/app/page.tsx                             (field rename)
docs/api-reference.md                                 (+ two routes)
```

---

## 9. References

- Removed originals worth reading before starting:
  `git show 5a93607^:apps/web/src/components/dashboard/index-cards.tsx` and
  `git show 5a93607^:apps/web/src/app/api/market/ticker/route.ts`.
- `docs/planning/market-data-scaling-plan.md` — the fan-in rule this follows.
- `docs/planning/finmagine-competitive-analysis.md` §7 — where the index strip
  sits in the competitive gap list.
- `docs/planning/mobile-responsive-plan.md` — the scroll-snap strip pattern.
- `issues/breadth-page.md` (EW-132) — the drawer's breadth line is its seed.
