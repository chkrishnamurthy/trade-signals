# Market indices strip — as built

The sticky one-line ticker of seven indices (NIFTY 50, NIFTY NEXT 50, BANK
NIFTY, FIN NIFTY, MIDCAP 100, NIFTY IT, INDIA VIX) that `AppShell` renders
directly under the top bar on every signed-in page, above each page's own
title. Built 2026-09-18 from
[`planning/market-indices-strip-plan.md`](../planning/market-indices-strip-plan.md)
(phases 0–3); the same day it moved from `PageHeader` to `AppShell`, became
sticky, and — after the 50px cards were reviewed in the running app — was
reshaped to the one-line "V1" form. This page is the look-up reference for how
it works and how to change it; the plan holds the design reasoning and the
phases still open.

Mockup with the four shapes that were compared (V1 chosen):
https://claude.ai/artifact/J6KydDSR1doqCm9h4tH5tM

---

## 1. What it is

```
┌ Top bar (sticky, 56px, z-40) ──────────────────────────────────────────────────────────────┐
├ Index strip (sticky under it, 36px, z-30) ─────────────────────────────────────────────────┤
│ NIFTY 50 25,312.40 ▲ +142.85 (+0.57%) │ NIFTY NEXT 50 68,412.15 ▲ … │ BANK NIFTY … ▸   ● NSE · Live 14:32:07 IST │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ My watchlists ›                                                        (page header —      │
│ Nifty 50 names                                                          scrolls away)      │
│ Live prices and daily technical readings for the names on this list.                       │
│ …page content…                                                                             │
```

- **App chrome, rendered once.** `AppShell` (`apps/web/src/components/layout/app-shell.tsx`)
  renders `<IndexStrip />` between the top bar and `<main>`, so every signed-in
  route carries it in the same place and it never remounts on a route change
  or a `loading.tsx` boundary. Nothing per page; `PageHeader` knows nothing
  about it. Public/marketing and auth pages do not use `AppShell`, so they
  never see it.
- **Sticky, like the top bar.** `position: sticky; top: 56px`, 36px tall, with
  the top bar's translucent material (`bg-surface/85 backdrop-blur`, hairline
  below), so the two read as one chrome block and the page canvas below reads
  as content. Sticky chrome is 56 + 36 = 92px. The page's own header is
  **not** sticky — the bar's active item already names the page, so the title
  is read once and scrolls away.
- **One line, never two.** Each index is a cell — name · level · change — as
  wide as its own numbers, divided from the next by a hairline. When seven do
  not fit the row scrolls sideways under an edge fade at the right (a
  `ResizeObserver` decides whether it overflows). Nothing here has a fixed
  width: the first build fixed cards at 212px and the change figure overflowed
  at the dark theme's font metrics.
- **What fits:** from `2xl` (1536px) the change shows as `▲ +142.85 (+0.57%)`;
  below that as `▲ +0.57%` only, which fits six cells at 1280 with the seventh
  behind the fade. A phone shows the same `%` form and a one-word status.
- No sparkline, no per-cell badge, no collapse: a one-line strip has nothing
  to fold to, so the earlier condense-on-scroll and Collapse machinery was
  removed along with the sparkline fetch.

### What a cell shows

```
NIFTY 50  25,312.40  ▲ +142.85 (+0.57%) │      name · level · signed change (· percent)
```

- Open / High / Low / Prev close are in the cell's `title` tooltip.
- **INDIA VIX inverts the colour**: a VIX rise is red, a fall is green. The
  number is never flipped — only its tone (`invertedToneOf`). This is
  `display: 'volatility'` in the DTO, from `kind: volatility` in config.
- A stale cell (last-good snapshot through a provider fault) is dimmed.
- Session state is said once, on the strip's status at the right end — never
  per cell. It is prefixed `NSE ·` so it does not read as a duplicate of a
  page's own `Live` badge (the watchlists page has one for *its* prices).
  Phones show the brief form only.

| Situation | Status (≥ sm) | Brief (phone) | Live dot |
| --- | --- | --- | --- |
| Socket streaming | `NSE · Live` + a running `hh:mm:ss IST` clock | `Live` | pulsing |
| Socket down, REST polling | `NSE · Updating every few seconds` | `Updating` | static |
| Open but not yet connected | `NSE · Connecting…` | `Connecting` | static |
| Pre-open | `NSE · Pre-open · indicative until 09:15 IST` | `Pre-open` | static |
| Closed / post-close | `NSE · At close · <date of last feed instant>` | `Closed` | static |
| Provider fault, last snapshot shown | `Delayed · last update hh:mm IST`; cells dimmed | `Delayed` | static |
| Phase unknown | `As of hh:mm IST` | `As of` | static |
| Nothing ever loaded | one muted line: `Market indices unavailable — <remedy>` | — | — |

---

## 2. Data flow

```
config/indices.yaml (headlineIndices)
        │
        ▼
server/indices.ts  getHeadlineIndices()  ──►  server/index-strip.ts
                                                 ├─ provider.fetchQuotes(refs)      one call, 5 s cache
                                                 └─ getMarketStatus()               60 s cache (existing)
                                                        │
                        GET /api/market/indices ◄───────┘   IndexStripDto (+ stale fallback)
                        GET /api/market/indices/live        SSE via liveQuoteHub (shared with watchlists)
                                │
                                ▼
                 lib/use-index-strip.ts  ──►  components/market/index-strip.tsx  ──►  index-cell.tsx
```

### Config — `config/indices.yaml`

```yaml
headlineIndices:
  - { symbol: NIFTY50,        name: NIFTY 50,      exchange: NSE }
  - { symbol: NIFTYNEXT50,    name: NIFTY NEXT 50, exchange: NSE }
  - { symbol: NIFTYBANK,      name: BANK NIFTY,    exchange: NSE }
  - { symbol: FINNIFTY,       name: FIN NIFTY,     exchange: NSE }
  - { symbol: NIFTYMIDCAP100, name: MIDCAP 100,    exchange: NSE }
  - { symbol: NIFTYIT,        name: NIFTY IT,      exchange: NSE }
  - { symbol: INDIAVIX,       name: INDIA VIX,     exchange: NSE, kind: volatility }
```

- Order here is the order on screen. Add, remove or reorder indices **here
  only** — nothing in code enumerates index names. Keep `name` short: every
  character is width on a one-line strip ("MIDCAP 100", not "NIFTY MIDCAP 100").
- `symbol` is **our** symbol. The adapters translate: Fyers via
  `toFyersSymbol` + the alias table in `packages/fyers/src/symbols.ts`
  (`NIFTYNEXT50` → `NSE:NIFTYNXT50-INDEX`, `NIFTYMIDSELECT` → `NSE:MIDCPNIFTY-INDEX`;
  the outbound direction of that table was added 2026-09-18), Dhan by ticker
  via `packages/dhan/src/symbols.ts` (`NIFTYMID100FREE` → `NIFTYMIDCAP100`,
  `NIFTY IT` → `NIFTYIT`).
- Why these seven and not others: every ticker above is one the repo's symbol
  layers already know. **NIFTY SMALLCAP 100 is not in** because its ticker is
  unverified on both providers; **SENSEX is not in** because `exchange: BSE`
  is accepted by the schema but the Fyers symbol layer is NSE-only (plan risk
  R1). An index the provider cannot quote is dropped from the strip (six
  cells, not a broken seventh) and the web server logs
  `[index-strip] no quote for <SYMBOL> — check the ticker …` on every
  snapshot fetch, and the worker logs the failed daily ingest — that is how
  to verify a new ticker after adding it. (First observed in the running app
  2026-09-18: NIFTY NEXT 50 was absent; the outbound Fyers alias fix below
  is the likely cause if the run predated it, otherwise read that log line.)
- `kind: volatility` → `display: 'volatility'` → inverted tone.
- The public landing page shows the first four of this list as static tiles.
- The worker reads the same list (`apps/worker/src/universe.ts`) and ingests
  daily bars for every entry, so a new index also gets history for the future
  drawer's 52-week range.

### Server — `apps/web/src/server/index-strip.ts`

| Export | Purpose |
| --- | --- |
| `buildIndexStrip(input)` | Pure. Provider quotes + market status → `IndexStripDto`. Drops an index with no quote rather than rendering zeros. |
| `getIndexStrip(now?)` | Cached snapshot (`SNAPSHOT_TTL_MS = 5_000`), concurrent callers share one upstream request. Throws `MarketDataError`. |
| `getStaleIndexStrip(reason)` | The last successful snapshot with `stale: { reason }`, or `null` before the first success. |
| `getIndexStripRefs()` | The `InstrumentRef[]` the live route subscribes — always the same set the snapshot quotes. |
| `resetIndexStripCache()` | Test seam. |

Cost per minute for the whole site, however many users: ≤ 12 quote requests
(one per 5 s). No history requests — the one-line strip has no sparkline.

### Routes

| Route | Behaviour |
| --- | --- |
| `GET /api/market/indices` | `IndexStripDto`, `Cache-Control: no-store`. On a `MarketDataError` that `canServeStale` (anything but `AUTH` / `NOT_CONFIGURED`), a 200 with the stale body and `X-Stale-Reason: <code>` (+ `Retry-After` when known). Otherwise the standard `{ error, code, remedy?, retryAfterSeconds? }`; a 401 also clears the dead session cookie. |
| `GET /api/market/indices/live` | Server-sent events, `{ state, quotes }` frames identical to `/api/watchlists/:id/live`, one per second at most, only symbols that moved. Subscribes `getIndexStripRefs()` on `liveQuoteHub()`; released when the browser closes. 15 s keep-alive comments; `X-Accel-Buffering: no` for Nginx. |

Both are behind the middleware gate like every `/api/*` route; neither reads
user data.

### Wire types — `apps/web/src/lib/market-types.ts`

`IndexSnapshotDto` (one cell: symbol, name, exchange, display, ltp, change,
changePercent, open, high, low, previousClose, at) and
`IndexStripDto` (indices, market, asOf, stale?). All prices integer paise;
`changePercent` is a ratio; instants are ISO UTC.

### Client — `apps/web/src/lib/use-index-strip.ts`

- `useIndexStrip()` → `{ state, liveState, refresh }`.
- Snapshot poll: every **60 s** while `open` / `pre_open` (refreshes O/H/L
  and the phase — a tick carries neither), every **5 min** otherwise; paused
  while the tab is hidden; honours `retryAfterSeconds`.
- SSE opened only while `open` / `pre_open` and the tab is visible.
- `applyIndexTicks(indices, quotes)` merges ticks: `ltp` replaced, `change`
  recomputed as `ltp − previousClose` in integer paise, `changePercent` as a
  ratio, `high`/`low` stretched to include the tick. Returns the same array
  when nothing moved so React skips the render.
- The last snapshot is kept at module level, so a route change (or a
  `loading.tsx` remount) paints the strip instantly instead of a skeleton.
- A fetch failure after a successful load keeps the last data on screen; only
  a first load with nothing to show becomes the error line.

### Components — `apps/web/src/components/market/`

| File | What |
| --- | --- |
| `index-strip.tsx` | `IndexStrip` (container: data hook) and `IndexStripView` (presentational: `state`, `liveState`). One 36px sticky box: a horizontal scroller of cells with the edge fade, the status at the right. Constants at the top: `STRIP_HEIGHT`, `TOPBAR_HEIGHT` (must match `AppShell`'s `h-14`). |
| `index-cell.tsx` | `IndexCell` and `IndexCellSkeleton` (same footprint, so no layout shift). |
| `flash-on-change.tsx` | `FlashOnChange` — the green/red pulse on a moved value. Extracted from `watchlist-cells.tsx`; both use it now. Uses the `price-flash-up/down` utilities in `globals.css`; reduced-motion is respected there. |
| `sparkline.tsx` | Gained a `label` prop for the accessible name; not used by the strip since the one-line reshape. |
| `index-strip.stories.tsx` | Live, Sticky (real page scroll under a fake top bar), Polling, PreOpen, AtClose, Delayed, Loading, Unavailable, Cells (every cell state), Phone. All fixtures simulated. |

---

## 3. Verification

- `apps/web/src/server/index-strip.test.ts` — builder shape and ordering,
  dropped index, 5 s cache and in-flight sharing, stale fallback before/after
  a success, the dropped-index warning names the symbol.
- `apps/web/src/lib/use-index-strip.test.ts` — tick merging (no-op identity,
  integer paise change, range stretch, null previous close).
- Rendered in Storybook (`Domain/IndexStrip`) at 1280px and 400px, light and
  dark, against the real design tokens, inside a fake top bar so the sticky
  offset reads as it does in the app — screenshots reviewed 2026-09-18
  (`Sticky` scrolls the real window).
- Reviewed once in the running app by the author (dark theme, 2026-09-18):
  that review is what retired the 50px cards — the fixed width overflowed and
  the boxes read as widgets on the chrome.
- Not verified against the live provider from this machine (no SSH key for the
  VPS tunnel). First live check to do after deploy: open `/watchlists` during a
  session and confirm the status says `Live` and the levels tick; then open a
  watchlist and check `pm2 logs equitywise-web` shows one hub subscription
  covering both.

---

## 4. How to…

**Add or reorder an index** — edit `headlineIndices` in `config/indices.yaml`.
Restart the web app (the file is read once per process). The worker picks the
new symbol up for daily-bar ingestion on its next run.

**Hide the strip on one page** — there is deliberately no per-page switch:
it is app chrome, like the top bar. If a page genuinely must not carry it,
add a prop to `AppShell`, not to the page.

**If the top bar's height changes** — change `TOPBAR_HEIGHT` in
`index-strip.tsx` with it or the strip will float.

**Change the poll cadence** — `OPEN_POLL_MS` / `CLOSED_POLL_MS` in
`use-index-strip.ts`; the server TTL is `SNAPSHOT_TTL_MS` in `index-strip.ts`.

**Change the strip height** — `STRIP_HEIGHT` in `index-strip.tsx`. If you
make it taller, re-read plan §3.1 first: it is sticky, so every pixel is paid
for on every page while scrolling. Never give a cell a fixed width.

**Show the absolute change at a narrower width** — the `2xl:` pair on
`PriceChange` / `PercentChange` in `index-cell.tsx`.

**Change what "Live" means** — do not. It is claimed only while the hub reports
`streaming`, the same rule as the watchlist page.

---

## 5. Not built yet (on the board as EW-133)

- **Phase 4 — index drawer**: tap a cell → chart (1D/5D/1M/3M/1Y), O/H/L/PC,
  `DayRange` bar, 52-week range from `daily_candles`, and the constituents'
  advance/decline for indices with a constituent list. This is also where a
  session sparkline would live now. Cells are plain `div`s until then — no
  dead click targets.
- **Phase 5 — per-user selection**: choose which indices from a YAML pool and
  order them. Deferred by decision (2026-09-18): the seven above are the fixed
  set for now.
- **SENSEX** needs BSE support in the provider symbol layers (plan R1);
  **NIFTY SMALLCAP 100** needs its ticker verified on both providers. Both are
  config-only additions once unblocked.
