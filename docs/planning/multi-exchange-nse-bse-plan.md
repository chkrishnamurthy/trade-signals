---
name: Multi-exchange (NSE + BSE)
status: in-progress
horizon: now
created: 2026-09-25
updated: 2026-09-25
phases_total: 9
phases_done: 4
phase_names: [Verification spike, Identity and keys, BSE instrument master, Prices and indices, Signals and indicators, UI, Disclosures parity, Wider segments, Scale and operations]
area: [core, db, providers, worker, web]
blocked_by: []
confidence: 2
summary: Make BSE a first-class exchange alongside NSE for every data type — instruments, prices, indices, signals, disclosures — without showing the same company twice.
owner: krishna
---

# Multi-exchange — NSE and BSE as equals

Status: **in progress — Phases 0–4 built on `feat/multi-exchange-bse`, most of 5 built, 6–8 open** · Date: 2026-09-25
Related: [dhan-provider-plan.md](dhan-provider-plan.md) · [market-data-scaling-plan.md](market-data-scaling-plan.md) ·
[announcement-interpretation-sources.md](announcement-interpretation-sources.md) ·
[institutional-flow-plan.md](institutional-flow-plan.md) · [stock-research-platform-plan.md](stock-research-platform-plan.md)

> **Goal (owner, 2026-09-25):** the application should provide every type of data from
> both exchanges and not be restricted to NSE.
>
> Claims marked **(verify)** have not been checked against the live provider or exchange.
> Phase 0 exists to check them before anything is built.

---

## 1. Where we are today (audit)

The app is NSE-only **by choice, not because of any rule**. Both providers carry BSE
data, and the adapters filter it out.

| Layer | NSE lock-in | File |
|---|---|---|
| Shared types | Already `Exchange = 'NSE' \| 'BSE'` ✅ | `packages/market-data/src/types.ts:13` |
| DB `instruments` | Already has `exchange` + `isin`, unique on `(symbol, exchange)` ✅ | `packages/db/src/schema/instruments.ts:56` |
| Candles, signals, delivery, OI | Keyed by `instrument_id`, so they work for any exchange ✅ | `schema/candles.ts`, `flows.ts`, `signals.ts` |
| `exchange_sessions` | Already has an `exchange` column ✅ | `schema/paper.ts:352` |
| `bulk_block_deals` | Already has an `exchange` column ✅ | `schema/disclosures.ts:133` |
| Fyers symbols | Throws `only NSE symbols are supported` ❌ | `packages/fyers/src/symbols.ts:46` |
| Fyers master | Downloads only `NSE_CM.csv` ❌ | `packages/fyers/src/instruments.ts:16,143` |
| Fyers market status | Checks only exchange code 10 ❌ | `packages/fyers/src/quotes.ts:231` |
| Dhan master | `if exchange !== 'NSE' continue` ❌ | `packages/dhan/src/instruments.ts:189` |
| Dhan segments | Always `NSE_EQ` / `NSE_FNO` ❌ | `packages/dhan/src/symbols.ts:21` |
| **Quote / tick keys** | `QuotesResult.quotes` and `Tick` keyed by **symbol only** ❌ | `types.ts:66-77`, `apps/web/src/server/live-quotes.ts` |
| Web server | Hardcoded `exchange: 'NSE'` ❌ | `watchlists.ts:305,345,458`, `search.ts:122`, `stock-detail.ts:106` |
| Universe config | `indices.yaml` constituents have no exchange ❌ | `apps/worker/src/universe.ts` |
| Calendar | Only `config/nse-calendar.yaml` ❌ | `config/` |
| Announcements | **BSE only.** NSE announcements not connected ⚠️ | `apps/worker/src/sources/india-disclosures.ts` |
| Deals, delivery, shareholding, participant OI | **NSE only** ⚠️ | same |

**Main finding:** the database is already mostly ready for more than one exchange.
The real blockers are:
1. The provider adapters filter BSE out.
2. **Quotes and ticks are keyed by symbol alone.** `RELIANCE` on NSE and `RELIANCE` on
   BSE would overwrite each other in every map on the live path.

---

## 2. Design decisions

### 2.1 One company, many listings

Most Indian companies of interest are listed on both exchanges. Showing them twice would
be noise. The model is:

- **Company:** one row per ISIN. This is what the user thinks of as "the stock".
- **Listing:** one row in `instruments` per (company, exchange). This is what has prices.
- **Primary listing:** the listing used by default for signals, indicators and the
  watchlist row.

**Rule for the primary listing (owner decision D1):** NSE when the company is listed on
NSE, otherwise BSE. NSE carries most cash-equity volume, so its prices give cleaner volume
and breakout signals. BSE-only companies (small caps and many Z/T/X-group names) then get
full coverage on BSE.

### 2.2 Keys: never "symbol" alone again

Introduce a **listing key**, `EXCHANGE:SYMBOL` (for example `NSE:RELIANCE` or
`BSE:RELIANCE`). It is ours, not a provider format, so it stays on our side of the provider
boundary. It replaces bare `symbol` as the key in:
- `QuotesResult.quotes` and `Tick`
- the live-quote hub's maps
- SSE payloads and the watchlist join (`watchlists.ts:201`)

`InstrumentRef.exchange` becomes **required**. Today it is optional and silently means
NSE.

### 2.3 Our symbol for BSE listings

BSE has two identifiers: a 6-digit **scrip code** (`500325`), which is stable, and a
**scrip ID** (`RELIANCE`), which reads like a ticker.
- `instruments.symbol` = the BSE scrip ID, so users see readable symbols.
- New column `instruments.exchange_code` = the scrip code. It is the stable join key for
  BSE filings, bhavcopy files and deals. It is an exchange identifier, not a provider one,
  so it may live outside the adapters.
- A BSE scrip ID can match an NSE ticker that belongs to a *different* ISIN. Phase 0
  counts how often this happens. Company URLs use a company slug that is unique across
  companies (§2.6), so this never becomes ambiguous.

### 2.4 End-of-day prices for the whole universe come from the bhavcopy

BSE has roughly 4,000+ actively traded equities (verify). Fetching daily bars for each one
through the provider would use up the Fyers and Dhan request budgets
(see market-data-scaling-plan). Since July 2024, both exchanges publish the end-of-day
**bhavcopy** (the daily closing-price file) in the common UDiFF format (verify).

- **Daily candles for every listing** come from one bhavcopy file per exchange per day,
  through a new provider-neutral `EodFileSource`.
- **The provider APIs** remain the source for intraday bars, quotes and the live stream,
  used only for names someone is looking at or following.
- The existing `cross-check-bars` job compares bhavcopy candles with provider bars for a
  sample and logs mismatches. It never rewrites candles (hard rule 5).

### 2.5 Live-stream routing

The Fyers socket is limited to 200 symbols. The Dhan socket allows 5,000
(dhan-provider-plan). BSE listings stream through **Dhan** (`MARKET_DATA_ROUTE_STREAM`).
Only listings that are on screen or in a watchlist are subscribed, never the whole
universe.

### 2.6 URLs and search

- `/stocks/{slug}`, where the slug is unique per company. It defaults to the NSE symbol,
  or to the BSE scrip ID for BSE-only companies. On a collision, the BSE-only company gets
  `-bse`.
- A **listing switcher** (`NSE | BSE`) on the stock page changes which listing's prices
  are shown. A query parameter keeps it shareable: `?listing=BSE`.
- Search returns **one result per company**, with badges showing its listings. Searching
  by BSE scrip code (`500325`) also works.

### 2.7 Hard rules still hold

| Rule | How BSE complies |
|---|---|
| 1 Pure core | `packages/core` never sees an exchange-specific code path. It receives bars and config. |
| 2 Closed candles | Unchanged. BSE session times match NSE's 09:15–15:30 (verify, including pre-open). |
| 3 Integer paise | BSE prices parse to paise. The tick size per listing is stored in paise. |
| 4 Only 1m and 1d stored | Daily candles for every listing. 1-minute candles **only** for followed listings, since 1-minute data for ~4,000 BSE names is not justified. |
| 5 Never mutate history | Corporate actions are keyed per listing and fanned out from the company, applied on read. |
| 6 UTC | Unchanged. |
| 7 Versioned strategy | Adding BSE to the signal universe creates a new `strategy_versions` row. |
| 8 Factor breakdown | Unchanged. Each signal records which listing it was computed on. |
| Provider boundary | BSE symbol formats (`BSE:X-A`, `BSE_EQ`, security IDs) stay inside the adapters. |

---

## 3. Data-type coverage matrix (the "all data" target)

| Data type | NSE today | BSE target | Source (verify all in Phase 0) | Phase |
|---|---|---|---|---|
| Instrument master | ✅ | ✅ | Fyers `BSE_CM.csv`; Dhan scrip master `BSE_EQ` rows | 2 |
| Live quotes | ✅ | ✅ | Fyers / Dhan quote APIs | 3 |
| Live stream | ✅ | ✅ | Dhan socket (§2.5) | 3 |
| Daily candles | ✅ | ✅ | UDiFF bhavcopy + provider backfill | 3 |
| Intraday 1m | ✅ | ✅ (followed only) | Fyers / Dhan history | 3 |
| Indices | NIFTY family | SENSEX, BANKEX, BSE 100/200/500, MidCap, SmallCap, sectoral | Fyers `BSE:SENSEX-INDEX`; Dhan `IDX_I` | 3 |
| Market status / calendar | ✅ | ✅ | Per-exchange calendar YAML + provider status | 2 |
| Indicators and signals | ✅ | ✅ on primary listing | Existing engine | 4 |
| Corporate announcements | ❌ (not connected) | ✅ (exists) | NSE corporate-announcements; BSE `AnnGetData` | 6 |
| Corporate actions | partial | ✅ | NSE and BSE corporate-action feeds | 6 |
| Bulk and block deals | ✅ | ✅ | BSE daily bulk/block files | 6 |
| Delivery % | ✅ | ✅ | BSE delivery-position file | 6 |
| Shareholding | ✅ (promoter/public only) | ✅ | BSE shareholding-pattern pages (may give a fuller category split) | 6 |
| Financial results | ❌ | ❌ | Company-level; belongs to the fundamentals plan, not the exchange | — |
| FII/DII cash flows | ✅ | n/a | NSE already publishes a combined NSE+BSE+MSEI figure, so no BSE feed is needed | — |
| Participant OI, stock futures OI | ✅ NSE F&O | BSE F&O (SENSEX/BANKEX) | BSE derivatives files; Dhan `BSE_FNO` | 7 |
| SME boards | ❌ | NSE Emerge + BSE SME | Both masters (currently dropped) | 7 |
| ETFs, REITs, InvITs | ❌ | both | Both masters | 7 |
| Debt, currency, commodity | ❌ | ❌ | **Out of scope:** not equities; the product is an equity screener | — |

---

## 4. Phases

### Phase 0 — Verification spike (no product change)
A throwaway script that writes to the scratchpad only. It confirms or rejects every
**(verify)**:
1. The Fyers BSE symbol format (`BSE:RELIANCE-A`? suffix by group?) and `BSE_CM.csv` columns.
2. Dhan `BSE_EQ` quotes, daily and 1-minute history depth, and the securityIds for SENSEX
   and BANKEX.
3. Whether the UDiFF bhavcopy for both exchanges can be fetched **from the VPS**, and its
   column set.
4. Endpoints for BSE deals, delivery, corporate actions and shareholding, and whether the
   VPS can reach them.
5. The size of the BSE universe by group (A/B/T/X/XT/Z/M…) and the dual-listing overlap by
   ISIN.
6. The collision count: BSE scrip IDs equal to an NSE ticker with a different ISIN.
7. 2026 BSE holidays compared with NSE's list, BSE pre-open and session times, and any
   differences in tick size and price band.
8. **Licensing:** what BSE's data-vending policy says about showing its data publicly.

**Exit:** a findings section appended to this document, and D1–D6 answered.

### Phase 1 — Identity and keys (no visible change)
- Migration: `companies (id, isin UNIQUE, name, slug UNIQUE, primary_instrument_id)`;
  add `instruments.company_id`, `instruments.exchange_code` and `instruments.series_group`
  (NSE series / BSE group). Additive only. Backfill companies from existing NSE rows.
- Make `InstrumentRef.exchange` required. Key `QuotesResult` and `Tick` by listing key.
  Refactor the live-quote hub, SSE DTOs and the watchlist join. Remove the hardcoded
  `'NSE'` values from `watchlists.ts`, `search.ts` and `stock-detail.ts`.
- Add `exchange` to universe entries in `indices.yaml` and `universe.ts`.

**Exit:** every test passes, the production UI is unchanged, and no bare-symbol map is
left on the price path.

### Phase 2 — BSE instrument master and calendar
- The Fyers and Dhan adapters stop filtering BSE out. `listInstruments()` returns both
  exchanges. Symbol mapping for BSE equities and indices lives inside each adapter.
- An instrument-sync job links listings to companies by ISIN and sets primary listings
  (D1).
- Per-exchange calendars: `config/bse-calendar.yaml` (or one file keyed by exchange).
  `calendar-refresh` writes one `exchange_sessions` row per exchange. Market status is
  read per exchange.

**Exit:** the BSE listing count matches Phase 0, and every dual-listed company has exactly
one company row.

### Phase 3 — Prices and indices
- `EodFileSource` with a bhavcopy parser for each exchange (pure and tested with
  fixtures), and a daily job that writes daily candles for **every** active listing.
- Backfill BSE-only daily history from the provider, rate-limited and resumable.
- Quotes and live stream for BSE through routing (§2.5).
- Add SENSEX and BANKEX to `headlineIndices`, and add BSE index blocks to `indices.yaml`.

**Exit:** the `cross-check-bars` sample agrees within tolerance, and the SENSEX tile is
live in the index strip.

### Phase 4 — Signals and indicators
- The daily pass computes indicators for every primary listing, which includes BSE-only
  names.
- Create a new strategy version for the widened universe.
- Illiquid-name guard: suppress or flag signals on trade-for-trade (T/XT/Z) groups and on
  names with low average value traded. Thresholds go in versioned config (D4).

**Exit:** signals for BSE-only names with a full factor breakdown, and no duplicate signal
for a dual-listed company.

### Phase 5 — UI
- Search: one row per company, with listing badges and search by scrip code.
- Stock page: `NSE | BSE` switcher, with the price spread between the two listings shown
  for information only.
- Watchlists: when adding a company, choose the listing (default primary). The exchange
  column and filter already exist.
- Index strip: SENSEX. Update `/data-sources`, `/methodology` and the copy on
  `/announcements`.
- QA at mobile and desktop widths, in light and dark themes.

### Phase 6 — Disclosures parity
- Connect NSE announcements. **Group, never merge,** duplicates across exchanges (same
  company, close timestamps, similar subject). Both originals stay linked.
- Add BSE bulk/block deals, BSE delivery and corporate actions from both exchanges, all
  resolved to companies by scrip code or ISIN.
- Shareholding: prefer whichever exchange gives the fuller category split, and record
  which source was used.

### Phase 7 — Wider segments (each behind a flag)
- SME boards (NSE Emerge, BSE SME): lot sizes, lower liquidity, and a clear badge.
- ETFs, REITs and InvITs, as their own instrument `kind`.
- BSE F&O (SENSEX/BANKEX): participant OI and futures OI. **Admin-only**, the same stance
  as intraday.

### Phase 8 — Scale and operations
- Storage: estimate daily and 1-minute growth, and confirm that compression policies cover
  the new rows.
- Request budgets: provider calls per day before and after the change, with the bhavcopy
  taking the bulk of the load.
- Health: record success or failure per exchange and per feed. Alert when a bhavcopy is
  missing on a trading day.
- Docs: update `CLAUDE.md` ("NSE equities" → "NSE and BSE equities"), the
  `signal-invariants`, `provider-boundary` and `database` skills, and
  `docs/operations/deployment.md`.

---

## 4a. Phase 0 findings (2026-09-25, live downloads from the dev machine)

**Owner decisions:** D1 = NSE when listed there, otherwise BSE. D2 = every BSE listing
(recommended default, question left open by owner). D3 = ETFs, REITs/InvITs and SME
boards, not BSE F&O. D4 = flag, don't suppress. D5 = defer BSE F&O. D6 = the owner said
"proceed to implement", taken as approval of the CLAUDE.md wording.

| # | Question | Finding |
|---|---|---|
| 1 | Fyers BSE format | ✅ `BSE:<SCRIPID>-<GROUP>`, e.g. `BSE:360ONE-A`, `BSE:3IINFOLTD-T`. Indices: `BSE:SENSEX-INDEX`, `BSE:BANKEX-INDEX` (58 BSE indices). Master `https://public.fyers.in/sym_details/BSE_CM.csv` has the same 21 columns as NSE. Exchange code **12**; col 12 = BSE scrip code; col 13 = scrip ID. |
| 1b | Fyers instrument type | ⚠️ Type `0` only covers groups A and T. B/X/XT/Z/M/MT/P… equities are type `50`, mixed with debt (group F), G-secs (G) and MF units. **Classify BSE equity by ISIN security-type digits `[7:9] == '01'` (INE…01…)** plus an allow-list of groups. |
| 2 | Dhan BSE | ✅ `EXCH_ID=BSE, SEGMENT=E`. `SECURITY_ID` **is the BSE scrip code** (RELIANCE = 500325). Group is in `SERIES`. Indices `EXCH_ID=BSE, SEGMENT=I`: SENSEX = 51, BANKEX = 69, BSE500 = 67 (71 total). Dhan uses a `$` suffix on colliding scrip IDs (`KALYANI$`). Series `NS`/`NT` (684 rows) are not in Fyers' set: excluded until understood. |
| 3 | Bhavcopy (UDiFF) | ✅ Both reachable from the dev machine with browser headers. BSE: `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_YYYYMMDD_F_0000.CSV` (plain CSV, ~850 KB). NSE: `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F_0000.csv.zip`. **Same 34-column UDiFF header on both.** `FinInstrmId` = scrip code (BSE) / token (NSE). **Reachability from the VPS still needs checking.** |
| 5 | Universe size | BSE equities (ISIN type 01, Fyers): **4,766**. Dual-listed with NSE: **2,453**. **BSE-only: 2,313** (X 1,122 · XT 463 · M 392 · MT 141 · B 65 · P 56 · Z 42 · T 13 · A 2). On 2026-09-24, **4,277** BSE equities traded (1,870 BSE-only) vs 3,027 on NSE. |
| 6 | Collisions | **7** BSE scrip IDs equal an NSE ticker with a different ISIN (FOCUS, GSTL, KALYANI, MAL, RAJPUTANA, SEL, ZEAL). **0** dual-listed companies have different IDs on the two exchanges in the Fyers master. The listing key + company slug handles all 7. |
| 7 | Session / tick | Every BSE equity row: `0915-1530\|1815-1915` (same as NSE). Tick sizes ₹0.01 (2,516) or ₹0.05 (2,250). The BSE holiday list still has to be checked by the operator. |
| 8 | Licensing | ❓ Open. Unchanged from NSE: display rights need an exchange agreement or vendor. |

## 4b. Implementation status (2026-09-25, branch `feat/multi-exchange-bse`)

**Built and unit-tested (all suites green except 3 pre-existing, unrelated failures in
`apps/web/src/server/disclosures.test.ts`):**

- **Phase 1 — keys.** `listingKey` / `parseListingKey` / `exchangeOf` in `@equitywise/shared`
  (re-exported by market-data). `Quote` and `Tick` carry `exchange`; `QuotesResult` and
  `missing` are keyed by listing key. **Deviation from §2.2:** the NSE key is the BARE symbol, not
  `NSE:X`, so every existing key, URL, stored payload and the mobile API stay valid; BSE is
  `BSE:X`. `InstrumentRef.exchange` stays optional and defaults to NSE (`exchangeOf`), instead of
  becoming required. **Deviation from §2.1:** no `companies` table yet; the company is the ISIN,
  grouped at read time (search, compute-indicators). Migration `0026` adds
  `instruments.exchange_code` + `instruments.series` and ISIN/code indexes (hand-written, as
  since 0018).
- **Phase 2 — masters.** Fyers reads `BSE_CM.csv` (equity = ISIN type `01` + main-board group);
  BSE equity tickers are resolved via the cached master because their group suffix changes.
  Dhan keeps `BSE_EQ` rows + BSE indices, index keyed by exchange; feed segment code 4 decodes
  as `BSE_EQ`. Numbered Fyers BSE indices alias to Dhan's names (`BSE:500-INDEX` → `BSE500`).
- **Phase 3 — prices.** `apps/worker/src/sources/bhavcopy.ts` (UDiFF parser, both exchanges)
  + `jobs/ingest-bhavcopy.ts` (daily 19:30/21:30 IST, calendar-gated, feed health recorded) +
  `backfill-bhavcopy` (on demand, ~430 days). SENSEX in the index strip (slot 2).
- **Phase 4 — signals.** Indicators for every listing with history; signals only on the
  primary listing (`secondaryListings`). Trade-for-trade flag `isTradeForTrade`.
- **Phase 5 (partial) — UI.** Search returns one row per company with listing badges and
  `key`; `BSE:` queries search BSE only; import resolves by ISIN to the primary listing; add /
  chart / live quotes use listing keys; watchlist rows carry `series` + `lowLiquidity` with a
  "Low liquidity" badge; strip status "NSE & BSE". `/data-sources` copy updated. Also fixed a
  pre-existing dark-mode bug: `--warning-foreground` was near-invisible on `--warning-soft`.
- **Worker safety.** Every `symbol → id` map that could now see a BSE row was re-keyed
  (`ingest-daily`, `ingest-futures-oi`, `feed`); `syncInstruments` deactivates per listing.

**Not yet done:**
- **Deploy prerequisites:** apply migration 0026 (the deploy does this), then run
  `--once backfill-bhavcopy` once on the VPS so BSE listings have history.
  **Check first that the VPS can reach `www.bseindia.com` and `nsearchives.nseindia.com`**
  (only checked from the dev machine).
- Live verification of BSE quotes/bars/stream against Fyers and Dhan with real credentials.
  Only the public masters and bhavcopies were checked live; adapter behaviour is covered by
  unit tests.
- DB integration tests (`packages/db/src/__tests__/listings.test.ts`) were written but not run
  (no Docker on the dev machine): `pnpm test:integration`.
- Stock page `NSE | BSE` switcher (§2.6); `BSE` badge + scrip-code search in the global
  `StockSearch`; marketing/SEO copy that still says "NSE" (landing, about, layout metadata),
  which is a positioning decision.
- Phases 6 (NSE announcements, BSE deals/delivery/corporate actions), 7 (SME, ETFs,
  REITs/InvITs per D3) and 8.
- BSE holiday list checked against NSE's (the gate uses the NSE calendar).
- `.claude/skills` (`signal-invariants`, `provider-boundary`, `database`) still describe
  NSE-only symbols; that directory is write-protected in this session.

## 5. Risks

| Risk | Mitigation |
|---|---|
| **Licensing.** Public display of exchange data needs an exchange agreement or an authorised vendor (applies to NSE already) | Phase 0 item 8. BSE does not make this worse, and does not fix it either. Decide before public launch. |
| Duplicate companies in the UI | Company/listing model and one-row search (§2.1) |
| Symbol collisions between exchanges | Listing key + company slug (§2.2, §2.6) |
| BSE website endpoints change their handshake | Every transport throws and is tracked per feed. Parsers stay pure. |
| Illiquid BSE names produce junk signals | Liquidity guard in versioned config (Phase 4) |
| Rate limits | Bhavcopy for EOD; stream only followed listings |
| Survivorship bias | Delisted BSE listings are set `active = false`, never deleted |

## 6. Owner decisions

- **D1** Primary listing is NSE when listed there, otherwise BSE? *(recommended: yes)*
- **D2** Keep daily candles for **every** BSE listing, or only groups A/B plus followed
  names? *(recommended: every listing; the bhavcopy makes it cheap)*
- **D3** Include SME boards and ETFs/REITs in Phase 7? *(recommended: ETFs yes, SME behind
  a flag)*
- **D4** Signal policy for T/XT/Z trade-for-trade groups: suppress or flag?
  *(recommended: flag)*
- **D5** BSE F&O: build now as admin-only, or defer? *(recommended: defer until Phases 1–6
  ship)*
- **D6** Approve the `CLAUDE.md` wording change from "NSE equities" to "Indian (NSE + BSE)
  equities".

Recommended order: Phase 0 → 1 → 2 → 3 → 5 (search, stock page, index strip) → 4 → 6 →
8 → 7. Phase 1 has the highest risk and no visible payoff, but everything else depends on
it.
