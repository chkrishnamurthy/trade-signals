---
name: Company research implementation
status: ready-for-provider-spike
horizon: next
created: 2026-10-03
updated: 2026-10-03
area: [web, worker, db, providers, legal]
blocked_by: [fundamentals-data-rights, provider-selection]
confidence: 4
summary: Repository-specific feasibility, data-provider research, architecture and phased implementation plan for a Screener-style stock detail/company research feature.
owner: krishna
---

# Company Research / Stock Detail — Feasibility and Implementation Plan

> Planning only. This document does not authorize implementation, provider signup,
> data purchase, scraping, or public release. It reviews the requested feature against
> the repository as it exists on 2026-10-03 and identifies what is possible, what is
> provider- or licence-gated, and what should not be built.

## 1. Executive verdict

The product can support a high-quality stock-detail and company-research experience,
but the complete requested scope cannot be delivered from the current Fyers, Dhan,
and public-exchange ingestion alone.

The right delivery strategy is:

1. Build a **protected, source-backed V1** from data already in EquityWise: market
   price/technical context, signals, watchlist state, announcements, events, and the
   partial shareholding history.
2. Add a provider-neutral `FundamentalsProvider` and validate Upstox's new Company
   Fundamentals API as the fastest low-cost path to an initial fundamentals product.
3. Do not promise deep Screener-like history until either a licensed vendor or an NSE
   corporate-data agreement supplies the missing statements, filings, revisions and
   redistribution rights.
4. Ship deterministic, evidence-linked research observations before adding an LLM.
5. Make `/stocks/[symbol]` public and indexable only after written data-display rights
   and an Indian securities-law review. Until then it remains behind the existing
   account boundary.

### What is feasible by source

| Capability | Current EquityWise data | Upstox fundamentals candidate | Licensed/deeper source needed |
| --- | --- | --- | --- |
| Price, OHLCV, 52-week range, technicals | Yes: Fyers/Dhan + DB | Not needed | No |
| Signals and technical evidence | Yes | Not needed | No |
| Announcements and calendar events | Substantial existing support | Can supplement corporate actions | Licence/SLA needed for completeness |
| Basic company profile | Partial instrument metadata | Yes | Possibly, for authoritative classifications |
| Quarterly revenue/operating profit/net profit summary | No | Yes | No for an MVP |
| Detailed quarterly result lines | No | Not completely documented | Yes |
| Detailed annual P&L | No | Yes, annual full-statement mode | Maybe, depending on history/quality |
| Detailed annual balance sheet and cash flow | No | Partly, at coarse line-item depth | Yes for the requested depth |
| Current P/E, P/B, ROA, ROE, ROCE, EV/EBITDA | No | Yes | No for an MVP |
| Historical ratio series and all requested ratios | No | No | Yes or calculate from licensed facts |
| Peer list | Config-based peers exist | Competitor endpoint exists | Metrics must be joined/calculated |
| Shareholding categories | Partial | Better category coverage | Pledge data and authoritative revisions may need another source |
| Annual reports, presentations, concalls, ratings | Announcements can link some filings | No complete document library | Exchange/company/vendor source needed |
| AI summary | No LLM system exists | Not a data-provider feature | New model pipeline, evaluation and legal review |

**Scope conclusion:** a useful V1 is realistic. An accurate, redistributable,
historically deep replica of Screener is a separate data-acquisition programme, not
merely a web-page project.

## 2. Non-negotiable product and engineering constraints

The implementation must preserve the repository's load-bearing rules:

- EquityWise remains decision support. No order, position, holding, funds, quantity,
  broker portfolio, or order-shaped interaction is introduced.
- Market price and per-share money remain integer paise internally. Statement money
  also needs an exact integer representation; binary floating-point multiplication
  is not acceptable.
- Fyers-, Dhan- or Upstox-specific identifiers and response types stop at their
  adapters. Application services and DTOs use normalized domain types.
- The worker performs durable ingestion. Web requests read the database and do not
  turn a user page view into a fan-out of vendor calls.
- Missing data is `null`/unavailable, never zero. Every section can degrade
  independently without inventing values.
- Stored summaries, ratios and observations link to the exact source facts and
  calculation/rule version that produced them.
- Per-user data such as watchlists stays owner-scoped. Company facts are shared
  reference data; user annotations and saved state are private.

## 3. Repository audit: what should be reused

The older [stock research platform plan](stock-research-platform-plan.md) correctly
identified fundamentals as a separate data domain, but its repository snapshot is
now stale. The following capabilities have since landed and should not be rebuilt.

| Existing capability | Location | How the stock page should use it |
| --- | --- | --- |
| Provider-neutral quotes/bars/market status | `packages/market-data/src/provider.ts` | Header quote, price chart and market freshness |
| Fyers + Dhan market-data routing | provider packages and worker | Continue capability-based routing; do not force fundamentals into it |
| Instrument master with ISIN | `packages/db/src/schema/instruments.ts` | Canonical company/listing identity and provider lookup |
| Daily indicators | DB indicator schema/repository | Technical snapshot, 52-week range and momentum/trend context |
| Persisted signals/evidence | signal schemas/repositories | Source-backed technical setup section |
| Corporate announcements + immutable versions | `packages/db/src/schema/announcement-research.ts` | Announcements tab and document provenance |
| Market events | `packages/db/src/schema/market-events.ts` | Events tab and upcoming/previous events |
| Partial shareholding patterns | `packages/db/src/schema/disclosures.ts` | Seed data only; extend rather than creating a competing table |
| Owner-scoped watchlists | watchlist repositories/APIs | Reuse existing add/remove flows |
| Symbol resolution/search | `apps/web/src/server/search.ts` | Canonical instrument resolution |
| Stock-detail service draft | `apps/web/src/server/stock-detail.ts` | Refactor into the page composition service |
| Stock Schema.org helper | `apps/web/src/lib/seo/schema.ts` | Reuse only if/when the route becomes public |

### Existing gaps and corrections

- `/stocks/[symbol]` is not currently an implemented route.
- Middleware is closed by default; `/stocks` is protected. Robots/sitemap tests also
  treat stock routes as non-public. The SEO architecture documentation describes a
  future state, not current runtime behaviour.
- `stock-detail.ts` uses configuration-driven peers and converts missing price/range
  data to zero. The new service must return explicit availability/freshness states
  and nullable values.
- Existing shareholding rows expose promoter/FII/DII/public fields, but current public
  ingestion does not reliably fill all categories and has no complete pledge history.
- Announcement interpretation is deterministic metadata/rules, not an AI summary.
- There is no statement, fundamental-ratio, company-document or LLM persistence
  domain today.

## 4. Data-provider research

### 4.1 Fyers and Dhan: useful, but not fundamentals providers

Fyers documents quotes, historical OHLCV, market status and symbol-master services.
Dhan documents instrument master, live market feed and historical OHLCV. These are
the right sources for market/technical context, but their documented APIs do not
supply the requested financial statements, ratios, shareholding history or document
library.

- [Fyers Data API documentation](https://support.fyers.in/portal/en/kb/fyers-api-integrations/fyers-api/api-v3/data-api)
- [Dhan historical data](https://dhanhq.co/docs/v2/historical-data/)
- [Dhan instruments](https://dhanhq.co/docs/v2/instruments/)
- [Dhan live market feed](https://dhanhq.co/docs/v2/live-market-feed/)

Use them for:

- latest/last-observed price, day OHLC and previous close;
- historical price/volume charting;
- daily technical calculations and technical evidence;
- market-open status and quote timestamps;
- instrument discovery and provider symbol mapping.

Do not widen `MarketDataProvider` with statements merely because the same vendor may
offer both products. Market data and fundamentals have different identity, cadence,
revision, entitlement and failure semantics.

### 4.2 Upstox Company Fundamentals: recommended proof-of-concept

Upstox announced a Company Fundamentals API in May 2026. Its documented endpoints
cover company profile, income statement, balance sheet, cash flow, shareholding, key
ratios, corporate actions and competitors. An Analytics Token is read-only, lasts one
year and includes fundamental APIs, making it operationally attractive for a
proof-of-concept.

- [Company Fundamentals API announcement](https://upstox.com/developer/api-documentation/announcements/company-fundamentals-api/)
- [Analytics Token](https://upstox.com/developer/api-documentation/analytics-token/)
- [API rate limits](https://upstox.com/developer/api-documentation/rate-limiting/)

The documented coverage has important limits:

| Endpoint | Useful coverage | Documented limitation relevant here |
| --- | --- | --- |
| [Company profile](https://upstox.com/developer/api-documentation/get-company-profile/) | Description, sector and identifiers | Documented market-cap fields are sector market cap, not clearly company market cap |
| [Income statement](https://upstox.com/developer/api-documentation/get-income-statement/) | Quarterly/yearly summaries; annual full statement | Full-statement mode remains annual even when a quarterly period is requested |
| [Balance sheet](https://upstox.com/developer/api-documentation/get-balance-sheet/) | Annual statement | Coarser than the requested reserves/borrowings/fixed-assets/CWIP detail |
| [Cash flow](https://upstox.com/developer/api-documentation/get-cash-flow/) | Annual operating/investing/financing flows | No directly documented free-cash-flow series |
| [Shareholding](https://upstox.com/developer/api-documentation/get-share-holdings/) | Promoter, FII, other DII, mutual funds, retail/other | No documented promoter-pledge history |
| [Key ratios](https://upstox.com/developer/api-documentation/get-key-ratios/) | Current P/E, P/B, ROA, ROE, ROCE, EV/EBITDA | No historical ratio series and not all requested ratios |
| [Competitors](https://upstox.com/developer/api-documentation/get-competitors/) | Candidate peer identities | Peer financial metrics still need per-company facts/snapshots |
| [Corporate actions](https://upstox.com/developer/api-documentation/get-corporate-actions/) | Action details/dates | Must be reconciled with existing events/actions, not duplicated |

The documented standard limit is 50 requests/second, 500/minute and 2,000 per 30
minutes per API per user. That is adequate for a controlled, queued backfill, but the
worker should still implement bounded concurrency, checkpointing and retry/backoff.

**Mandatory gate:** API availability and a free/read-only token do not by themselves
grant public-display, storage or redistribution rights. Obtain written confirmation
for the intended authenticated and public use cases before production ingestion.

### 4.3 NSE structured corporate data: authoritative but commercially gated

NSE's corporate-data specification is much closer to the requested detailed quarterly
results: it describes company results, segment-wise results, announcements and
shareholding, including fields for sales, other income, expenses, interest,
depreciation, profit before tax, tax, profit after tax, EPS, audit/scope and revisions.

- [NSE corporate data subscription](https://www.nseindia.com/static/market-data/corporate-data-subscription)
- [NSE corporate-data technical specification](https://nsearchives.nseindia.com/web/sites/default/files/inline-files/Download_Technical_Specification_Corporate_Data.pdf)
- [NSE XBRL information](https://www.nseindia.com/static/companies-listing/xbrl-information)
- [NSE corporate integrated filing](https://www.nseindia.com/companies-listing/corporate-integrated-filing)

NSE's data policy makes access, usage and redistribution subject to the relevant
agreement. Its currently published corporate-data prices are materially higher than
a hobby/start-up API and some feeds use leased-line or end-of-day file delivery.
[NSE data policy](https://www.nseindia.com/static/market-data/nse-data-policy)

This is a credible authoritative path when completeness and public redistribution are
business requirements, but it needs commercial/legal engagement and an integration
spike. Public website endpoints must not be treated as a free production contract.

### 4.4 Licensed commercial vendors

Two credible vendors for a procurement comparison are:

- [Accord Fintech data feeds](https://www.accordfintech.com/static/data-feed-solutions.aspx),
  which advertises listed-company financials, announcements and API/file delivery.
- [TrueData market/fundamental APIs](https://www.truedata.in/products/marketdataapi),
  which advertises exchange-authorized feeds and historical corporate/fundamental data.

Before selection, require a written field dictionary, exact NSE coverage, history
depth, revision/restatement behaviour, point-in-time availability, redistribution
rights, rate/SLA limits, support terms and price. Lower-cost aggregators should not be
shortlisted for production merely on a marketing claim; they must pass the same
provenance and rights diligence.

### 4.5 Screener is a UX reference, not a data source

Screener's supported extraction path is a premium-account CSV export, not a public
application API. Its terms restrict copying, commercial use and public display.

- [Screener export documentation](https://support.screener.in/article/28-export-screen-results)
- [Screener terms](https://www.screener.in/guides/terms/)

Do not scrape Screener, replay its internal requests, import a user's export into a
shared database, or copy its wording/data presentation closely enough to imply the
data came from Screener. Use the requested layout only as general product inspiration.

## 5. Requirement-by-requirement feasibility

### 5.1 Can be delivered from current app data

- Authenticated `/stocks/[symbol]` route and responsive shell.
- Header identity from instrument data, watchlist action, timestamped price context.
- Price/volume history and technical metrics based only on closed candles.
- Persisted EquityWise signals with their existing factor evidence.
- Corporate announcement timeline and source links.
- Market events/corporate actions already present in the calendar domain.
- Partial quarterly shareholding history, visibly marked when categories are absent.
- Configured-sector peers as a temporary fallback, labelled as such.

### 5.2 Feasible after a successful Upstox provider spike and rights approval

- Company description/sector profile.
- Quarterly high-level income summaries.
- Annual full P&L plus annual balance sheet and cash flow at documented depth.
- Current key-ratio snapshot.
- More complete shareholding categories.
- Vendor-suggested competitor list.
- Corporate-action cross-checks.

### 5.3 Requires a deeper/licensed source or a reduced requirement

- Eight to twelve quarters of detailed expense, interest, depreciation, PBT, tax and
  EPS lines from the documented Upstox endpoint alone.
- Five to ten years of the exact detailed P&L, balance-sheet and cash-flow rows in the
  supplied plan.
- Historical P/E/P/B/ROE/ROCE/debt-equity/interest-coverage/margin/growth/dividend
  yield series without calculating them from complete, point-in-time facts.
- Complete business/geographic segment history.
- Promoter pledge history.
- Complete annual reports, presentations, earnings calls/transcripts and credit-rating
  reports with stable links and redistribution rights.
- Guaranteed full-exchange coverage, revisions and an ingestion SLA from best-effort
  public NSE/BSE web endpoints.

### 5.4 Not available today and must not be represented as available

- AI-generated summaries: no model/provider, prompt versioning, evaluations, cost
  controls or hallucination safeguards exist in the repository.
- A trustworthy company market cap if the selected feed does not explicitly provide
  shares outstanding and a timestamp-compatible price. Sector market cap is not a
  substitute.
- “Real-time” price where the displayed observation is delayed/stale or redistribution
  is not licensed. The UI must show `observedAt` and the correct freshness label.
- A legal conclusion that a disclaimer makes public research/recommendations safe.
  Obtain Indian securities counsel review before public launch, particularly for AI
  summaries, investment checklists and language that could be read as advice. SEBI's
  [Research Analyst FAQ](https://www.sebi.gov.in/sebi_data/attachdocs/jul-2025/1753268710217.pdf)
  and [2025 amendment material](https://www.sebi.gov.in/web/?file=https%3A%2F%2Fwww.sebi.gov.in%2Fsebi_data%2Fattachdocs%2Ffeb-2025%2F1740726945457.pdf)
  are inputs for counsel, not a substitute for that advice.

## 6. Recommended architecture

```text
Fyers / Dhan                         Upstox or licensed fundamentals source
     |                                               |
MarketDataProvider                           FundamentalsProvider
     |                                               |
     +--------------- worker jobs -------------------+
                             |
        normalized, revision-aware, source-backed repositories
                             |
      company facts + existing candles/indicators/signals/disclosures/events
                             |
             server-side stock research composition service
                             |
          protected /stocks/[symbol] Server Component + tab islands
```

### 6.1 Add a separate provider contract

Create a provider-neutral contract, either in `packages/market-data` under a clearly
separate fundamentals module or in a small dedicated provider-neutral package. Do not
add vendor-specific methods to `MarketDataProvider`.

Illustrative capability groups, not final TypeScript:

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

Normalized results carry:

- the canonical `instrumentId` and ISIN;
- provider observation/publish/retrieval timestamps;
- source record ID and source URL when supplied;
- statement period, fiscal year/quarter, standalone/consolidated scope and audit state;
- units/currency and raw source label;
- revision or supersession identity;
- nullable facts rather than fabricated zeros.

The Upstox adapter validates every response with Zod and contains all
`instrument_key` and endpoint-specific shapes. No Upstox type crosses into the web,
worker, DB repository or DTO layers.

### 6.2 Identity resolution

ISIN should be the preferred cross-provider company identity, with exchange + trading
symbol only as a controlled fallback. Persist provider mappings separately; never
change the canonical NSE symbol merely to match a vendor. Corporate-action symbol
changes and multiple listings require effective dates.

### 6.3 Exact monetary conversion

Statements commonly arrive in rupees, lakhs or crores and can exceed JavaScript's
safe integer range after conversion to paise. The ingestion path must:

1. accept the source decimal as a string whenever the transport permits;
2. parse the decimal exactly, using a small audited string-to-scaled-integer helper;
3. apply the declared unit multiplier into `bigint` paise;
4. store statement money as PostgreSQL `bigint`/Drizzle bigint;
5. serialize large money as decimal strings in JSON DTOs;
6. extend or complement `formatPaise()` to format bigint safely.

EPS, dividend and book value are per-share money in paise. Percentages and ratios are
not money; store them as exact DB numeric/normalized decimal strings where reasonable,
then convert only for chart/render calculations with explicit precision rules.

## 7. Data model

The supplied ten-table proposal should not be implemented literally. It duplicates
existing company identity, announcements, events and shareholding, and its table-level
`source_name/source_url` is too coarse for revised filings.

### 7.1 New shared-reference tables

#### `company_profiles`

- PK/FK `instrument_id` to the existing `instruments` table.
- description, website, industry/sector classification, registered identity fields.
- `source_record_id`, `effective_at`, `updated_at`.
- Do not duplicate symbol, display name, exchange or ISIN.

If BSE code/multiple listings are required, add an `instrument_listings` or provider
mapping model with effective dates rather than columns on every company fact.

#### `fundamental_source_records` — immutable

- provider/source, provider record ID, canonical source URL;
- fetched/published/filing timestamps;
- response/document checksum and optional storage reference;
- source period/scope/audit/unit metadata;
- revision number and `supersedes_id`;
- ingestion-run ID and parser version.

This row is the provenance anchor for every fact. Never overwrite a revised filing.

#### `financial_periods`

- instrument, period start/end, fiscal year and quarter;
- `quarter | annual | ttm` kind;
- `standalone | consolidated` scope;
- audit/review state;
- source-record ID and availability timestamp;
- uniqueness includes instrument, period, kind, scope and source revision.

#### `financial_facts`

- period/source record and canonical metric key;
- raw provider label;
- one typed value: `money_paise_bigint`, `ratio_numeric`, `count_bigint`, boolean or
  short text;
- currency/unit and display scale;
- a check constraint enforces exactly one value representation.

An EAV fact table is appropriate here because statement taxonomies vary by sector and
change over time. Canonical metric keys and calculation definitions remain versioned
code/config, not user-editable admin CRUD.

#### `fundamental_metric_snapshots`

A narrow, typed read model for overview/peer/screener queries:

- instrument + `as_of` + metric key;
- typed value and unit;
- calculation version;
- the source fact IDs used to calculate it;
- observation/publish timestamp.

This avoids running expensive fact pivots on every page and supports future screening
without making derived values unauditable.

#### `company_peer_sets` and `company_peer_members`

- instrument, peer instrument, source/method, rank, reason and `as_of`;
- versioned sets, not a permanent assertion that two companies are peers;
- config-based peer lists can be imported as one explicit method.

#### `company_documents`

- instrument, document kind, title, source URL, published date, source record/checksum;
- optional FK to an existing announcement/event;
- `annual_report | result_filing | presentation | concall | rating | other`;
- do not download or mirror documents until storage/redistribution rights are known.

### 7.2 Extend existing domains instead of duplicating them

- Extend shareholding storage to preserve immutable revisions and add mutual-fund,
  other and promoter-pledge fields when the source supplies them. Maintain a current
  projection only if query performance needs it.
- Map new corporate-action data into the existing action/event model with source
  reconciliation; do not create an Upstox-only actions table.
- Continue using immutable announcement versions and per-owner announcement state.
- Continue using existing watchlist tables and owner authorization.

### 7.3 Later AI/deterministic-summary persistence

Do not create an AI table in the first migration. When approved, store:

- summary kind and status;
- deterministic rule-set or prompt-template version;
- model/provider/version and generation parameters, where applicable;
- exact input source-record/fact IDs plus input checksum;
- output sections and per-claim citations;
- generated/expiry timestamps and evaluation status;
- failure/refusal reason.

“Bull case” and “bear case” prose must never invent a causal explanation. Prefer
plain observations such as “operating margin declined in three consecutive reported
quarters” with direct evidence links.

## 8. Read path and APIs

### 8.1 Page composition

Implement `/stocks/[symbol]` as a Server Component backed by a server-only
`getStockResearchPage()` composition service. The service reads repositories in
parallel and returns independent sections:

```text
identity | quote | technicals | signals | overviewMetrics | statements
peers | shareholding | announcements | events | documents | researchBrief
```

Every section includes `available | stale | unavailable | error`, `asOf`, source name
and an explanatory reason when unavailable. One failed source must not blank the page.

Use lowercase canonical URLs (`/stocks/reliance`) even if the display symbol is
uppercase. Resolve aliases and redirect to one canonical route.

### 8.2 Avoid unnecessary endpoints

- Server Components call server services directly; do not create a giant public
  `/api/stocks/[symbol]/research` endpoint merely to call it from the server.
- Add small authenticated GET routes only for deferred/paginated client tabs if the
  initial payload becomes too large.
- Reuse existing announcements, calendar and watchlist APIs. Do not add a second
  symbol-specific watchlist mutation path.
- Every new route uses Zod at the boundary, the existing auth middleware, consistent
  error envelopes and read-only delegation to `apps/web/src/server`.

Candidate deferred routes, only if profiling justifies them:

```text
GET /api/stocks/[symbol]/financials?statement=income&period=quarterly&cursor=...
GET /api/stocks/[symbol]/shareholding?cursor=...
GET /api/stocks/[symbol]/documents?kind=...&cursor=...
```

## 9. Worker ingestion design

### 9.1 Coverage strategy

Do not backfill every NSE instrument first. Start with:

1. a 10–20-company provider-validation basket;
2. active user watchlist symbols;
3. a curated liquid universe such as Nifty 500, subject to data rights;
4. the wider supported universe only after coverage and cost metrics are known.

All page requests read persisted data. A missing company can enqueue/flag future work,
but the web process must not fetch fundamentals synchronously.

### 9.2 Suggested jobs

- `fundamentals-profile-sync`: weekly and on new instrument mapping.
- `fundamentals-results-sync`: results-season cadence plus a daily recent-window scan.
- `fundamentals-annual-sync`: daily recent-window scan, not every company every day.
- `fundamentals-shareholding-sync`: daily recent-window scan/quarterly expectation.
- `fundamentals-actions-reconcile`: daily, merged with the existing event pipeline.
- `fundamental-metrics-refresh`: after new accepted facts, using a versioned calculator.
- `company-documents-sync`: later, once the source/licence is selected.

Exact schedules must follow the chosen provider's publish semantics and limits. Use
existing worker overlap prevention, graceful shutdown, retry/backoff and durable
ingestion-run observability. Upserts may update a current projection, but source
records and accepted filing revisions remain immutable.

### 9.3 Quality gates during ingestion

- reject unknown units/currencies rather than guessing;
- quarantine unmapped statement labels;
- require a valid period/scope before facts become current;
- detect duplicate/revised filings by provider ID and checksum;
- reconcile balance-sheet totals within a documented tolerance;
- reconcile cash-flow opening + movement to closing cash where fields exist;
- flag impossible percentages and category totals;
- preserve raw source metadata for debugging/audit;
- never silently mix standalone and consolidated values in one series.

## 10. Product/UI delivery

### Protected V1 information architecture

1. Header: company identity, source/freshness-aware price context, watchlist action.
2. Overview: company description, technical snapshot, latest reported metrics,
   events and evidence-linked signal context.
3. Financials: quarterly/annual toggle, scope toggle, statement selector and tables.
4. Peers: source/method-labelled peer set and same-date comparable metrics.
5. Shareholding: category history with missing/partial disclosure explicitly shown.
6. Announcements: reuse existing versions/state and source links.
7. Events: reuse calendar data.
8. Documents: source-linked filings only after a reliable document source exists.
9. Research brief: deterministic observations first; AI is a later opt-in phase.

Large tables need a mobile strategy: sticky first column, accessible horizontal scroll,
plain-text value labels, downloadable data only if the provider licence permits it,
and no colour-only communication. Charts complement rather than replace exact tables.

## 11. Security, privacy, SEO and legal gates

### 11.1 Recommended launch posture

Keep V1 authenticated. This matches current middleware, avoids changing robots/sitemap
behaviour prematurely, and creates a smaller licensed-display question than an indexed
public site. Shared company facts may be cached server-side; user watchlist state and
annotations must never enter shared caches or logs.

### 11.2 Public SEO phase

Public `/stocks/[symbol]` requires an explicit later decision and all of:

- written public-display/redistribution permission for every displayed source;
- counsel review of product wording, summaries and disclaimers;
- a definition of which facts may be indexed/exported;
- middleware public-route change;
- canonical metadata, structured data, robots and sitemap changes;
- noindex behaviour for missing/thin/stale pages;
- anonymous traffic/rate/cache capacity planning;
- tests updated intentionally rather than bypassed.

The existing `generateStockSchema()` helper may be reused only after these gates.

### 11.3 AI-specific controls

If an LLM phase is approved:

- send only normalized source-backed facts, never secrets or private user data;
- require citations on every material claim;
- prohibit price targets, individualized recommendations and order language;
- use structured output validation and deterministic post-checks;
- show generated-at/model and source-period information;
- maintain a representative evaluation set including banks/NBFCs, missing data,
  restatements, losses and contradictory filings;
- fail closed to “summary unavailable” when citations or validations fail;
- establish cost budgets, timeouts and provider retention/privacy terms.

## 12. Phased implementation plan

Estimates are engineering ranges for one experienced contributor and begin only after
required provider access is available. Procurement/legal response time is external and
can dominate the calendar.

### Phase 0 — provider, rights and field spike (3–5 engineering days)

- Get written Upstox clarification for storage, authenticated display, public display,
  caching, derived ratios and exports.
- Retrieve all eight fundamentals endpoints for a representative 10–20-company set:
  large/small cap, bank, NBFC, insurer, manufacturer, loss-maker, recent symbol change,
  standalone/consolidated reporter and revised filing.
- Record exact fields, types, units, history depth, null behaviour and latency.
- Compare two licensed-vendor samples and the NSE commercial option.
- Produce a coverage matrix against every requested table row.

**Exit:** provider/licence decision, or a formally reduced V1 scope. No schema is
frozen before this evidence exists.

### Phase 1 — contract, identity, provenance and schema (1–2 weeks)

- Finalize normalized capabilities and canonical metric dictionary.
- Add immutable source records, periods, facts, snapshot read model and profile tables.
- Extend shareholding revision/category support.
- Implement exact unit-to-paise/bigint conversion.
- Add migrations, repositories and contract/fixture tests.

**Exit:** one fixture company can be represented without vendor types or lost source
metadata, including a restatement.

### Phase 2 — worker adapter and ingestion (1–2 weeks)

- Build the chosen adapter with Zod parsing and capability checks.
- Add bounded, idempotent, revision-aware scheduled jobs.
- Add reconciliation/quarantine, ingestion-run metrics and retry behaviour.
- Backfill the validation basket, then watchlist-demand symbols.

**Exit:** repeated runs are safe; failures and stale coverage are visible; no web
request calls the provider.

### Phase 3 — protected stock page from existing data (1–2 weeks)

- Add canonical protected route and server composition service.
- Refactor existing stock-detail logic so missing values remain null.
- Deliver header, technicals, signals, announcements, events and partial shareholding.
- Reuse watchlist authorization/actions and add section-level freshness states.

**Exit:** useful page ships even if the fundamentals provider is temporarily down.

### Phase 4 — fundamentals and statement UX (2–3 weeks)

- Add overview metric snapshots and income/balance/cash-flow tabs.
- Add quarter/year and standalone/consolidated controls.
- Build accessible responsive tables/charts and full provenance affordances.
- Add financial-sector-specific empty/alternate labels where taxonomy differs.

### Phase 5 — peers, complete shareholding and documents (2–3 weeks)

- Add versioned peer sets and comparable-date metrics.
- Add full supported ownership categories and pledge only when sourced.
- Add document index/source links after the document provider and rights are settled.

### Phase 6 — deterministic research brief (about 1 week)

- Add versioned observations such as growth, margin direction, leverage or ownership
  change only where required facts exist.
- Persist evidence references and render neutral, non-causal wording.

### Phase 7 — optional AI summary (2–3 weeks plus evaluation/legal review)

- Select model provider and privacy/cost policy.
- Add citation-constrained structured generation, persistence and evaluation set.
- Release behind a feature flag only after measured quality thresholds pass.

### Phase 8 — optional public/SEO release (1–2 weeks after external approvals)

- Open only licensed fields/routes.
- Add canonical metadata, structured data, sitemap/robots and public cache controls.
- Run security, load, content-quality and thin-page checks.

**Indicative total:** a defensible protected fundamentals V1 is roughly 6–10
engineering weeks after access/rights are secured. The complete requested depth,
documents, AI and public SEO is roughly 12–18+ weeks and remains dependent on vendor
coverage, procurement and legal review.

## 13. Verification plan

### Provider/normalization tests

- Zod fixtures for valid, missing, malformed and newly added fields.
- Unit conversions for rupees/lakhs/crores, negatives and values beyond JS safe integer.
- ISIN/provider mapping, symbol changes and unsupported instruments.
- quarterly versus annual and standalone versus consolidated separation.
- revised filing supersession without loss of old facts.

### Repository and worker tests

- idempotent ingestion and immutable source records;
- transaction rollback/quarantine for partial malformed statements;
- bounded concurrency, retry/backoff and overlap prevention;
- snapshot recalculation only from accepted facts;
- provenance reachability from every displayed fact/metric.

### Web/API tests

- authenticated access and owner-scoped watchlist mutations;
- canonical lowercase redirects and unknown-symbol 404;
- partial section failures and no zero substitution;
- stale/as-of labels and source links;
- accessible tabs/tables/charts across phone/desktop widths;
- no vendor-specific IDs/types in DTOs;
- no provider call during a stock-page request.

### Data-quality dashboard

Track, at minimum:

- supported instruments and last successful sync by capability;
- statement/period/scope completeness;
- quarantined facts and unmapped labels;
- revision counts and reconciliation failures;
- current/stale/unavailable page-section rates;
- provider request count, latency, throttles and failures;
- generated-summary validation/evaluation rates, if AI is enabled.

## 14. Decisions required before implementation

| Decision | Recommendation | Why it matters |
| --- | --- | --- |
| Launch access | Authenticated V1 | Matches current system and reduces public-display/legal risk |
| First provider | Upstox proof-of-concept, then compare licensed sample | Fastest way to validate the real coverage gap |
| Initial universe | Validation basket → user watchlists → Nifty 500 | Controls backfill cost and exposes quality issues early |
| Summary type | Deterministic observations first | Auditable and possible without an LLM system |
| Full-depth target | Pay for licensed data or explicitly reduce rows/history | Current providers do not cover the complete request |
| Public SEO | Separate approval after rights/counsel review | Current code is protected and data rights are unresolved |

## 15. Definition of ready

Implementation should begin only when all of the following are recorded:

- chosen V1 data source and a completed real-response field matrix;
- written storage/display/derived-data rights for the intended launch audience;
- agreed initial symbol universe and freshness promises;
- agreed reductions for fields/history the source cannot supply;
- standalone/consolidated and restatement UX decisions;
- bigint JSON/formatting convention;
- approved deterministic-summary language policy;
- explicit decision that V1 is protected or the additional public-release gates are met.

Until then, the safe next action is **Phase 0 only**. Building statement tables or an
AI summary before the provider and rights spike would create a UI contract the actual
data cannot reliably satisfy.
