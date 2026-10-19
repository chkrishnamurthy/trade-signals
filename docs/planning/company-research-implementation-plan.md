---
name: Company research, stock detail and screener implementation
status: ready-for-decisions
horizon: next
created: 2026-10-03
updated: 2026-10-03
area: [web, worker, db, core, providers, legal]
blocked_by: [owner-decisions-section-16, nse-public-file-policy, fundamentals-data-rights, provider-selection]
confidence: 4
summary: Repository-specific feasibility, data-provider research, architecture and phased plan for a full-market stock screener and a Screener-style stock detail/company research page — technical screener first, fundamentals after a provider and rights spike. Includes an explicit list of what is not possible.
supersedes: stock-research-platform-plan.md
owner: krishna
---

# Company Research, Stock Detail & Screener — Feasibility and Implementation Plan

> Planning only. This document does not authorize implementation, provider signup,
> data purchase, scraping, or public release. It reviews the requested feature against
> the repository as it exists on 2026-10-03 and identifies what is possible, what is
> provider- or licence-gated, and what cannot or must not be built.

> **Revision 2 (2026-10-03, after repository review).** The first revision planned a
> stock-detail page and treated the screener as a later by-product. The owner's goal is
> a **full-fledged screener page**, so this revision:
>
> - adds the screener as a first-class track (§6) and re-sequences delivery so a
>   **full-market technical screener ships before any fundamentals vendor** (§14);
> - corrects the repository audit — the existing `screen()` query builder, the
>   56-stock universe, the full-market NSE bhavcopy that is downloaded and then
>   discarded, and the `corporate_actions` table that nothing writes (§4.2);
> - replaces the EAV-only metric read model with a wide screener projection (§9.3);
> - adds NSE/BSE XBRL filings as a fundamentals candidate (§5.3) and resolves the
>   plan's inconsistent stance on NSE public files (§5.2);
> - adds an explicit **"What is not possible"** section (§2);
> - supersedes [stock-research-platform-plan.md](stock-research-platform-plan.md),
>   carrying forward its screener wireframe, filter AST and saved-screen design (Appendix A).

## 1. Executive verdict

Both a full-market screener and a high-quality stock-detail page are achievable, but
not to the same depth at the same time, and not the complete requested scope from
Fyers, Dhan and public exchange files alone.

The delivery strategy is:

1. **Fix the data spine first.** Populate corporate-action adjustment factors (nothing
   writes them today, so every split corrupts history) and widen daily data from the
   ~56 configured stocks to the whole NSE equity universe using the NSE bhavcopy the
   worker already downloads every evening.
2. **Ship a technical and market-structure screener (S1)** over the full universe —
   price, returns, trend, momentum, volatility, volume, delivery, deals, ownership,
   events and signals — with no new vendor. Extend the existing `screen()` backend
   rather than rebuilding it.
3. **Ship the protected `/stocks/[symbol]` page** from the same data, so every screener
   row has somewhere to go.
4. **Run one fundamentals spike comparing three sources side by side** — Upstox's
   Company Fundamentals API, parsing NSE/BSE XBRL result filings, and one licensed
   vendor sample — against the same company basket. Choose with evidence.
5. Add fundamentals columns to the screener (S2) and statements to the stock page,
   then peers, documents and a deterministic research brief. AI and public SEO stay
   optional, separately approved phases.
6. Everything stays behind the existing account boundary until written data-display
   rights and an Indian securities-law review exist — and that gate applies to the
   screener as much as to the stock page (§13).

### What is feasible by source

| Capability | Current EquityWise data | NSE public files (some already ingested) | Upstox fundamentals candidate | XBRL filings / licensed source |
| --- | --- | --- | --- | --- |
| Full-universe daily OHLCV, turnover, delivery % | ~56 stocks only | **Yes** — `sec_bhavdata_full`, downloaded daily, currently filtered to known stocks | Not needed | Not needed |
| Technical indicators, returns, 52-week range | Yes, for ~56 stocks | Yes, once candles are widened | Not needed | Not needed |
| Split/bonus-adjusted history | **No** — adjustment table is never written | Corporate-action announcements | Corporate actions endpoint | Vendor |
| Signals and technical evidence | Yes | — | — | — |
| Announcements, calendar events | Substantial existing support | Yes | Supplementary | Licence for completeness/SLA |
| Bulk/block deals | Yes | Yes | — | — |
| Shareholding promoter/FII/DII/public | Watchlisted symbols only | Yes, one call per symbol | Better categories | Pledge: SAST filings or vendor |
| Industry/sector classification | YAML for ~56 names | Index constituent files carry industry (verify) | Yes | Vendor |
| Shares outstanding → market cap | **No** | Verify (results XBRL paid-up capital ÷ face value; exchange files) | Not documented for the company | Yes |
| Company profile/description | Partial | Partial | Yes | Yes |
| Quarterly revenue/operating profit/net profit | No | — | Yes (summary) | Yes |
| Detailed quarterly result lines (expenses, interest, depreciation, PBT, tax, EPS) | No | — | Not documented | **XBRL: yes (verify)**; vendor: yes |
| Annual P&L / balance sheet / cash flow | No | — | Yes, coarse depth for BS/CF | Yes |
| Current P/E, P/B, ROA, ROE, ROCE, EV/EBITDA | No | — | Yes, current snapshot only | Calculate from facts |
| Historical ratio series | No | — | **No** | Calculate from point-in-time facts |
| Peers | Config sector peers | Industry from classification | Competitor endpoint | Vendor |
| Annual reports, presentations, concalls, ratings | Announcement links | Filing links | No | Links; mirroring needs rights |
| AI summary | No LLM system | — | — | New pipeline + legal review |

**Scope conclusion:** a full-market technical screener and a useful stock page are
realistic in roughly 5–7 engineering weeks with no new vendor. A fundamentals screener
and Screener-like statement depth are a data-acquisition programme gated on the spike
and on rights, not merely more web pages.

## 2. What is not possible

This section is deliberately blunt. Items are grouped by *why* they are not possible,
because the reason decides whether money, time or nothing at all can change it.

### 2.1 Will not be built — prohibited regardless of budget

These are excluded by law, third-party terms or the product's own rules. No vendor
purchase changes them.

| Not possible | Why |
| --- | --- |
| Data taken from Screener.in, Tickertape, Trendlyne, Moneycontrol, Dhan ScanX (`open-web-scanx.dhan.co`) or any other site's internal endpoints, scraped pages, or a user's premium CSV export loaded into the shared database | Their terms prohibit it; it is not a licensed source. The "Dhan fundamentals API" that circulates online is ScanX's internal web endpoint, not the documented DhanHQ API |
| Copying Screener's layout, wording or presentation closely enough to imply its data or brand | Terms and passing-off risk. Screener is a UX reference only |
| Order execution of any kind, order-shaped UI, broker holdings/positions/funds import | CLAUDE.md "Do not" list |
| Buy/sell calls, price targets, stop-losses, "undervalued / overvalued" verdicts, fair value, star ratings, "top picks", suitability for a user | SEBI Research Analyst / Investment Adviser territory; CLAUDE.md wording rules. Preset screens are named by their conditions, never by an implied verdict |
| A composite score (e.g. "Quality 82/100") without its component breakdown | CLAUDE.md: every score renders with its breakdown or not at all |
| AI prose that asserts causes or recommendations without per-claim citations | Fails closed by design (§13.3) |
| A guarantee that our numbers match Screener's or any other site's | Different sources, standalone vs consolidated choices, restatement handling and TTM conventions legitimately differ. We show our source and calculation; we do not promise parity |

### 2.2 Not possible with current sources — needs a paid licence or exchange agreement

Technically buildable; blocked by data rights or by data that no free source supplies.

| Not possible today | What would unblock it |
| --- | --- |
| Live/real-time prices shown to other users, including a live-ticking full-market screener | Fyers' API terms forbid third-party display/redistribution without written consent; real-time exchange data shown commercially needs an NSE data agreement or an authorised vendor. Dhan's 5,000-symbol socket makes it *technically* possible, not *permitted*. The screener is end-of-day; any live overlay is a separate rights decision (§6.8, §13) |
| Analyst consensus estimates, forward P/E, earnings-surprise, broker target prices | No free or Upstox source. Licensed only (and target prices are excluded by §2.1 anyway) |
| Historical ratio series (e.g. 10-year P/E band) from Upstox | Upstox returns six *current* ratios only. Needs point-in-time EPS/book-value history from XBRL or a vendor, then calculated by us |
| Public, indexed SEO stock/screener pages showing fundamentals or exchange prices | Written redistribution rights for every displayed source plus counsel review |
| User download/export of fundamentals or full screen results | Depends on the chosen source's licence |
| Guaranteed completeness and same-day SLA for every filing and revision | Public NSE/BSE endpoints are best-effort. Needs the NSE corporate-data subscription or a vendor SLA |
| Hosting/mirroring annual reports, rating-agency reports, concall audio/transcripts | Copyright of the issuer/agency. Source links are possible; copies are not until rights are known |
| Promoter pledge history from Upstox | Not in its documented shareholding endpoint. SAST disclosures on the exchange or a vendor |

### 2.3 Not possible retroactively — can only be collected from now on

| Not possible | Detail |
| --- | --- |
| "As first reported" (point-in-time) fundamentals from Upstox for past periods | A latest-values API cannot say what was known on a past date. Fundamental screen backtests need PIT data. XBRL filings are naturally point-in-time (filing date, revised filings) if the archive depth is confirmed in the spike; otherwise PIT history starts on the day we begin collecting |
| "What did this screen return on 1 Jan 2025?" for fundamental screens | Only from the day snapshots are persisted, unless PIT facts exist. Technical screens *can* be recomputed historically from candles |
| Market-cap history | Needs share-capital history with effective dates; starts when we start recording it unless a source supplies history |
| Fundamentals for companies delisted before collection began | Bhavcopy archives include delisted symbols for technical history; their fundamentals are vendor-only |

### 2.4 Feasible, but deliberately out of this plan's scope

| Deferred | Why |
| --- | --- |
| BSE-only listings | Multi-exchange work lives on an unmerged branch; NSE first |
| Full-market intraday (1-minute-derived) screening | Storage, provider rate limits and display rights; intraday stays admin-only |
| F&O / open-interest screening | The futures OI job exists but has never run in production |
| Mutual-fund scheme-level holdings per stock | Requires aggregating every AMC's monthly portfolio disclosure |
| Natural-language screen queries | Later, and only ever producing a filter AST for the user to review (§6.3) |
| Alerts on saved screens | Needs notification infrastructure; V3 |
| Mobile app parity | Web first; the Android app follows |

## 3. Non-negotiable product and engineering constraints

The implementation must preserve the repository's load-bearing rules:

- EquityWise remains decision support. No order, position, holding, funds, quantity,
  broker portfolio, or order-shaped interaction is introduced.
- Market price and per-share money remain integer paise internally. Statement money
  also needs an exact integer representation; binary floating-point multiplication
  is not acceptable.
- Fyers-, Dhan-, Upstox- or NSE-file-specific identifiers and response types stop at
  their adapters. Application services and DTOs use normalized domain types.
- Ratio, growth, TTM, return and filter-evaluation logic lives in `packages/core` as
  pure functions (hard rule 1). The worker and the web read path call the same code.
- Screens evaluate closed daily candles only (hard rule 2). Only `1d` candles are
  stored for the full universe (hard rule 4). Price history is never mutated;
  corporate actions are adjustment rows applied on read (hard rule 5).
- The worker performs durable ingestion. Web requests read the database and never
  turn a page view or a screen into a fan-out of vendor calls.
- Missing data is `null`/unavailable, never zero. Every section and column can degrade
  independently without inventing values.
- Stored summaries, ratios and observations link to the exact source facts and
  calculation/rule version that produced them.
- Filter vocabulary stays technical and neutral ("Above 200 EMA", "Promoter holding
  rose QoQ"), never advisory ("buy candidates", "undervalued").
- Per-user data such as watchlists and saved screens stays owner-scoped. Company facts
  are shared reference data.

## 4. Repository audit

### 4.1 What should be reused

| Existing capability | Location | How this work uses it |
| --- | --- | --- |
| **Screener query builder** — 15 typed filters (price, % change, above/below EMA 20/50/200, EMA stack, RSI, MACD, relative volume, volume, near 52-week high/low, at day high/low), sorts, paging, total count, stale-date guard | `packages/db/src/repositories/indicators.ts:116-343` | Starting point for the screener engine; extended, not rewritten (§6.4). Listed as "backend done, no caller" in `pending-features.md` §1.2 |
| Provider-neutral quotes/bars/market status | `packages/market-data/src/provider.ts` | Stock-page header and chart; optional live overlay |
| Fyers + Dhan routing (`routed`) | provider packages and worker | Capability-based routing; a bhavcopy daily-bars source joins it |
| Instrument master with ISIN | `packages/db/src/schema/instruments.ts` | Canonical identity; widened to the full universe |
| Daily indicators | `packages/db/src/schema/indicators.ts`, `apps/worker/src/jobs/compute-indicators.ts` | Technical columns; already reads candles adjusted on read |
| Provider bar cross-check | `apps/worker/src/jobs/cross-check-bars.ts` | Validates bhavcopy bars against a provider sample |
| Delivery statistics from `sec_bhavdata_full` | `packages/db/src/schema/flows.ts` (`delivery_stats`), `ingest-disclosures.ts:241` | Delivery % columns; the same file supplies full-universe OHLCV |
| Bulk/block deals, FII/DII flows | `packages/db/src/schema/disclosures.ts` | Deal-activity filters and stock-page context |
| Persisted signals/evidence | signal schemas/repositories | "Has active signal" filter and stock-page section |
| Corporate announcements + immutable versions | `announcement-research.ts` | Announcement filters and tab |
| Market events | `market-events.ts` | "Results in next N days", "ex-date upcoming" filters; Events tab |
| Partial shareholding patterns | `disclosures.ts` (`shareholding_patterns`) | Ownership filters once widened (§9.1) |
| Owner-scoped watchlists | watchlist repositories/APIs | "Add to watchlist" from results; "screen within my watchlist" |
| Symbol resolution/search | `apps/web/src/server/search.ts` | Canonical resolution for stock routes |
| Stock-detail service draft | `apps/web/src/server/stock-detail.ts` | Refactored into the page composition service |
| Stock Schema.org helper | `apps/web/src/lib/seo/schema.ts` | Only if/when routes become public |
| Navigation entry | `apps/web/src/lib/navigation.ts` ("Screener", `status: 'planned'`) | Wired when S1 ships |

### 4.2 Verified gaps and defects

1. **The universe is ~56 stocks.** The worker ingests `config/indices.yaml` (69 entries
   including indices) one provider call per symbol (`apps/worker/src/universe.ts`,
   `ingest-daily.ts`). A screener over 56 names is not a screener.
2. **The full-market bhavcopy is downloaded and discarded.** `ingestDeliveryStats`
   fetches `sec_bhavdata_full_DDMMYYYY.csv` — open/high/low/close/previous close,
   volume, turnover, trades and delivery for every EQ/BE/BZ security — and keeps only
   rows whose symbol already resolves to an instrument.
3. **Corporate-action adjustment is wired on read but never written.** The
   `corporate_actions` table and the adjust-on-read path exist; no job, script or
   repository inserts rows. Any split or bonus shows as a crash in stored history and
   corrupts returns, EMAs, ATR and 52-week high/low. This must be fixed before the
   screener can be trusted. (Market-calendar events describe actions; they do not
   supply adjustment factors.)
4. **No shares outstanding, therefore no market cap.** Market cap is the single most
   used screener filter and has no source in the repository. Upstox's profile documents
   *sector* market cap only.
5. **Sector exists only in YAML.** `screen()` returns `sector: null` because sector
   lives in `config/indices.yaml` for the configured names. A full-universe screener
   needs an industry classification source.
6. **Shareholding is narrow.** One row per (instrument, quarter) so a revision
   overwrites; percentages are `doublePrecision`; only watchlisted symbols are fetched;
   four categories; no pledge.
7. **`screen()` limits.** Filters are a flat AND list (no OR groups); fixed sort set;
   `MAX_LIMIT` 200; no API route or page calls it.
8. **`stock-detail.ts`** converts missing price/volume to zero (`close ?? 0`,
   `volume ?? 0`, `high ?? close`), uses YAML peers, and has no route caller.
9. `/stocks/[symbol]` and `/screener` are not implemented routes. Middleware is closed
   by default; robots/sitemap tests treat stock routes as non-public. The SEO
   architecture document describes a future state.
10. Announcement interpretation is deterministic rules, not AI. There is no statement,
    fundamental-ratio, company-document or LLM persistence domain.

## 5. Data-provider research

### 5.1 Fyers and Dhan: market data, not fundamentals

Fyers documents quotes, historical OHLCV, market status and symbol master. Dhan
documents instrument master, live market feed and historical OHLCV. Neither documented
API supplies statements, ratios, shareholding history or a document library.

- [Fyers Data API documentation](https://support.fyers.in/portal/en/kb/fyers-api-integrations/fyers-api/api-v3/data-api)
- [Dhan historical data](https://dhanhq.co/docs/v2/historical-data/)
- [Dhan instruments](https://dhanhq.co/docs/v2/instruments/)
- [Dhan live market feed](https://dhanhq.co/docs/v2/live-market-feed/)

Use them for: the stock-page quote and chart, historical backfill (Dhan's limits suit
a one-off full-universe backfill better than Fyers' 200 requests/minute), the
bhavcopy cross-check, and — only if rights allow — a live overlay on the visible page
of results.

Two cautions:

- The ScanX endpoint (`open-web-scanx.dhan.co/scanx/fundamental`) seen in third-party
  projects is Dhan's internal website backend, not the DhanHQ API. It is excluded
  (§2.1).
- Fyers' API terms forbid third-party display/redistribution without written consent.
  This already applies to live watchlist quotes shown to users and must be part of the
  rights decision in §13.

Do not widen `MarketDataProvider` with statements. Market data and fundamentals have
different identity, cadence, revision, entitlement and failure semantics.

### 5.2 NSE public files: already in production, need one policy

The worker already depends on NSE public endpoints in production:
`sec_bhavdata_full` (delivery), `corporate-share-holdings-master` (shareholding),
`fiidiiTradeReact` (flows), and the IPO data and end-of-day files. The first revision
said public website endpoints "must not be treated as a free production contract"
while the product already relies on them. The plan now takes one explicit position,
for the owner to confirm (§16):

- **Use as best-effort inputs, behind adapters, with health monitoring** — the
  existing `withFeedHealth` pattern — and never promise completeness or an SLA built
  on them.
- **Authenticated display only** until the data-display rights review in §13.
- Gentle, bounded request rates; no circumvention of access controls.
- Upgrade path to the NSE corporate-data subscription or a vendor when completeness,
  SLA or public display becomes a business requirement.

Under that policy, the screener's free inputs are:

| File / endpoint | Gives | Use |
| --- | --- | --- |
| `sec_bhavdata_full_DDMMYYYY.csv` (already fetched) | Daily OHLC, previous close, volume, turnover, trades, delivery for all EQ/BE/BZ | Full-universe `1d` candles + delivery |
| Historical bhavcopy archives | Same, past sessions | Two-year backfill (or Dhan history) |
| `EQUITY_L.csv` equity list | Symbol, name, series, listing date, ISIN, face value | Universe master, listing age, face value |
| Index constituent lists (niftyindices) | Constituents with an industry column (verify) | Index membership + industry for covered names |
| Corporate actions (exchange) | Splits, bonuses, dividends with ex-dates | Adjustment factors (§4.2 item 3) |
| `corporate-share-holdings-master` (already used) | Shareholding categories per symbol | Widen from watchlists to the universe (~2,000 calls/quarter) |

### 5.3 NSE/BSE XBRL result filings: the missing deep-fundamentals candidate

Listed companies file quarterly results and shareholding patterns with the exchanges
in XBRL under SEBI's disclosure regulations. A results filing carries the detailed
lines the request asks for — revenue, other income, expense heads, finance cost,
depreciation, PBT, tax, PAT, EPS, paid-up equity capital and face value — tagged,
period-stamped, standalone/consolidated, with a filing timestamp and revisions as
separate filings. That makes XBRL:

- the most direct free route to **detailed quarterly results** (the gap Upstox's
  documentation does not cover);
- naturally **point-in-time** (filing date is availability date);
- a possible source of **shares outstanding** (paid-up capital ÷ face value), and so
  market cap.

Costs and risks to measure in the spike: taxonomy variation (banks, NBFCs and insurers
use different formats), parser effort and ongoing maintenance, archive depth, filing
latency, and the same access/terms question as §5.2. Annual balance sheet and cash
flow depth in XBRL varies by filing type and must be confirmed with real samples.

- [NSE XBRL information](https://www.nseindia.com/static/companies-listing/xbrl-information)
- [NSE corporate integrated filing](https://www.nseindia.com/companies-listing/corporate-integrated-filing)

### 5.4 Upstox Company Fundamentals: lowest-effort candidate

Upstox announced a Company Fundamentals API on 11 May 2026: company profile, income
statement, balance sheet, cash flow, shareholding, key ratios, corporate actions and
competitors, keyed by ISIN; full statement line items via `fs=true`. An Analytics Token
is read-only, lasts one year and includes the fundamentals APIs. It requires an Upstox
account.

- [Company Fundamentals API announcement](https://upstox.com/developer/api-documentation/announcements/company-fundamentals-api/)
- [Analytics Token](https://upstox.com/developer/api-documentation/analytics-token/)
- [API rate limits](https://upstox.com/developer/api-documentation/rate-limiting/)

| Endpoint | Useful coverage | Documented limitation relevant here |
| --- | --- | --- |
| [Company profile](https://upstox.com/developer/api-documentation/get-company-profile/) | Description, sector, identifiers | Market-cap fields are sector market cap, not company market cap |
| [Income statement](https://upstox.com/developer/api-documentation/get-income-statement/) | Quarterly/yearly summaries; annual full statement | Full-statement mode is annual even when quarterly is requested |
| [Balance sheet](https://upstox.com/developer/api-documentation/get-balance-sheet/) | Annual statement | Coarser than reserves/borrowings/fixed-assets/CWIP detail |
| [Cash flow](https://upstox.com/developer/api-documentation/get-cash-flow/) | Annual operating/investing/financing | No documented free-cash-flow series |
| [Shareholding](https://upstox.com/developer/api-documentation/get-share-holdings/) | Promoter, FII, other DII, mutual funds, retail/other | No documented pledge history |
| [Key ratios](https://upstox.com/developer/api-documentation/get-key-ratios/) | P/E, P/B, ROA, ROE, ROCE, EV/EBITDA — company value and sector value | **Current snapshot only; six ratios; no history** (verified) |
| [Competitors](https://upstox.com/developer/api-documentation/get-competitors/) | Peer identities | Peer metrics still need per-company facts |
| [Corporate actions](https://upstox.com/developer/api-documentation/get-corporate-actions/) | Action details/dates | Reconcile with the exchange source; do not duplicate |

Undocumented: exchange coverage, number of companies, history depth, pricing and
redistribution terms. Standard limits (50/s, 500/min, 2,000 per 30 min per API per user)
allow a ~2,000-company backfill of eight endpoints in a few hours with checkpointing.

**Mandatory gate:** a free read-only token does not grant storage, display or
redistribution rights. Get written confirmation for the intended use before production
ingestion.

### 5.5 NSE structured corporate data: authoritative, commercially gated

NSE's corporate-data subscription covers results, segment results, announcements and
shareholding with revisions, delivered as feeds or end-of-day files under agreement.
It is the credible path when completeness, SLA and public redistribution become
requirements; it needs commercial/legal engagement.

- [NSE corporate data subscription](https://www.nseindia.com/static/market-data/corporate-data-subscription)
- [NSE corporate-data technical specification](https://nsearchives.nseindia.com/web/sites/default/files/inline-files/Download_Technical_Specification_Corporate_Data.pdf)
- [NSE data policy](https://www.nseindia.com/static/market-data/nse-data-policy)

### 5.6 Licensed commercial vendors

Candidates for a procurement comparison include
[Accord Fintech](https://www.accordfintech.com/static/data-feed-solutions.aspx) and
[TrueData](https://www.truedata.in/products/marketdataapi); the September strategy
blueprint also named EODHD, ACE Equity and Dion for comparison. Require a written field
dictionary, exact NSE coverage, history depth, restatement behaviour, point-in-time
availability, redistribution rights, rate/SLA limits, support terms and price before
selection.

### 5.7 Screener and similar sites are UX references, not data sources

Screener's supported extraction path is a premium-account CSV export; its terms
restrict copying, commercial use and public display. The same exclusion applies to
other research sites and broker web backends (§2.1).

- [Screener export documentation](https://support.screener.in/article/28-export-screen-results)
- [Screener terms](https://www.screener.in/guides/terms/)

## 6. The screener

### 6.1 Universe

- **Default:** all NSE equities in series EQ, BE and BZ from `EQUITY_L.csv`, roughly
  2,000+ instruments. SME series (SM/ST) are an owner decision (§16).
- `instruments` remains the identity table; the configured index YAML becomes one
  membership source, not the universe definition.
- Inactive/delisted instruments are retained (`active = false`), never deleted, to keep
  screen history free of survivorship bias.
- Scale is small for Postgres: ~2,000 stocks × ~500 sessions ≈ 1M daily rows for a
  two-year backfill, compressed by the existing TimescaleDB policy.

### 6.2 Metric catalogue by tier

| Tier | Category | Metrics | Source |
| --- | --- | --- | --- |
| **S1** | Price & returns | Close, % change, 1W/1M/3M/6M/1Y return, distance from 52-week high/low, gap % | Adjusted daily candles |
| S1 | Trend | Close vs EMA 20/50/200 and SMA 20/50, EMA stack, golden/death cross within N sessions | Indicators |
| S1 | Momentum | RSI 14, MACD and histogram sign/cross | Indicators |
| S1 | Volatility | ATR 14, ATR %, N-day range % | Indicators |
| S1 | Volume & liquidity | Volume, average volume, relative volume, turnover, trades | Bhavcopy + indicators |
| S1 | Delivery | Delivery %, delivery % vs 20-day average, delivery spike | `delivery_stats` |
| S1 | Deals & flows | Bulk/block deal in last N sessions | `bulk_block_deals` |
| S1 | Ownership | Promoter/FII/DII/public %, QoQ change | Widened shareholding |
| S1 | Events | Results in next N days, ex-date upcoming, announcement in last N days | Market events, announcements |
| S1 | Classification | Index membership, industry (if source passes), listing age, series | Equity list, index files |
| S1 | Signals | Has active EquityWise signal (with link to its factors) | Signals |
| S1\* | Size | Market cap, free-float market cap | **Only if a shares-outstanding source passes verification; otherwise the column is absent, never estimated** |
| **S2** | Valuation | P/E (TTM), P/B, EV/EBITDA, earnings yield, dividend yield | Fundamentals source + price |
| S2 | Profitability | ROE, ROCE, ROA, operating/net margin | Fundamentals source |
| S2 | Growth | Revenue/profit/EPS growth YoY and 3-/5-year CAGR | Fundamentals source |
| S2 | Leverage | Debt/equity, interest coverage, current ratio | Fundamentals source |
| **S3** | History & quality | Ratio vs own 5-year average, consecutive-quarter trends, PIT backtests of fundamental screens, pledge | XBRL or licensed PIT data |

Every metric has a definition entry: key, label, unit, calculation version, source,
null rule, and whether it applies to financial companies (banks/NBFCs/insurers get
alternate or blank metrics rather than misleading ones).

### 6.3 Filter model

Carried forward from the superseded plan, tightened:

```text
FilterNode =
  | { op: 'and' | 'or', children: FilterNode[] }          // max depth 3, max 25 leaves
  | { metric: MetricKey, cmp: '>' | '>=' | '<' | '<=' | 'between' | 'is' ,
      value: number | [number, number] | boolean | string,
      basis?: 'absolute' | 'industry_median' | 'own_5y_avg' }  // basis is S2/S3 only
```

- `MetricKey` is a closed enum from the metric catalogue; no user input ever reaches SQL
  as SQL (the principle the existing `ScreenerFilter` union already follows).
- The type and its pure evaluator ("why did this stock match?") live in
  `packages/core`; the SQL compiler lives in `packages/db`. The existing 15 filter
  kinds map onto metric-catalogue leaves.
- Zod validates the AST at the API boundary and round-trips through the URL.
- A future natural-language box may only *produce* an AST shown to the user for review;
  it never runs a screen on its own.

### 6.4 Query engine

- The worker builds a **wide `screener_snapshots` projection** (§9.3): one row per
  instrument for the latest session, typed columns for every catalogue metric, the
  session date and a build ID.
- A screen compiles the AST to one parameterised `WHERE` over that table, plus sort,
  limit/offset and a total count — one indexed scan over ~2,000 rows, well under the
  time budget, with no joins at query time.
- Snapshots for past sessions are retained (append-only, partitioned by date) so
  "screen as of date" works from the day collection starts (§2.3).
- The existing `screen()` stays as a compatibility path until the AST engine replaces
  it, then is removed.

### 6.5 API

```text
GET  /api/screener?q=<url-encoded AST>&sort=<metric>:<dir>&limit=&offset=&asOf=
GET  /api/screener/metrics            # catalogue: keys, labels, units, tiers, availability
GET  /api/screener/screens            # caller's saved screens
POST /api/screener/screens            # create
PATCH/DELETE /api/screener/screens/[id]
```

Authenticated, Zod-validated, delegating to `apps/web/src/server/screener.ts`, using the
existing error envelope. Results always carry the session actually screened and its
freshness; a stale session is shown, never presented as today.

### 6.6 UX

Based on the wireframe carried forward in Appendix A, revised:

- Left filter builder (AND/OR groups, metric picker by category, unit-aware inputs);
  results table on the right; on mobile the builder becomes a bottom sheet and the
  table keeps a sticky first column.
- Filter state lives in the URL, so a screen is shareable and back/forward work.
- "Showing 74 of 2,031 — session 2 Oct 2026" plus a filter-impact funnel.
- Column picker; sortable columns; virtualised rows; no colour-only signalling.
- Row → `/stocks/[symbol]` with a "matched because…" banner from the core evaluator.
- Bulk actions: add to watchlist, compare (later). No order-shaped affordance.
- Columns that are unavailable for a stock show "—" with a reason on hover/tap, never 0.
- Responsive QA at phone and desktop widths in the running app, both themes.

### 6.7 Saved screens and presets

- `saved_screens` per user, reusing the watchlist owner-scoping pattern (§9.4).
- Presets are versioned config (YAML), not admin CRUD, and are named by their conditions:
  "Above 200 EMA with rising delivery", "Near 52-week high on 2× volume",
  "Promoter holding up QoQ". Never "Multibaggers", "Undervalued gems" or "Buy now".

### 6.8 Freshness and live prices

The screener is an **end-of-day** product: it screens the last closed session. A live
price column for the visible page only (≤50 rows, through the existing quote fan-in) is
technically trivial but is a data-display rights decision (§2.2, §13). Default: off
until that decision.

### 6.9 Export

CSV export of screen results is off by default. S1 technical columns may be exportable
only once the §5.2 policy is confirmed; fundamentals export depends on the chosen
source's licence.

## 7. Stock detail: requirement-by-requirement feasibility

### 7.1 From current and widened data (no new vendor)

- Protected `/stocks/[symbol]` route and responsive shell.
- Header identity, watchlist action, timestamped closing price context.
- Adjusted price/volume history and technical metrics on closed candles.
- Delivery trend, bulk/block deals.
- Persisted EquityWise signals with factor evidence.
- Announcements timeline and events.
- Shareholding history (four categories), marked partial where categories are absent.
- Industry peers from the classification source, labelled with method.
- Market cap only if the shares-outstanding source passes verification.

### 7.2 After the fundamentals spike and rights approval

- Company description/profile.
- Quarterly results — summary from Upstox, or detailed lines if XBRL passes.
- Annual P&L, balance sheet, cash flow at the chosen source's depth.
- Current key ratios; historical ratios only where calculated from PIT facts.
- Fuller shareholding categories; vendor competitor list.

### 7.3 Requires a deeper/licensed source or a reduced requirement

- Five to ten years of the exact requested statement rows.
- Complete segment history; promoter pledge history.
- Complete document library with stable links and redistribution rights.
- Guaranteed coverage/SLA (§2.2).

### 7.4 Not available and must not be represented as available

See §2. In particular: no AI summary until Phase E; no "real-time" label on a delayed or
end-of-day value; no market cap derived from sector market cap; no implication that a
disclaimer makes public research safe without counsel review. SEBI's
[Research Analyst FAQ](https://www.sebi.gov.in/sebi_data/attachdocs/jul-2025/1753268710217.pdf)
and [2025 amendment material](https://www.sebi.gov.in/web/?file=https%3A%2F%2Fwww.sebi.gov.in%2Fsebi_data%2Fattachdocs%2Ffeb-2025%2F1740726945457.pdf)
are inputs for counsel, not a substitute for advice.

## 8. Recommended architecture

```text
Fyers / Dhan            NSE public files                  Upstox / XBRL / licensed
     |                        |                                     |
MarketDataProvider    DailyBarsSource (bhavcopy)            FundamentalsProvider
(quotes, intraday,    ReferenceDataSource (equity list,      (profile, periods,
 backfill history)     index files, corporate actions)        ratios, shareholding)
     |                        |                                     |
     +------------------------+------------ worker jobs ------------+
                                   |
             normalized, revision-aware, source-backed repositories
                                   |
     candles (adjusted on read) · indicators · delivery · deals · shareholding
     events · announcements · signals · company facts · classifications
                                   |
           packages/core calculators (returns, ratios, TTM, evaluator)
                                   |
             screener_snapshots (wide, per session)  ── /api/screener ── /screener
                                   |
                stock research composition service ── /stocks/[symbol]
```

### 8.1 Provider contracts

- **`DailyBarsSource`** — a bhavcopy adapter that returns normalized closed daily bars
  for many instruments in one call. It plugs into `routed` for daily bars only; Fyers and
  Dhan remain fallbacks and backfill sources. NSE CSV column names never leave the
  adapter.
- **`ReferenceDataSource`** — equity list, index membership/industry, corporate actions
  with adjustment ratios.
- **`FundamentalsProvider`** — separate from `MarketDataProvider`:

```text
FundamentalsProvider
  capabilities()
  fetchCompanyProfile(identity)
  fetchFinancialPeriods(identity, request)
  fetchRatioSnapshot(identity, asOf)
  fetchShareholding(identity, request)
  fetchPeerCandidates(identity)
  fetchCorporateActions(identity, request)
```

Normalized results carry canonical `instrumentId` and ISIN; observation/publish/
retrieval timestamps; source record ID and URL; period, fiscal year/quarter,
standalone/consolidated scope and audit state; units and raw label; revision identity;
nullable facts. Each adapter validates with Zod and contains its own identifiers.

### 8.2 Identity resolution

ISIN is the cross-provider company identity; exchange + symbol is a controlled
fallback. Provider mappings are persisted separately with effective dates; the canonical
NSE symbol never changes to match a vendor. Symbol changes keep the same instrument.

### 8.3 Exact monetary conversion

Statements arrive in rupees, lakhs or crores and can exceed JavaScript's safe integer
range in paise. The ingestion path:

1. accepts source decimals as strings where the transport permits;
2. parses exactly with a small audited string-to-scaled-integer helper;
3. applies the unit multiplier into `bigint` paise;
4. stores statement money as Postgres `bigint` (Drizzle `mode: 'bigint'`);
5. serializes large money as decimal strings in JSON DTOs;
6. extends `formatPaise()` (or adds a bigint sibling) for safe formatting.

EPS, dividend per share and book value per share are per-share paise. Ratios and
percentages are not money: stored as `numeric` and converted for render with explicit
precision. Market cap = shares (count, `bigint`) × close (paise) → `bigint` paise.

### 8.4 Where calculations live

Returns, adjusted-series helpers, TTM aggregation, growth/CAGR, ratios, financial-sector
applicability rules, and the filter evaluator are pure functions in `packages/core`
with hand-computed fixtures (the indicator-math discipline). The worker calls them to
build snapshots; the web calls the evaluator to explain matches.

## 9. Data model

The original ten-table proposal is still not implemented literally: it duplicated
identity, announcements, events and shareholding.

### 9.1 Fixes and extensions to existing tables

- **`corporate_actions`** — finally written by a corporate-action job with exact
  `numeric` ratios, source reference and ex-date; reconciliation against event data.
- **`instruments`** — widened to the full universe; add listing date, series and face
  value if not modelled elsewhere (or a small `instrument_reference` table).
- **`shareholding_patterns`** — preserve revisions (source record + supersession instead
  of overwrite), store percentages as `numeric`, add mutual-fund/other/pledge columns
  when a source supplies them, ingest for the full universe.
- **`daily_candles`** — unchanged schema; bhavcopy becomes an additional source for the
  full universe (append-only, closed sessions only).

### 9.2 New shared-reference tables

- **`instrument_classifications`** — instrument, scheme (`nse_industry`, vendor), level
  (macro/sector/industry/basic), value, `effective_from`, source.
- **`index_memberships`** — instrument, index key, `effective_from`/`effective_to`,
  source. Replaces YAML as the membership source of truth for the screener.
- **`share_capital_history`** — instrument, shares outstanding (`bigint` count), face
  value (paise), effective date, source record. Feeds market cap.
- **`company_profiles`** — PK/FK `instrument_id`; description, website, registered
  identity fields; source record, `effective_at`, `updated_at`.
- **`fundamental_source_records`** (immutable) — provider, provider record ID, source
  URL, fetched/published/filing timestamps, checksum, period/scope/audit/unit metadata,
  revision number, `supersedes_id`, ingestion-run ID, parser version.
- **`financial_periods`** — instrument, period start/end, fiscal year/quarter,
  `quarter | annual | ttm`, `standalone | consolidated`, audit state, source record,
  availability timestamp.
- **`financial_facts`** (EAV) — period/source record, canonical metric key, raw label,
  exactly one typed value (`money_paise` bigint, `ratio` numeric, `count` bigint,
  boolean, short text), unit and display scale, enforced by a check constraint.
- **`fundamental_metric_snapshots`** — narrow provenance record for each derived metric:
  instrument, `as_of`, metric key, value, calculation version, source fact IDs.
- **`company_peer_sets` / `company_peer_members`** — versioned, method-labelled peer sets.
- **`company_documents`** — links only (kind, title, URL, published date, source,
  optional announcement FK); no mirroring until rights are known.

### 9.3 Screener read model: `screener_snapshots`

The narrow snapshot table is right for provenance and wrong as the query surface — six
filters would mean six self-joins. The screener reads a wide projection instead:

- PK (`trading_date`, `instrument_id`); partitioned/hypertable by date; append-only.
- Typed nullable columns for every catalogue metric (paise as `integer`/`bigint`,
  ratios as `numeric`, counts as `bigint`, flags as `boolean`), plus industry and index
  keys for filtering.
- `build_id` referencing a `screener_snapshot_builds` row (calculation versions, input
  session, started/finished, row counts, failures).
- Built by the worker after indicators each evening; a failed build leaves the previous
  session visible and marked stale.
- Columns are added by migration when a metric enters the catalogue — a deliberate,
  reviewed change, not dynamic DDL.

### 9.4 Per-user screener tables

- **`saved_screens`** — `owner_id`, name, `definition` jsonb (the AST, validated on
  write and read), `columns` jsonb, sort, created/updated. Owner-scoped repository;
  routes never see other owners' rows.
- Later: `screen_alerts` (owner, screen, condition, channel).

### 9.5 Later AI/deterministic-summary persistence

Not in the first migrations. When approved: summary kind and status; rule-set or prompt
version; model/provider/version and parameters; exact input source-record/fact IDs and
checksum; output sections with per-claim citations; generated/expiry timestamps;
evaluation status; failure/refusal reason. "Bull/bear case" prose must never invent a
causal explanation — prefer plain observations with evidence links.

## 10. Read path and APIs

### 10.1 Stock page composition

`/stocks/[symbol]` is a Server Component backed by `getStockResearchPage()`, reading
repositories in parallel and returning independent sections:

```text
identity | price | technicals | delivery | signals | overviewMetrics | statements
peers | shareholding | announcements | events | documents | researchBrief
```

Each section carries `available | stale | unavailable | error`, `asOf`, source name and
a reason when unavailable. One failed source never blanks the page. Canonical URLs are
lowercase (`/stocks/reliance`); aliases redirect.

### 10.2 Endpoints

- The screener needs its client API (§6.5) because filters change client-side.
- The stock page calls server services directly; small authenticated GET routes are
  added only for deferred/paginated tabs if profiling justifies them:

```text
GET /api/stocks/[symbol]/financials?statement=income&period=quarterly&cursor=...
GET /api/stocks/[symbol]/shareholding?cursor=...
GET /api/stocks/[symbol]/documents?kind=...&cursor=...
```

- Reuse existing announcements, calendar and watchlist APIs; no second watchlist
  mutation path.
- Every route: Zod at the boundary, existing auth middleware, consistent error envelope,
  read-only delegation to `apps/web/src/server`.

## 11. Worker ingestion

### 11.1 Coverage strategy

- **Technical/market-structure data (S1):** the full NSE universe from day one — one
  bhavcopy file per session makes breadth free.
- **Fundamentals:** validation basket (10–20) → watchlist symbols → Nifty 500 → full
  universe, gated on coverage, cost and rights.
- Page and screen requests read persisted data only.

### 11.2 Jobs

Spine and S1:

| Job | Cadence | Notes |
| --- | --- | --- |
| `reference-universe-sync` | Daily (pre-open) | Equity list → instruments (active flags, listing date, face value) |
| `index-membership-sync` | Weekly + on rebalance | Index files → memberships and industry |
| `corporate-actions-sync` | Daily | Writes `corporate_actions` with exact ratios; must precede indicator compute |
| `ingest-eod-bhavcopy` | Daily after the file appears | Full-universe `1d` candles + delivery from one download (merges with the existing delivery job) |
| `bhavcopy-backfill` | One-off, resumable | Two years from archives or Dhan history, checkpointed |
| `compute-indicators` (existing) | After candles | Now ~2,000 instruments; verify runtime |
| `shareholding-sync` (widened) | Daily recent-window scan; quarterly season | Full universe at a gentle rate |
| `share-capital-sync` | After results/shareholding filings | Only if a source passes verification |
| `screener-snapshot-build` | After indicators | Builds the wide projection via `packages/core` |

Fundamentals (after the spike): `fundamentals-profile-sync` (weekly),
`fundamentals-results-sync` (results season + daily recent window),
`fundamentals-annual-sync`, `fundamental-metrics-refresh` (after accepted facts),
`company-documents-sync` (later).

All jobs use existing overlap prevention, graceful shutdown, retry/backoff, `withFeedHealth`
and ingestion-run bookkeeping. Source records and accepted revisions stay immutable.

### 11.3 Quality gates

- Cross-check a sample of bhavcopy bars against a provider (`cross-check-bars`).
- Refuse to build snapshots across an unadjusted split: if a >40% overnight move
  coincides with no recorded corporate action, flag the instrument and null its
  history-dependent metrics until resolved.
- Reject unknown units/currencies; quarantine unmapped statement labels.
- Require valid period/scope before facts become current; never mix standalone and
  consolidated in one series.
- Detect duplicates/revisions by provider ID and checksum.
- Reconcile balance-sheet totals and cash-flow movements within documented tolerances.
- Flag impossible percentages and category totals that do not sum.

## 12. Stock page product/UI delivery

1. Header: identity, freshness-aware price, watchlist action.
2. Overview: profile, technical snapshot, latest reported metrics, events, signal context.
3. Financials: quarterly/annual, standalone/consolidated, statement selector and tables.
4. Peers: method-labelled set with same-date metrics.
5. Shareholding: category history with partial disclosure shown.
6. Announcements and Events: reuse existing domains.
7. Documents: source links only, after a reliable source exists.
8. Research brief: deterministic observations first; AI later and opt-in.

Large tables: sticky first column, accessible horizontal scroll, text labels, no
colour-only meaning; charts complement exact tables.

## 13. Security, privacy, data rights, SEO and legal gates

### 13.1 Launch posture

Screener and stock page are authenticated. Shared company facts and screener snapshots
may be cached server-side; user watchlists, saved screens and annotations never enter
shared caches or logs.

### 13.2 Data-display rights (applies to the screener too)

Showing exchange-derived prices and fundamentals to *other* users is a display question
even behind a login. Before inviting users beyond the owner:

- confirm the §5.2 NSE public-file policy (owner decision, ideally counsel-reviewed);
- resolve Fyers' third-party display restriction for any live price (this also affects
  today's watchlist live quotes);
- obtain the chosen fundamentals source's written storage/display/derived-data terms.

### 13.3 AI-specific controls

If approved: only normalized source-backed facts as input; citations on every material
claim; no price targets, individualized recommendations or order language; structured
output validation and deterministic post-checks; generated-at/model/source-period shown;
an evaluation set covering banks/NBFCs, missing data, restatements, losses and
contradictory filings; fail closed to "summary unavailable"; cost budgets, timeouts and
provider retention terms.

### 13.4 Public SEO phase

Requires an explicit later decision and all of: written public redistribution rights for
every displayed source; counsel review of wording, presets, summaries and disclaimers;
a definition of indexable/exportable facts; middleware public-route change; canonical
metadata, structured data, robots and sitemap changes; noindex for thin/stale pages;
anonymous traffic and cache planning; intentionally updated tests.

## 14. Phased implementation plan

Estimates are for one experienced contributor and start once the relevant decisions in
§16 are made. Procurement/legal time is external and can dominate.

### Track A — screener and stock page on data we can already get

**A0 — Decisions and policy (2–3 days).** Owner answers §16; record the §5.2 policy;
verify the industry and shares-outstanding candidates on a 20-stock sample.
*Exit:* universe, access level and data policy recorded.

**A1 — Data spine (1.5–2.5 weeks).**
- Corporate-action ingestion into `corporate_actions`, with fixture tests for a split,
  a bonus and a consolidation; re-verify indicators on affected names.
- Full-universe instrument sync; bhavcopy daily-bars source behind the provider
  boundary; resumable two-year backfill.
- Index membership/industry; widened shareholding; share capital if verified.
- Indicator compute at ~2,000 instruments; runtime and DB size measured.
*Exit:* adjusted, cross-checked daily history and indicators for the full universe.

**A2 — Screener S1 (2–3 weeks).**
- Metric catalogue, filter AST, pure evaluator and SQL compiler.
- `screener_snapshots` + build job; `/api/screener` routes; `saved_screens`.
- `/screener` page: builder, results, column picker, URL state, funnel, presets, mobile.
- Navigation entry flipped from `planned`.
*Exit:* a signed-in user can build, save and reopen multi-condition technical screens
over the full universe, with the screened session always shown.

**A3 — Stock page from existing data (1–2 weeks).**
- Canonical protected route; composition service; `stock-detail.ts` refactored to nulls.
- Header, chart, technicals, delivery, deals, signals, announcements, events,
  shareholding; section-level freshness states.
*Exit:* every screener row opens a useful page even with no fundamentals source.

### Track B — fundamentals

**B0 — Fundamentals spike (about 1 week of engineering + external response time).**
- Upstox: written terms; all eight endpoints for the 10–20-company basket (large/small
  cap, bank, NBFC, insurer, manufacturer, loss-maker, symbol change, standalone and
  consolidated reporter, revised filing).
- XBRL: parse the same basket's last 8 quarterly result filings; measure taxonomy
  variance, archive depth and latency.
- One licensed vendor sample; the NSE commercial option as reference.
- Coverage matrix against every requested row and every S2 metric.
*Exit:* source decision (possibly Upstox for annual/profile + XBRL for quarterly), or a
formally reduced scope. No fundamentals schema is frozen before this.

**B1 — Contract, identity, provenance schema (1–2 weeks).** Normalized capabilities,
metric dictionary, source records/periods/facts/snapshots/profile tables, exact
bigint conversion, fixture tests including a restatement.

**B2 — Adapter(s) and ingestion (1–2 weeks).** Zod-validated adapters, bounded
idempotent revision-aware jobs, reconciliation/quarantine, backfill basket → watchlists
→ Nifty 500.

**B3 — Fundamentals in product (2–3 weeks).** S2 screener columns and filters; overview
metrics; income/balance/cash-flow tabs with quarter/year and scope controls;
financial-sector alternates.

### Track C — depth

**C1 — Peers, ownership, documents (2–3 weeks).** Versioned peer sets; full ownership
categories and pledge where sourced; document links.

**C2 — Deterministic research brief (about 1 week).** Versioned, evidence-linked,
non-causal observations.

**C3 — S3 history (2–3 weeks, if PIT data exists).** Ratio history, own-average bases,
fundamental screen backtests.

### Optional, separately approved

**E — AI summary (2–3 weeks + evaluation/legal).** **F — Public/SEO (1–2 weeks after
external approvals).**

**Indicative totals:** full-market technical screener + stock page (A0–A3): about
5–7 engineering weeks, no vendor. Fundamentals screener and statements (B0–B3): a further
5–8 weeks after access and rights. Full requested depth with documents, history, AI and
SEO: 15–22+ weeks overall, dependent on vendor coverage, procurement and legal review.

## 15. Verification plan

### Data spine

- Corporate-action fixtures: split, bonus, consolidation, multiple actions; adjusted
  series equals hand-computed values; unadjusted-gap detector fires.
- Bhavcopy parser fixtures (series filtering, holidays, malformed rows); cross-check
  against provider bars within tolerance.
- Backfill idempotency and resume; indicator runtime at full universe.

### Screener

- Every metric's calculator against hand-computed fixtures, including null/warm-up cases.
- AST Zod validation (depth/leaf limits, unknown metrics rejected); compiler produces
  parameterised SQL only; evaluator and SQL agree on a randomised fixture universe.
- Stale-session labelling; unavailable metrics never coerced to zero.
- Saved-screen owner isolation; URL round-trip; responsive and both themes in the running app.

### Fundamentals

- Zod fixtures for valid, missing, malformed and new fields; unit conversions
  (rupees/lakhs/crores, negatives, beyond safe integer); ISIN mapping and symbol changes;
  quarterly vs annual and standalone vs consolidated separation; revision supersession.
- Snapshot recalculation only from accepted facts; provenance reachable from every
  displayed number.

### Web/API

- Authenticated access; canonical redirects; unknown-symbol 404; partial section failures;
  no vendor IDs in DTOs; no provider call during a page view or a screen.

### Data-quality dashboard

Coverage and last successful sync by capability; universe size and active count;
unadjusted-gap flags; snapshot build status; statement completeness; quarantined labels;
revisions and reconciliation failures; section/column availability rates; provider
request counts, latency and throttles; AI validation rates if enabled.

## 16. Decisions required

| Decision | Recommendation | Why it matters |
| --- | --- | --- |
| Screener access | Every signed-in user | It is the product's core discovery surface; signals inside it stay admin-only per CLAUDE.md |
| NSE public-file policy | Best-effort, behind adapters, authenticated display only, monitored (§5.2) | Production already relies on these files; the screener's breadth depends on it |
| Universe | All NSE EQ/BE/BZ; SME (SM/ST) as a filterable opt-in later | Breadth is free via bhavcopy; SME has thin liquidity and different disclosure |
| Live price overlay | Off until rights are resolved | Fyers display restriction (§2.2) |
| Market cap | Ship only from a verified shares source; otherwise omit | Never estimate the most-used filter |
| Fundamentals sources to spike | Upstox + XBRL + one vendor sample | Upstox alone cannot meet detailed-quarterly or history needs |
| Upstox account | Owner to open one for B0 | Analytics Token needs an account |
| Paid vendor budget | Decide after B0 evidence | Full depth and public display likely need it |
| Summary type | Deterministic observations first | Auditable without an LLM |
| Public SEO | Separate approval after rights/counsel | Current code is protected; rights unresolved |

## 17. Definition of ready

**Track A can start when:** §16 access, universe and NSE-file policy are recorded, and
the corporate-action source is identified.

**Track B can start when:** the B0 field matrix exists; written storage/display/derived
rights exist for the intended audience; reductions for unsupported fields/history are
agreed; standalone/consolidated and restatement UX is decided; the bigint JSON and
formatting convention is agreed.

**Phases E/F can start when:** the summary language policy is approved, and the public
release gates in §13.4 are met.

Building statement tables or an AI summary before the fundamentals spike would create a
UI contract the data cannot reliably satisfy. Building the technical screener does not
have that problem — its data is already reachable.

## Appendix A — What was carried forward from the superseded plan

[stock-research-platform-plan.md](stock-research-platform-plan.md) is superseded by this
document. Carried forward, revised where noted:

- the desktop screener wireframe (filter builder left, results right, funnel, column
  picker, row → stock page with a match banner) — §6.6;
- the filter AST — §6.3, now with depth/leaf limits and a closed metric enum;
- `saved_screens` and later `screen_alerts` — §9.4;
- the bigint-paise decision for statement money — §8.3;
- the rule that an NL parser only produces an AST for review — §6.3.

Dropped as stale: its repository audit (predates announcements, events, shareholding,
delivery, deals, auth and Dhan) and its fundamentals-first sequencing.
