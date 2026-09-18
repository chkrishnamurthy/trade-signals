---
name: Institutional flow
status: in-progress
horizon: now
created: 2026-09-17
updated: 2026-09-17
board: EW-082
phases_total: 5
phases_done: 4
phase_names: [Verify, Free spine + health, Dhan futures OI, Page redesign, Options]
area: [web, worker, db]
blocked_by: [dhan-provider-plan]
confidence: 2
summary: "/flows rebuilt on Dhan + NSE archive files: delivery, participant OI, bulk/block deals, futures OI build-up. Phase 4 (option chain) optional."
owner: krishna
---

# Institutional Flow (`/flows`) — research, verdict, and replan

**Status:** **Phases 0–3 built** on branch `feat/institutional-flow` (2026-09-17), verified end-to-end against an ephemeral TimescaleDB with live NSE files and live Dhan calls · Phase 4 (option chain) not started · **Date:** 2026-09-17
**Question asked:** Now that we pay for Dhan's Data API, can it make the Institutional
Flow page better? And can the page's existing data and design be restructured?
**Related:** [dhan-provider-plan.md](dhan-provider-plan.md) ·
[announcement-interpretation-sources.md](announcement-interpretation-sources.md)

> Every Dhan fact below was checked against `dhanhq.co/docs/v2` on 2026-09-17.
> Anything not confirmed from a primary source is marked **(verify)**.

---

## 0. The answer in five sentences

1. **Dhan does not carry any of the data the page shows today.** Its Data API has no
   FII/DII figures, no bulk/block deals, no shareholding, no delivery volume. Those are
   exchange *disclosures*; Dhan only redistributes *market data*.
2. **Dhan does carry the one thing the page is missing: derivatives positioning.**
   Stock-futures open interest (daily history with `oi: true`, live via quote) and the
   per-strike option chain (OI, previous-day OI, IV, volume). From these we can compute
   the standard "where is the big money positioned" read — OI build-up per stock, PCR,
   max pain — which is what every Indian terminal means by institutional flow.
3. **The free spine is fragile and partly dead.** FII/DII and deals come from
   `nseindia.com/api/*` React endpoints behind a cookie handshake, fail *silently*
   (`safe()` swallows errors, no health row), and shareholding is a stub returning `[]`.
   The fix is NSE's daily archive CSVs, which also add **delivery %** and
   **participant-wise OI** (FII/DII/Pro/Client long-short) — two datasets far more
   useful than what we have and still free.
4. **The page structure is wrong for the product's three questions.** It is four
   unrelated tables stacked; nothing answers "which stock deserves attention" or "why".
   The replan makes a **per-stock ranked table** the centre, with a **market tape** above
   and a **stock drawer** for the why.
5. **Do it in this order:** free-data restructure + feed health (no Dhan needed) →
   Dhan futures OI + build-up → page redesign → option chain last, if at all.

---

## 1. What the page is today

| Section | Data | Source & state |
| --- | --- | --- |
| FII / DII activity | Daily cash net, market-wide, 30 sessions | `nseindia.com/api/fiidiiTradeReact`, gated JSON, fail-soft, **no health record** |
| Top institutional parties | Net by client name across recent deals | Derived; the label is inaccurate — many parties are prop desks / individuals |
| Bulk & block deals | Last 100 deals, 4 filter groups | `nseindia.com/api/historical/{bulk,block}-deals`, gated JSON, fail-soft |
| Shareholding pattern | Quarterly %, watchlist names only | `fetchShareholding` returns `[]` — **populated only by a seed script** |

Files: [flow-view.tsx](../../apps/web/src/components/disclosures/flow-view.tsx),
[disclosures.ts (server)](../../apps/web/src/server/disclosures.ts),
[india-disclosures.ts](../../apps/worker/src/sources/india-disclosures.ts),
[disclosures.ts (schema)](../../packages/db/src/schema/disclosures.ts),
[flow-analytics.ts](../../apps/web/src/lib/flow-analytics.ts).

Design problems, in order of how much they hurt:

1. **No stock-level answer.** The product asks "which stocks deserve attention, and why".
   The page cannot answer either; deals are a flat ledger and everything else is
   market-wide or quarterly.
2. **Same data three times.** FII/DII gets a chart, two cards, and a 30-row table.
3. **The scope toggle applies to two of four sections**, silently.
4. **Freshness is one banner for four feeds**, and a silently failing feed reads as
   "stale" with no reason.
5. **The deals table is 8 columns with the party name truncated at 14rem** — the party is
   the most interesting column.
6. **Shareholding is empty in production** (stub source), and shows no change over time —
   a snapshot without a Δ says nothing about flow.
7. Mobile: four horizontally-scrolling tables. The mobile app is coming; this page must
   collapse to cards.

> **Unverified:** I could not read production row counts from this session (the SSH
> tunnel is closed and a direct read was declined). Before Phase 0, run the query in §9
> on the VPS to confirm which feeds are actually delivering.

---

## 2. What Dhan v2 actually offers (verified)

| Endpoint | Fields relevant here | Limits | Useful for |
| --- | --- | --- | --- |
| `POST /v2/marketfeed/quote` | `volume`, `average_price` (VWAP), `buy_quantity`, `sell_quantity`, 5-level `depth`, `oi`, `oi_day_high`, `oi_day_low`, circuit limits | 1,000 instruments/call, 1 call/s | Live OI on futures; order-book imbalance (intraday, transient) |
| `POST /v2/charts/historical` + `oi: true` | daily `open/high/low/close/volume/open_interest` | needs `NSE_FNO` securityId + `expiryCode` | **Daily futures OI history per stock** → OI build-up |
| `POST /v2/charts/intraday` + `oi: true` | 1/5/15/25/60-min OHLCV + OI | 90-day windows | Intraday OI (not needed for this page) |
| `POST /v2/optionchain` | per strike CE/PE: LTP, `oi`, `previous_oi`, `volume`, `previous_volume`, IV, greeks, top bid/ask | **1 request per 3 s** | PCR, max pain, OI concentration |
| `POST /v2/optionchain/expirylist` | active expiries | same | expiry resolution |
| Live socket Full packet (code 8) | LTP, VWAP, volume, total buy/sell qty, OI, OI day hi/lo, 5-level depth | 5,000 symbols/connection | Live OI if we ever want it |
| Full Market Depth (20-level) | separate socket | — | Not needed |

**Not in Dhan (confirmed by docs navigation):** FII/DII, bulk/block deals, shareholding,
delivery quantity/percentage, participant-wise OI, fundamentals, holdings. Historical
candles have no delivery field.

**What the adapter lacks today:** `packages/dhan` resolves only `NSE_EQ` and `IDX_I`
([symbols.ts](../../packages/dhan/src/symbols.ts)), and `candles.ts` hard-codes
`oi: false`. Futures OI needs (a) `NSE_FNO` rows from the scrip master, (b) an
underlying → current-month `FUTSTK` securityId map refreshed daily (expiry rolls), and
(c) an `oi` option on the bars request. None of this leaks a Dhan type past
`packages/providers-dhan`; the neutral contract gains a `fetchDerivativeBars` /
`fetchOptionChain` capability the router can route to Dhan only.

---

## 3. What the free spine should become

Replace the gated `nseindia.com/api/*` React endpoints with NSE's static daily archives.
They are plain CSV downloads, published once per session, and have no client-side
session dance **(verify from the VPS — NSE has tightened bot rules before)**.

| Dataset | Archive file (pattern) | New to us? | What it gives |
| --- | --- | --- | --- |
| **Delivery data** | `sec_bhavdata_full_DDMMYYYY.csv` — `DELIV_QTY`, `DELIV_PER`, `TTL_TRD_QNTY`, `AVG_PRICE` | **Yes** | Per-stock delivery % — the best free single-name proxy for accumulation vs churn. Published ~18:30–19:00 IST |
| **Participant-wise OI** | `fao_participant_oi_DDMMYYYY.csv` — FII / DII / Pro / Client × long/short × index fut, stock fut, index CE/PE, stock CE/PE | **Yes** | The real "FII positioning" figure pros quote (FII index-futures net long/short). Market-wide |
| Bulk / block deals | `bulk.csv`, `block.csv` (daily snapshot) | Same data, stabler transport | Same as today |
| FII / DII cash | `fiidiiTradeReact` stays (no archive equivalent known) **(verify)**; add a health record | Same | Same as today |
| Shareholding | Keep quarterly, stays on the main page (D2). Source must be wired for real in Phase 1 (§4.5) | Source fix | Trend, not flow — add QoQ Δ |

**Every feed gets a health row.** Generalise `announcement_ingestions` into
`feed_ingestions(feed, started_at, completed_at, succeeded, fetched, written, error)`
and stop swallowing errors in `safe()`. The page then shows *why* something is stale.

Licensing caveat is unchanged from the announcements research: public availability does
not establish redistribution rights. Same caveat applies to showing Dhan-derived OI to
public users (see dhan-provider-plan §9). Neither blocks building; both need resolving
before public launch.

---

## 4. The page, replanned

Three questions → three layers. Everything below the tape is per-stock.

### 4.1 Market tape (top, one row)

Stat tiles, each with a 20-session sparkline and a one-line breakdown on hover/tap:

| Tile | Value | From |
| --- | --- | --- |
| FII cash | today's net · 5-session sum · 20-session sum | fii_dii_flows |
| DII cash | same | fii_dii_flows |
| FII index futures | net long − short contracts, Δ vs yesterday | participant OI (new) |
| Nifty PCR | OI put/call ratio, Δ | Dhan option chain (Phase 4, optional) |

Below the tiles, **one** chart: FII and DII daily net as grouped bars, cumulative toggle.
The 30-row sessions table goes behind a "Show sessions" disclosure.

### 4.2 Stocks with institutional footprints (the centre of the page)

One ranked table. Default scope: **market-wide F&O + any stock with a deal today**;
toggle: *Names I follow*. Columns:

| Column | Source | Display |
| --- | --- | --- |
| Stock (★ if followed) | — | symbol + name |
| Delivery % | delivery_stats | today vs 20-session average, e.g. `68% ▲ (avg 41%)` |
| Futures OI | derivative_oi_daily | ΔOI % + **build-up label**: Long build-up · Short build-up · Short covering · Long unwinding |
| Deals | bulk_block_deals | net ₹ Cr and count, e.g. `+₹42 Cr (3)` |
| Price | daily_candles | close, Δ% |
| Attention | computed | ranked score **with its factor chips** (rule: no unexplained number) |

Filters: scope (all / followed) · signal (any / delivery spike / OI build-up / deal
today) · sort by any column. Rows expand into the stock drawer.

"Attention" is a transparent sum of normalised factors: delivery-% z-score, |ΔOI|
z-score, deal value relative to average turnover. It is ordering, not confidence, and it
renders only with its chips. This is a `packages/core` pure function with fixtures.

### 4.3 Stock drawer (the why)

Opens from a row, or from `/flows?symbol=RELIANCE`:

- 20-session **delivery %** bars with the trailing average line
- **Price + futures OI** dual chart, each session tagged with its build-up label
- **Deals for this name**, full party names, grouped by session
- **Shareholding trend**: promoter / FII / DII / public over the last 8 quarters as a
  small stacked chart (the main-page table stays too — D2)
- Links: announcements for this name, the watchlist detail

### 4.4 Deals ledger (secondary)

Kept, simplified: grouped by session, party name at full width, value as the primary
number, qty × price as a caption, one filter row (side · type · min value) plus a
search box. "Top institutional parties" becomes **"Most active parties (30 sessions)"**
— honest naming; a party is labelled institutional only when we can classify it
(later, from a small curated list: mutual funds, FPIs, insurers).

### 4.5 Shareholding pattern (kept on the main page — D2)

Stays as its own section below the ledger, for followed names, as today. Since its
source is a stub, Phase 1 must wire a real feed (NSE `corporate-share-holdings-master`
or BSE per-scrip, **(verify)** which is reachable from the VPS) or the section keeps
reading "No shareholding data yet". Add a quarter-on-quarter Δ column for FII % and
DII % so the table says something about flow, not just a snapshot.

### 4.6 Freshness

One chip per feed in the page header — `FII/DII 16 Sep · Deals 16 Sep · Delivery 16 Sep
· OI 16 Sep` — green/amber/red from `feed_ingestions`, with the failure reason in a
tooltip. Replaces the single banner.

### 4.7 Layout & mobile

- Desktop: tape → ranked table → drawer as a right-side sheet; ledger below.
- Phone: tiles scroll horizontally; the ranked table becomes cards (stock, three
  metric pills, attention chips); drawer is a bottom sheet; ledger cards.
- Colour: net buying/accumulation green, net selling/distribution red, everywhere;
  build-up labels use the same pair (long build-up / short covering green, short
  build-up / long unwinding red).
- Vocabulary stays technical ("build-up", "delivery", "net"); BUY/SELL appears only on a
  deal's side badge, which describes the reported trade, not a signal.

---

## 5. Schema additions (Drizzle, all upserts on natural keys)

```
delivery_stats            (instrument_id, trading_date) PK
  traded_qty bigint, deliverable_qty bigint, delivery_pct double, avg_price_paise int,
  source text, ingested_at timestamptz

derivative_oi_daily       (instrument_id, trading_date, expiry_date) PK
  futures_oi bigint, oi_change bigint, close_paise int, close_change_paise int,
  buildup text  -- 'long_buildup' | 'short_buildup' | 'short_covering' | 'long_unwinding' | null
  source text, ingested_at timestamptz

participant_oi            (trading_date, participant, bucket) PK
  participant text  -- 'fii' | 'dii' | 'pro' | 'client'
  bucket text       -- 'index_fut' | 'stock_fut' | 'index_ce' | 'index_pe' | 'stock_ce' | 'stock_pe'
  long_contracts bigint, short_contracts bigint, source text, ingested_at timestamptz

option_chain_daily        (instrument_id, trading_date, expiry_date) PK   -- Phase 4 only
  pcr_oi double, pcr_volume double, max_pain_paise int, total_ce_oi bigint, total_pe_oi bigint,
  source text, ingested_at timestamptz

feed_ingestions           id, feed text, started_at, completed_at, succeeded bool,
                          fetched int, written int, error text
```

Money stays integer paise; percentages are doubles (dimensionless, as with
shareholding); dates are IST trading-date keys; timestamps UTC. `buildup` is computed in
`packages/core` from two *closed* daily bars and stored with the row so the UI never
recomputes (same discipline as `signal_factors`).

---

## 6. Worker jobs (croner, IST)

| Job | When | Source | Notes |
| --- | --- | --- | --- |
| `ingest-bhavcopy` | 19:10 Mon–Fri | NSE archive CSV | delivery_stats; retry at 20:10 if 404 (late publish) |
| `ingest-participant-oi` | 19:20 Mon–Fri | NSE archive CSV | participant_oi |
| `ingest-deals` | 18:50 Mon–Fri (exists) | switch to archive CSV | health row |
| `ingest-fii-dii` | 19:45 Mon–Fri (exists) | unchanged | health row |
| `ingest-futures-oi` | after `ingest-daily` completes | Dhan `charts/historical`, `oi: true`, current-month FUTSTK | ~190 F&O names, 5 req/s (run at half) ≈ 1–2 min; classify build-up in core; upsert |
| `refresh-fno-map` | 06:30 daily | Dhan scrip master | underlying → FUTSTK securityId for current/next expiry; fails loudly on a stale master |
| `ingest-option-summary` | 19:30 Mon–Fri (Phase 4) | Dhan `optionchain` | 1 req / 3 s → ~190 names ≈ 10 min, one expiry each |

Jobs run only on closed sessions (hard rule 2 — the daily bar and its OI are final after
close). No job on this page ever calls a provider at request time.

---

## 7. Pure core (with hand-computed fixtures)

- `classifyOiBuildup({ closeChange, oiChange })` → the four labels or `null` when either
  Δ is zero / missing.
- `deliveryAnomaly(today, trailing[])` → z-score and ratio vs 20-session mean.
- `attentionScore(factors)` → `{ score, factors: [{ name, value, contribution }] }`.
- `pcr(chain)`, `maxPain(chain)` — Phase 4.

All take data plus config, return results, no clock, no I/O.

---

## 8. Phasing

| Phase | Scope | Depends on Dhan? | Value |
| --- | --- | --- | --- |
| **0 — Verify (1–2 days)** | From the VPS: archive CSV URLs for bhavdata / participant OI / bulk / block reachable? Dhan `charts/historical` with `oi: true` on one `FUTSTK` returns OI? `optionchain` works for a stock underlying (`NSE_FNO`)? Run §9 query. | Yes (read-only probes) | Removes every **(verify)** above |
| **1 — Free spine + health** | `feed_ingestions`; archive transport for deals; `delivery_stats` + `participant_oi` jobs; freshness chips | No | Highest value per effort; fixes silent failures; adds the two best free datasets |
| **2 — Dhan futures OI** | `NSE_FNO` in the adapter, F&O map job, `ingest-futures-oi`, `classifyOiBuildup`, `derivative_oi_daily` | Yes | The reason we pay for Dhan shows up on this page |
| **3 — Page redesign** | Tape · ranked table with attention chips · stock drawer · simplified ledger · shareholding section with QoQ Δ · mobile cards | No | Can start alongside 1–2 against fixtures |
| **4 — Options (optional)** | `option_chain_daily`, Nifty PCR tile, per-stock PCR/max-pain in the drawer | Yes | Nice-to-have; slow endpoint; decide after 1–3 ship |
| Not planned | Live order-book imbalance (`buy_quantity` / `sell_quantity`) | Yes | Intraday and transient; does not fit an EOD page |

---

## 8a. As built (2026-09-17)

| Piece | Where |
| --- | --- |
| Tables + migration | `packages/db/src/schema/flows.ts`, `packages/db/drizzle/0021_institutional_flow.sql` (`delivery_stats`, `participant_oi`, `derivative_oi_daily`, `feed_ingestion_runs`) |
| Repository | `packages/db/src/repositories/flows.ts` — upserts, `deliverySnapshot` (trailing mean/stdev in SQL), `feedHealth`, `dealAggregates`, `FLOW_FEEDS` ids |
| Neutral contracts | `packages/market-data/src/disclosures.ts` (`RawDeliveryStat`, `RawParticipantOi`, two new `DisclosureSource` methods); `provider.ts` (`fetchFuturesOpenInterest`, `listDerivativeUnderlyings`, `capabilities.derivatives`); router route `derivatives` → `MARKET_DATA_ROUTE_DERIVATIVES` (default `dhan`) |
| NSE transports | `apps/worker/src/sources/india-disclosures.ts` — archive CSV parsers (bhavdata, participant OI, bulk/block), `corporate-share-holdings-master` for shareholding (promoter + public %; FII/DII stay null); every method throws |
| Dhan | `packages/dhan` — `NSE_FNO` segment, `FUTSTK` rows in the master (`InstrumentIndex.futuresFor`), `fetchFuturesCandles` with `oi: true`; `packages/providers-dhan` implements the capability, paced 400 ms between a stock's contracts (Dhan counts chart calls in a rolling second) |
| Core (pure) | `packages/core/src/flows.ts` — `classifyOiBuildup`, `deliveryAnomaly`, `attentionScore` (linear ramps to `ATTENTION_CAPS`, factors returned with the score) |
| Worker jobs | `ingest-delivery` 19:10 & 20:10, `ingest-participant-oi` 19:20 & 20:20, `ingest-deals` 18:50, `ingest-fii-dii` 19:45 (all Mon–Fri, all through `withFeedHealth`); `ingest-futures-oi` **06:45 Tue–Sat** (previous session — the provider treats a session's daily bar as forming until the next IST date, same as the candle pass); `ingest-shareholding` weekly for every watchlisted name; `backfill-flows` on demand (`--once backfill-flows`, ~45 days of delivery + participant OI) |
| Web | `apps/web/src/server/disclosures.ts` (`getInstitutionalFlow`, `getStockFlow`), `GET /api/flows/:symbol`, components `flow-tape`, `flow-stock-table`, `flow-stock-drawer`, `flow-deals`, `flow-shareholding`, `flow-feeds`, `flow-mini-charts` |

**First run on the VPS after deploy:** `node apps/worker/dist/index.js --once backfill-flows`
(≈ 33 sessions, ~20 s), then `--once ingest-futures-oi` (≈ 230 names, ~8 min; needs
`MARKET_DATA_PROVIDER=dhan` or `routed`). Without the backfill the delivery column shows
"no baseline" until ~20 sessions accumulate.

**Known limits:** FII/DII cash has no archive, so its history only accrues from the day
the job runs; the FII/DII split of shareholding is not in the exchange summary and
renders as "—"; the OI column is one session behind delivery by design (dated in the
section header).

## 9. Phase-0 checks (copy-paste on the VPS)

```sql
select 'fii_dii' t, count(*), min(trading_date), max(trading_date), max(ingested_at)::date from fii_dii_flows
union all select 'deals', count(*), min(trading_date), max(trading_date), max(ingested_at)::date from bulk_block_deals
union all select 'shareholding', count(*), min(as_of_date), max(as_of_date), max(ingested_at)::date from shareholding_patterns;
```

```sh
# Archive reachability (expect 200 + CSV, no cookie dance)
curl -sI "https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_16092026.csv" | head -1
curl -sI "https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_16092026.csv" | head -1
curl -sI "https://nsearchives.nseindia.com/content/equities/bulk.csv" | head -1
```

Dhan probe: one `charts/historical` call for a `FUTSTK` securityId with `oi: true`, and
one `optionchain` call with `UnderlyingSeg: "NSE_FNO"` for a stock — confirm both return
non-zero OI.

---

## 10. Decisions (taken 2026-09-17)

| # | Decision | Outcome |
| --- | --- | --- |
| D1 | Put derivatives data (futures OI, participant OI, PCR) on this page? | **Yes.** Futures OI build-up is a core column; FII index-futures positioning is a tape tile |
| D2 | Shareholding: keep on this page, move to the drawer, or drop? | **Keep on the main page** (§4.5), plus the 8-quarter trend in the drawer. Its source must be fixed in Phase 1 |
| D3 | Default scope of the ranked table? | **Market-wide**, with a "names I follow" toggle |
| D4 | Build Phase 4 (option chain) now? | **Later**, after Phases 1–3 ship |
| D5 | Rename the page? | **Keep "Institutional Flow"** |
