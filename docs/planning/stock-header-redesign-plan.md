# Stock page header: company introduction card — redesign plan

**Status:** Built, 2026-10-04 (R1–R4, owner chose every recommended option in §8 and
asked for an EquityWise look rather than a copy of the reference). See §0.
**Scope:** the top of `/stocks/[symbol]`: header, key-ratio grid, profile and key
points. The chart, tabs and sidebar below it stay as they are.
**Reference:** a screener.in-style company card (name and price, identifier links, a
3-column ratio grid with "Add ratio" / "Edit ratios", and an About / Key points column).
**Data rule:** Dhan, Fyers and data EquityWise already collects only
(`screener-dhan-fyers-plan.md`). Nothing is estimated, and a field we cannot source
is left out, never shown as a placeholder.

---

## 0. As built (2026-10-04)

Decisions taken (§8): one layout per user shared across stocks, saved server-side;
dividend yield built (R4); no price-history export; computed key points.

The design deliberately departs from the reference card:

| Reference | EquityWise |
| --- | --- |
| Name + price on one line | **Hero card** — monogram, name, a mono identity line (`SYMBOL · NSE · EQ · Industry`), link chips (NSE quote, ISIN copy, F&O, series with its meaning, industry and index chips that open a filtered screener) and a sunken **price band**: close and change · a 3-month sparkline with its return · the 52-week ribbon with the close marker |
| Striped label/value table | **"At a glance" ratio board** — a spec sheet of tiles sharing hairlines; each tile is label (definition on hover/focus), value, a **visual cue** (meter with reference ticks for bounded readings, centre-zero bar for signed moves, ribbon for the 52-week range; delivery shows its 20-session average as a second marker) and one line of context. 2 columns on phones (8 shown, "Show all"), 3 from 640px |
| "Add ratio" search box + "Edit ratios" | A dashed **Add ratio** tile opens the screener's metric picker; **Customise** mode moves tiles with ←/→, removes with ×, resets to default; optimistic save, debounced 600 ms, reverts with a toast on failure |
| About | **Company file** — industry (with source), indices, series, listing date and age, ISIN, face value, dividends over 12 months, last dividend, last session |
| Key points | **What stands out** — up to 6 computed facts, each with a tone icon and a "See <tab>" jump to its evidence |

Files: `packages/core/src/screener/{dividends,key-points,ratios}.ts` (+ `stock-header.test.ts`),
`packages/db` migration **`0034_stock_header`** (`dividends`, `user_ratio_layouts`, two snapshot
columns), worker `syncCorporateActions` (records dividends), one-time job
**`backfill-dividends`** (triggered on worker start until done; then rebuilds the snapshot),
`GET/PUT/DELETE /api/stocks/ratio-layout`, `apps/web/src/lib/ratio-board.ts`,
`components/stocks/{stock-header,ratio-board,stands-out,company-file,add-to-watchlist}.tsx`.

Dividend rules as built: REIT/InvIT "Distribution … Per Unit" lines are ignored; parts of
the same kind on one ex-date are summed; an amount that is not whole paise (`Re 0.125`) or
cannot be read (`50%`) is stored as unknown, and a 12-month sum containing one is null, never
understated; amounts before a split/bonus are restated on today's share basis; dividend
columns stay null until the dividend history checkpoint is set, so "none paid" is never a
false zero.

---

## 1. What the reference shows, and what we can fill

| Reference element | Our source | V1 |
| --- | --- | --- |
| Logo | None. We don't host or scrape logos (trademarks, no source) | **Monogram tile** (initials, steady colour per symbol) |
| Company name (headline) | `instruments.name` | Yes |
| Price, day change, "01 Oct · close price" | snapshot `close`, `changePct`, session | Yes |
| Website link | No source | Omitted |
| BSE code link | Not on `main` (the BSE scrip map is on the unmerged `feat/multi-exchange-bse`) | Omitted; added when that merges |
| NSE: SYMBOL link | Symbol; links out to the NSE quote page | Yes |
| F&O link | `fnoEligible` | Yes; jumps to the F&O tab |
| Export to Excel | Client-side CSV of the visible ratios | Yes (§5.4) |
| Follow + dropdown | The existing **Add to watchlist** split button | Yes; keeps our wording |
| Market cap | Needs shares outstanding. Company-research plan §4.2 says never estimate it | **No** |
| Current price | `close` | Yes |
| High / Low (52W) | 52-week high and low in the snapshot | Yes |
| Stock P/E, Industry PE, Book value, ROCE, ROE, Debt | Fundamentals; no source | **No** |
| Dividend yield | **Possible from our data**: cash dividends in NSE's corporate-actions feed ÷ close | Phase R4, optional |
| Face value | `instrument_reference.face_value_paise` (EQUITY_L) | Yes |
| Down from 52W high / Up from 52W low | `dist52wHigh` / `dist52wLow` | Yes |
| 52W index | Position of the close in the 52-week range | Yes, drawn as a mini range bar |
| Promoter / Public holding | `promoterPct` / `publicPct` | Yes |
| "Add ratio to table" / "Edit ratios" | Any of the ~93 non-admin catalogue metrics | Yes (§5.3) |
| About (company description) | No source | **Replaced by "Profile"**: facts we hold (§5.5) |
| Key points (market position…) | No editorial source | **Replaced by computed "Key points"**: facts from our data, each linked to its evidence (§5.6) |

About two-thirds of the reference card can be built today. The gaps are
fundamentals, market cap, company description, logo, website and BSE code. They
stay in `company-research-implementation-plan.md`.

---

## 2. Layout

### Desktop (≥ 1280px): two columns, as in the reference

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ [HB]  HDFC Bank Ltd   ₹721.00  ▲ 1.76%               [⤓ Export]  [＋ Add to watchlist ▾] │
│       01 Oct · NSE close                                                           │
│ ↗ NSE: HDFCBANK   ⧉ ISIN INE040A01034   F&O   Nifty 50 · Nifty Bank   Banks ›   EQ  │
│ ┌─ Matched “Near 52W high · rising delivery” ─────────────────────────── (if from screen)
├──────────────────────────────────────────────────────────┬─────────────────────────┤
│ Current price      ₹721 │ 52W high / low  ₹1,020 / 682 │ Face value      ₹1.00   │ PROFILE                 │
│ From 52W high   −29.3 % │ From 52W low       +5.8 %    │ 1Y return     −12.4 %   │ Industry   Banks        │
│ 1M return        +3.1 % │ 3M return          −6.0 %    │ RS rank (3M)      41    │ Indices    Nifty 50, …  │
│ RSI (14)          48.2  │ ADX (14)           19.6      │ vs EMA 200    −14.1 %   │ Series     EQ · rolling │
│ Avg turnover  ₹1,240 Cr │ Relative volume    1.32×     │ Delivery %     58.4 %   │ Listed     8 Nov 1995   │
│ ATR %            1.9 %  │ Promoter           0.00 %    │ Public         16.3 %   │ ISIN · Face value       │
│                                                         │                         │
│ [＋ Add ratio…  search 93 metrics          ]   ✎ Edit ratios │ KEY POINTS              │
│                                                         │ • 29% below 52W high…   │
│                                                         │ • Delivery 58% vs 41%…  │
│                                                         │ • Results meeting in 6d │
│                                                         │ Show all ›              │
└──────────────────────────────────────────────────────────┴─────────────────────────┘
```

- Ratio grid on the left, 2/3 width, **3 columns × 6 rows** by default. Odd rows
  have a sunken background that spans the row, as in the reference.
- Profile and Key points on the right, 1/3 width. Small caps headings
  (`text-xs tracking-widest uppercase`) for the reference's look.

### Tablet (768–1279px)

The ratio grid drops to **2 columns**. Profile and Key points sit below it, side by
side.

### Phone (< 768px)

- The monogram and name share a row, with the price block under them.
- Identifier chips wrap onto two lines at most; the rest go under a "+3" chip.
- Actions become a full-width row: **Add to watchlist** (primary, flexible width)
  and an icon-only Export button with an `aria-label`.
- The ratio grid becomes **1 column** of label/value rows (screener.in's mobile
  pattern). It shows the first 8; **Show all 18 ratios** expands the rest.
- Key points show 3, then **Show all**, and Profile is a collapsible section.
- No horizontal page scroll at 375px (CLAUDE.md responsive rule).

---

## 3. Visual details

- **Numbers:** `figure` (tabular) font, right-aligned. The unit glyph is muted: `₹`
  before the number, `%` / `×` / `Cr` after it, as in the reference. Money stays in
  paise until `formatPaise()` (hard rule 3).
- **Colour:** neutral by default. Green/red only where a value has a direction
  (change, returns, distance from 52W high/low, QoQ). Never on levels such as RSI.
- **52W high / low tile:** both numbers on one line, plus a 3px range bar with a
  marker for the close. This merges the reference's "High / Low" and "52w Index".
- **Hover/focus:** each label has a dotted underline. A tooltip gives the
  catalogue `description` ("Close's percentage below its highest close of the last
  252 sessions"). On touch, tapping the label opens it.
- **Stale or missing:** if the stock has no snapshot, the grid shows the existing
  "No snapshot yet" empty state. A single missing value renders as an em dash with
  the tooltip "Not available for this stock" (e.g. Promoter for a stock with no
  filing).
- **Series warning:** BE and BZ series chips use the warning tone, with the tooltip
  "Trade-for-trade: every trade settles by delivery". That is facts, not advice.
- **Both themes:** striping and chips use existing tokens (`surface-sunken`,
  `border`, `muted-foreground`), with no new raw colours. Both themes are checked
  visually before done.

---

## 4. Default ratios (18)

Chosen to mirror the reference's mix: price position, returns, trend, liquidity and
ownership.

| Row | Col 1 | Col 2 | Col 3 |
| --- | --- | --- | --- |
| 1 | Current price (`close`) | 52W high / low (composite) | Face value (profile fact) |
| 2 | From 52W high (`dist52wHigh`) | From 52W low (`dist52wLow`) | 1Y return (`ret1y`) |
| 3 | 1M return (`ret1m`) | 3M return (`ret3m`) | RS rank 3M (`rsRank`) |
| 4 | RSI 14 (`rsi14`) | ADX 14 (`adx14`) | Close vs EMA 200 (`closeVsEma200`) |
| 5 | Avg turnover 20 (`avgTurnover20`) | Relative volume (`relVolume`) | Delivery % (`deliveryPct`) |
| 6 | ATR % (`atrPct`) | Promoter holding (`promoterPct`) | Public holding (`publicPct`) |

For an F&O stock, the default replaces **ATR %** with **OI build-up**
(`oiBuildup`), so F&O context shows without editing.

The ratio grid replaces today's six-stat strip (relative volume, delivery, ATR, RS
rank, OI build-up, promoter). All six stay in the grid, so nothing is lost.

---

## 5. Behaviour

### 5.1 Header

- **h1 is the company name**, as in the reference. The symbol moves to the "NSE:
  SYMBOL" chip, and the page `<title>` stays `SYMBOL · Company`.
- "NSE: SYMBOL ↗" opens `nseindia.com/get-quotes/equity?symbol=…` in a new tab
  (`rel="noopener noreferrer"`). It is a plain link with no fetch.
- ISIN has a copy button (toast "ISIN copied").
- The industry chip opens `/screener` filtered to that industry. Index chips open
  `/screener` filtered to that index.
- The "matched because" banner from a screen stays, as a slim strip inside the card
  under the chips rather than a separate box above it.

### 5.2 Ratio grid

- `<dl>` with `dt`/`dd` pairs, so screen readers read label then value.
- Values come from the same snapshot row and `formatMetric()` the screener uses, so
  a number on this page always equals the screener's.
- Boolean and "days since" metrics render as words ("Yes", "3 sessions ago").
  Enum metrics render their option label ("Long build-up").

### 5.3 Add ratio / Edit ratios

- **Add ratio:** a search box under the grid, reusing the screener's
  `MetricPicker` (categories, search over label and description). Picking one
  appends a tile. Metrics already shown are hidden from the picker.
- **Edit ratios:** a toggle that puts the grid in edit mode.
  - Each tile shows a drag handle, plus **↑ / ↓** buttons, so reordering also works
    by keyboard and without drag.
  - Each tile has a **×** to remove it.
  - The footer has **Reset to default** and **Done**.
- **Limits:** at least 3 and at most 30 ratios. Admin-only metrics (signals) never
  appear for non-admins (`catalogueFor(isAdmin)`).
- **Persistence: per user, server-side.** The layout is one list for the user,
  shared by every stock, as on screener.in. It follows the user across phone and
  desktop. Saves are optimistic, debounced by 600 ms, and revert with a toast on
  failure.
- An unknown key in a saved layout (a metric later removed) is dropped silently on
  read.

### 5.4 Export

- **Export** downloads `SYMBOL-ratios-YYYY-MM-DD.csv` with the columns Metric,
  Value, Unit and Session. It covers the ratios the user currently shows plus the
  profile facts, and is generated client-side with no new dependency. The CSV opens
  in Excel.
- **Price history export is not in V1.** The bars come from NSE's end-of-day
  files. Redistributing raw price series raises the licence question
  (`monetization-data-strategy`, NSE display licence not bought). This is an owner
  decision (§8).

### 5.5 Profile (replaces "About")

Facts only: Industry (with source, "NSE index list"), Indices, Series with a plain
meaning, Listed since (date plus "29 years"), ISIN, Face value, F&O (yes/no), and
Last session.

When a description source exists later (company-research plan, `company_profiles`),
an **About** section joins above Profile without a layout change.

### 5.6 Key points (computed facts)

A pure function in `packages/core/src/screener/key-points.ts`:

```ts
keyPoints(values: SnapshotValues, ctx: { events: …, industryRank?: … }): KeyPoint[]
// KeyPoint = { id, text, metric: MetricKey, tab: StockTab, salience: number }
```

- **Deterministic rules**, ranked by salience; up to 6 are returned. Each point
  states a fact and the number behind it, and links to the tab that shows it:
  - "29.3% below its 52-week high of ₹1,020" (`dist52wHigh` ≤ −20)
  - "Closed at a new 52-week high" (`breakout52w`)
  - "Delivery 58% today vs 41% 20-day average" (`deliveryRatio` ≥ 1.3)
  - "Outperformed the Nifty 50 by 8.2 pp over 3 months, RS rank 84" (`rs3m`,
    `rsRank` ≥ 80)
  - "Promoter holding down 0.4 pp quarter on quarter" (`promoterChgQoq`)
  - "Results board meeting in 6 days" / "Ex-date in 3 days" (events)
  - "Long build-up in futures for 3 sessions" (F&O)
  - "Unexplained price gap on 12 Sep; figures may be unadjusted" (gap guard)
- **Wording guard:** a unit test asserts that no generated text contains "buy",
  "sell", "target", "should", "recommend", "undervalued" or similar (CLAUDE.md
  wording rules).
- **Fixtures:** hand-built snapshot rows. Each rule's threshold boundary is tested
  on both sides.

---

## 6. Data and API changes

| Layer | Change |
| --- | --- |
| `packages/core` | `screener/key-points.ts` with tests; `DEFAULT_RATIO_KEYS`, `DEFAULT_RATIO_KEYS_FNO` and `RATIO_LIMITS {min: 3, max: 30}` in `catalogue.ts`; `ProfileFact` keys (`high52wLow52w`, `faceValue`) for the two composite/profile tiles |
| `packages/db` | Migration `0034_stock_header`: **`user_ratio_layouts`** (`owner_id` PK → auth_users, `keys jsonb`, `updated_at`), **`dividends`**, snapshot columns `dividend_ttm` / `dividend_yield`. Repository `getRatioLayout` / `saveRatioLayout` / `deleteRatioLayout` (owner-scoped) |
| `apps/web/server` | `stock-research.ts` adds `faceValuePaise`, `ratioKeys` (saved or default) and `keyPoints` to `StockPageDto`; `ratio-layout.ts` validates keys against `catalogueFor(isAdmin)` |
| API | `GET` / `PUT /api/stocks/ratio-layout`. The body is Zod `{ keys: string[] }` (3–30, unique). Uses the `handle`/`jsonError` pattern, `no-store`, and `401` comes from the session check like other per-user routes |
| Components | `components/stocks/stock-header.tsx` (header + chips + actions), `ratio-grid.tsx` (view/edit), `profile-card.tsx`, `key-points.tsx`, `monogram.tsx`. `stock-view.tsx` drops its inline header and stat strip |

No worker change for R1–R3.

---

## 7. Phases

| Phase | What ships | Estimate |
| --- | --- | --- |
| **R1 — Header and default grid** | Monogram, name/price, identifier chips, actions, 18-ratio grid (fixed default), Profile, Key points (core function + tests), all three breakpoints, both themes | 2–3 days |
| **R2 — Custom ratios** | Add ratio, Edit ratios (reorder/remove/reset), `user_ratio_layouts` migration, API, optimistic save | 2 days |
| **R3 — Export** | CSV of the visible ratios and profile | ½ day |
| **R4 — Dividend yield (optional, data)** | Parse cash dividends (`Dividend - Rs 19.50 Per Share`, interim/final/special) from the NSE corporate-actions feed we already call. Store them in `corporate_actions` with kind `dividend`. Add catalogue metrics `dividendTtm` (paise) and `dividendYield` (TTM ÷ close) to the snapshot. A purpose text that doesn't parse yields null, never a guess | 2–3 days + backfill |

R1 alone delivers the reference look. R2 adds the reference's "Add ratio" / "Edit
ratios" behaviour.

**Verification for each phase:** unit tests; then load real data with
`scripts/load-stock-analysis.ts` into the local Docker DB; then screenshots at 375,
768, 1280 and 1536px in light and dark themes, for an EQ F&O stock (HDFCBANK), an
EQ non-F&O stock and a BE stock.

---

## 8. Decisions for the owner

1. **Ratio layout scope:** one layout per user, shared across stocks (recommended,
   same as screener.in), or per stock?
2. **Persistence:** server-side per user (recommended; works across devices) or
   browser-only (no migration, but lost on another device)?
3. **R4 dividend yield:** build it from NSE corporate actions? It is the only
   reference ratio our existing data can honestly produce.
4. **Price-history export:** keep it out (recommended until the NSE display/
   redistribution question is settled), or add it?
5. **Key points:** OK to ship computed, evidence-linked facts in place of an
   editorial "Key points"?

## 9. Not possible with Dhan + Fyers + our data

Market cap, Stock P/E, Industry PE, Book value, ROE, ROCE, Debt, company
description, website and logo. BSE code arrives with the multi-exchange branch.
The routes to each (XBRL results parsing, Upstox company profile, a paid vendor) are
in `company-research-implementation-plan.md` §4–§6.
