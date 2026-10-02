---
name: IPOs
status: in-progress
horizon: next
created: 2026-10-02
updated: 2026-10-02
phases_total: 12
phases_done: 10
phase_names: [Spike + decisions, Schema + core domain, Source framework + NSE adapter, Worker jobs, Server + API, List page, Detail page, Listing performance, GMP, Admin health + ship, BSE source, RHP extraction]
area: [core, db, worker, web]
confidence: 2
summary: "/ipos for Indian IPOs (mainboard + SME): facts from NSE's official IPO JSON and bhavcopy, GMP (labelled unofficial) from InvestorGain, for every signed-in user. All decisions made 2026-10-02; one build, all phases 0–11, no versions."
owner: krishna
---

# IPOs (`/ipos`) — review, research and implementation plan

**Status:** Approved and **built** on branch `feat/ipos` (2026-10-02), uncommitted at the
owner's instruction. Phases 1–8, 10 and 11 are complete in code with tests. The Docker
database tests and the live one-off job runs passed on 2026-10-02. Still open: the VPS
check (Phase 0), the real-app QA, and the merge. BSE is built but
`enabled: false` until the owner extends D2 to BSE.
**Owner decisions (2026-10-02):** **GMP must be shown** (D1). NSE is fetched with a browser
User-Agent (D2). `/ipos` is for **signed-in users** (D3), **every** user rather than admins only (D4).
**There are no versions.** All phases 0–11 are built in one go, including BSE and RHP extraction (D5),
so the finished build is the complete IPO system. Work happens on branch `feat/ipos`; nothing is committed or pushed
without the owner.
**Builds on:** the disclosure pipeline (`/announcements`, `/flows`), which already
ingests NSE/BSE public data in the worker with pure parsers and feed health. See
[institutional-flow-plan.md](institutional-flow-plan.md) and
[announcement-interpretation-sources.md](announcement-interpretation-sources.md).

> Every source fact below was checked live from the development Mac on **2026-10-02**.
> Anything not confirmed from a primary source is marked **(verify)**. Nothing was
> checked from the VPS's IP address. Phase 0 does that.

---

## 0. The answer in six sentences

1. **NSE publishes almost everything a good IPO page needs as official JSON.** This
   covers mainboard and SME, from upcoming through listed. It includes dates, price band, lot, face value,
   issue-size text (fresh/OFS), lead managers, registrar, the RHP link,
   category-wise subscription and 1,470 past issues back to 2012 with their listing dates. This was verified live today.
2. **Listing-day performance comes from an official file the worker already downloads.**
   In NSE's daily bhavcopy, on a stock's listing day `PREV_CLOSE` is the issue price
   and `OPEN` is the listing price, and SME series (`SM`/`ST`) are included.
3. **Two of the three popular aggregators forbid reuse in their terms.** Chittorgarh's
   terms forbid public or commercial use of its content without written permission. IPO
   Watch grants only a personal, non-commercial licence and forbids building a competing
   site. Both are excluded. **InvestorGain** publishes no terms forbidding reuse, its
   robots.txt allows general crawlers, and it accepts an honest User-Agent. It is the one
   usable GMP source.
4. **GMP is shown (owner decision D1), from InvestorGain only, and only for GMP.** It comes
   from one page request that carries every current IPO's GMP. Every GMP figure is labelled
   unofficial and attributed with a link. It is never used to fill any other field. Detail
   pages also show how past GMP compared with actual listing gains. Two caveats: InvestorGain
   publishes no licence either, and it appears to be affiliated with Chittorgarh **(verify)**.
   So we also ask for written permission in parallel (§1).
5. **Company overview, promoters, financials, objects of the issue and strengths/risks
   are not in any structured official feed.** They live in the RHP PDF. Phase 11 extracts
   those sections from the RHP with page citations.
6. **Build it in TypeScript inside the existing worker, with no Python and no Playwright.**
   The primary source is JSON, so neither is needed. Follow the disclosure pipeline's
   shape: a provider-neutral `IpoSource` boundary, pure parsers tested on captured
   fixtures, idempotent upserts, and `feed_ingestion_runs` health.

---

## 1. Decisions (all made by the owner on 2026-10-02)

| # | Decision | Recommendation | Why it is the owner's call |
| --- | --- | --- | --- |
| **D1** | **GMP** | **Decided 2026-10-02: show it.** The source is InvestorGain's live GMP page (§3.5), used for the GMP feed only and toggled in `config/ipo-sources.yaml`. Every figure is labelled unofficial, attributed, linked and time-stamped. Chittorgarh and IPO Watch stay excluded because their terms forbid reuse. **Two follow-ups:** (a) email InvestorGain for written permission while v1 is built, and confirm whether it belongs to Chittorgarh Infotech (if so, Chittorgarh's no-reuse clause may cover it); (b) switch to SEBI's regulated "when-listed" prices if that platform launches, since those would be official exchange data. | InvestorGain publishes no licence either, so the residual risk is a takedown request. If one arrives, the feed is switched off in YAML and the UI falls back to the explainer. GMP is an unregulated grey-market quote that SEBI has publicly moved to replace ([Business Standard](https://www.business-standard.com/markets/ipo/sebi-to-start-pre-listing-trading-in-ipo-to-curb-grey-market-activity-buch-125012100843_1.html), [ICICI Direct](https://www.icicidirect.com/research/equity/finace/sebi-plans-to-allow-pre-listing-trading-in-shares-to-reduce-grey-market-trading)). |
| **D2** | **Browser User-Agent for NSE** | **Decided 2026-10-02: yes.** NSE only, at conservative rates. This matches what `/flows` and `/announcements` already do in [india-disclosures.ts](../../apps/worker/src/sources/india-disclosures.ts). Every other source gets an honest, identifiable UA. | **NSE's CDN drops any non-browser UA.** Tested today, `EquityWiseBot/0.1 (+https://equitywise.io)` and curl's default UA were both connection-reset on `www.nseindia.com` and `nsearchives.nseindia.com`, while a Chrome UA got `200`. "Proper user-agent" and "NSE access" cannot both hold. |
| **D3** | **NSE data rights, and logged-out visitors** | **Decided 2026-10-02: signed-in users only.** The same footing as `/flows` today. `/ipos` stays behind sign-in and out of search engines. | NSE's [data policy](https://www.nseindia.com/static/market-data/nse-data-policy) makes redistribution subject to agreement. This is the same unresolved question already accepted for the disclosure pages (see `announcement-interpretation-sources.md`). Opening the page to logged-out visitors is a one-line `isPublic` change in `middleware.ts`, but it would publish NSE data and GMP to the open web, so it is a separate yes/no. |
| **D4** | **Who sees it** | **Decided 2026-10-02: every user from launch, not only admins.** It goes in the "Market record" navigation group with no admin-only beta. Verification happens before merge instead (Phase 9). | There is no `getAdminUser()` gate on the page or the APIs. Only the source-health view stays admin-only. |
| **D5** | **RHP-derived sections** | **Decided 2026-10-02: in scope, with no versions.** Phase 11 extracts overview, promoters, financials, objects and strengths/risks from the RHP with page citations, inside this same build. Until Phase 11 runs for an issue, the page links to the RHP. | This is the biggest scope cut against the brief. No free official source has these fields in structured form (§3.4). |

Two further constraints follow from CLAUDE.md and SEBI, not from preference. They are
listed so they are not mistaken for open choices:

- **No "Apply" button, no broker deep-link and no bid form.** An IPO application is a
  bid, which is an order. CLAUDE.md forbids any order-shaped affordance.
- **No EquityWise opinion on an IPO.** There will be no review, rating, score, or "apply/avoid"
  verdict. Analysis of securities "to be listed" is a research report under the SEBI
  Research Analyst Regulations (see memory note *monetization-data-strategy*). "Strengths
  and risks" will therefore only ever be **the company's own RHP sections**, attributed
  and cited by page.

---

## 2. Codebase review — what this feature plugs into

| Area | What exists | What the IPO feature reuses |
| --- | --- | --- |
| **Worker** ([index.ts](../../apps/worker/src/index.ts), [scheduler.ts](../../apps/worker/src/scheduler.ts)) | croner in IST, overlap protection, `--once <job>`, graceful drain, JSON logger, the `gated()` exchange-calendar wrapper | New jobs registered the same way. Subscription polling is `gated` (bidding happens on trading days only). |
| **Public-data ingestion** ([india-disclosures.ts](../../apps/worker/src/sources/india-disclosures.ts), [ingest-disclosures.ts](../../apps/worker/src/jobs/ingest-disclosures.ts)) | Pure Zod parsers separate from transport, a provider-neutral `DisclosureSource` in `packages/market-data`, `withFeedHealth()` writing `feed_ingestion_runs`, and `parseDdMonYyyy`, `parseIstTimestamp`, `croreToPaise` | The same shape: an `IpoSource` boundary, pure parsers next to the adapter, and `withFeedHealth`. The date helpers get promoted to shared code rather than copied. |
| **Rate limiting** ([rate-limit.ts](../../packages/shared/src/rate-limit.ts), [circuit.ts](../../packages/shared/src/circuit.ts)) | `RateLimiter` token bucket and `PathCircuitBreaker` with `parseRetryAfter` | Wrapped into one polite HTTP client per source (§5.3), so nothing new is invented. |
| **DB** ([schema/](../../packages/db/src/schema/), [drizzle/](../../packages/db/drizzle/)) | Paise integers (`bigint` for large sums), `timestamptz` UTC, IST `date` keys, upserts on natural keys, the `reject_mutation()` trigger, and **hand-written migrations since 0018** (the drizzle-kit snapshot chain stops at 0017) | New `schema/ipos.ts`, plus a hand-written migration and a journal entry in the same style as `0021_institutional_flow.sql`. |
| **Feed health** (`feed_ingestion_runs`, `feedHealth()` in [repositories/flows.ts](../../packages/db/src/repositories/flows.ts)) | One row per attempt, with the error text | Reused as-is with new feed ids. **No new `ipo_scrape_runs` table is needed.** |
| **Web server layer** ([server/disclosures.ts](../../apps/web/src/server/disclosures.ts)) | `server-only` read services, `requireOwnerId()`, DTO mapping, freshness status | New `server/ipos.ts` in the same style. |
| **API** ([api/announcements/route.ts](../../apps/web/src/app/api/announcements/route.ts)) | Thin routes using `handle`/`ok`, `runtime = 'nodejs'`, `force-dynamic`, `no-store`, the shared error shape, and Zod for query filters in `*-schemas.ts` | New routes follow it exactly. |
| **Auth** ([middleware.ts](../../apps/web/src/middleware.ts), [require-user.ts](../../apps/web/src/server/auth/require-user.ts)) | Default-deny middleware, `getSessionUser()`, `getAdminUser()` | `/ipos` is gated by default. Every signed-in user can open it (D4). Only the source-health view uses `getAdminUser()`. |
| **UI** ([components/](../../apps/web/src/components/)) | `AppShell`, `Page*` layout, `MetricCard`, `DataTable`, `states.tsx` (empty/error), `Badge`, `Tabs`, `Skeleton`, Storybook stories, nav in [navigation.ts](../../apps/web/src/lib/navigation.ts) | Every IPO component is built from these. Nav gets an "IPOs" entry under **Market record**. |
| **Config** ([config/](../../config/)) | Versioned YAML validated with Zod at boot; "no admin CRUD UI" | Sources are enabled/disabled in `config/ipo-sources.yaml`, not in a table or an admin form. |

### Findings that shape the plan

- **The trading calendar exists** (`config/nse-calendar.yaml` plus `exchange_sessions`).
  It lets us compute SEBI's T+3 timeline (allotment T+1, refunds and demat credit T+2,
  listing T+3 working days) as **expected** dates until the official listing date appears.
- **Migration numbering collides.** `0026` is already used on three unmerged branches
  (`fix/bse-announcements`, `feat/multi-exchange-bse`, `feat/mobile-app`). The IPO
  migration takes whichever number is next **when it is written**.
- **CLAUDE.md still says "Current scope: watchlists only."** That is already stale, since
  `/today`, `/announcements` and `/flows` have shipped. Adding `/ipos` means updating that scope note too (Phase 9).
- **The existing NSE fetchers skip the cookie warm-up and still succeed from the VPS**
  (memory note *prod-data-coverage*). The IPO endpoints were tested *with* warm-up.
  Phase 0 checks whether they need it.

---

## 3. Source research (verified 2026-10-02)

### 3.1 Comparison

| Source | Kind | What it gives | Access, as tested | robots.txt | Terms and reuse | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **NSE IPO JSON**: `api/ipo-current-issue`, `api/all-upcoming-issues?category=ipo`, `api/public-past-issues`, `api/ipo-detail?symbol=&series=`, `api/ipo-active-category?symbol=`, `api/new-listing-today?index=RecentListing` | Official exchange | Mainboard and SME: dates, band, lot (SME via `lotSize`), face value, issue-size text, issue type, BRLMs, registrar and contact, RHP zip link, UPI cutoff, category-wise subscription with an "Updated as on" time, past issues with issue price and listing date, ISIN of recent listings | JSON `200` with a cookie warm-up and a **browser UA** (D2) | `Allow: /` | Redistribution subject to agreement (D3) | **Primary source, v1** |
| **NSE bhavcopy** `sec_bhavdata_full_DDMMYYYY.csv` | Official exchange | Listing-day open, high, low and close against `PREV_CLOSE`, which equals the issue price, for EQ/BE/SM/ST. Also the latest close for "since listing" | Static CSV, already fetched daily by `ingest-delivery` | Allowed | As above | **v1 listing performance** |
| **BSE public issues** | Official exchange | BSE-only SME issues, BSE scrip codes, BSE-side subscription | The site is an Angular SPA whose IPO API sits in lazy chunks and was not identified **(verify)**. Its Akamai quirks are known from `fix/bse-announcements` (`node:https` plus `insecureHTTPParser`) | No robots.txt (the SPA returns HTML) | BSE terms **(verify)** | **Phase 10** |
| **SEBI offer documents** | Regulator | DRHP filings (the pipeline before dates are set), RHP and prospectus PDFs | HTML listings plus PDFs. The TLS chain failed verification from curl, so Node will need the intermediate certificate **(verify)** | Not retrievable (TLS) | Statutory public documents **(verify)** | **Phase 11** (documents and pipeline) |
| **Registrars** (MUFG Intime, KFin, Bigshare, Cameo, Mudra, Skyline, …) | Intermediary | Allotment status | Interactive PAN entry plus captcha | n/a | Must not be automated | **Deep link only** (`config/ipo-registrars.yaml`) |
| **Chittorgarh** | Aggregator | Everything, plus GMP and reviews | HTML | `Allow: /` (blocks AI and SEO bots) | "No user of this website may distribute, modify, transmit, or use the contents of this website in any manner for public or commercial purposes without prior written permission" | **Excluded** unless written permission is obtained |
| **IPO Watch** | Aggregator | GMP and dates | WordPress | Allows everything except `/wp-json/*` | "Limited license … solely for your own personal, noncommercial use"; "shall not access the Site in order to build a similar or competitive website" | **Excluded** |
| **InvestorGain** | Aggregator | GMP (current and range), the time GMP was last updated, plus subscription and dates that we **ignore** | One HTML page (`/report/ipo-gmp-live/331/`) with the rows embedded as JSON. It accepted an **honest UA** (`200`). Its data host `webnodejs.investorgain.com` also exists | `Allow: /` for `*` on both hosts; `Content-Signal: search=yes, ai-input=yes, ai-train=no` | No terms forbidding reuse were found, but no licence either. Its disclaimer says GMP is "based on market sources and perception". Its code sends referral links through `re.chittorgarh.com`, so it may belong to Chittorgarh Infotech **(verify)** | **v1 GMP source, GMP feed only** (D1). Ask for written permission in parallel |
| **Moneycontrol / Economic Times** | News publishers | News and reviews | HTML | Many disallows | Publisher copyright; terms not reviewed in detail | **Not a data source.** Optional outbound news links later |

robots.txt only says what a crawler may *fetch*. It grants no right to republish. The
terms column is what excludes the aggregators.

### 3.2 What NSE's detail payload contains (VNL, 2026-10-02)

`issueInfo.dataList` is a list of `{title, value}` pairs, so it is parsed **by title, not by position**:
Issue Period · UPI mandate cut-off · Issue Size (free text) · Issue Type · Price Range ·
Discount · Face Value · Tick Size · Bid Lot · Minimum Order Quantity · Maximum Subscription
Amount for Retail Investor · Book Running Lead Managers · Sponsor Bank · Name/Address/Contact
of the Registrar · Ratios/Basis of Issue Price (zip) · **Red Herring Prospectus (zip)** · Bidding Centers · Remark.
It also carries `activeCat` and `bidDetails` (category subscription: QIB, NII, bNII
(>₹10 lakh), sNII (₹2–10 lakh), RII, sub-rows and Total, with offered and bid share counts),
`demandGraph`/`demandGraphALL` (cumulative demand by price), and `demandDataNSE`/`demandDataBSE`.

Quirks the parsers must handle, each of which becomes a fixture test:
- Values arrive wrapped in literal quotes (`"\"Rs. 2,00,000\""`) and some contain raw HTML
  (`<a href=… target=new>`). **Source HTML is never rendered.** Tags are stripped and
  links are pulled out only through a host allowlist.
- **SME detail payloads have no `Bid Lot` row.** The lot comes from the calendar's `lotSize`.
- Price formats include `Rs.208 to Rs.220`, `Rs. 385 to Rs. 405 per Equity Share`,
  `Rs.1000`, a bare `402` (old SME) and `-`. The past-issue `issuePrice` comes left-padded (`"   405"`).
- Dates come as `05-Oct-2026` and as `01-OCT-2026`.
- Issue size mixes units in one sentence: "fresh issue aggregating up to 14500 **lakhs** and
  offer for sale up to **15,00,000 Equity Shares**". Numbers use Indian digit grouping.
- `ipo-current-issue.issueSize` is a **share count**, not rupees.
- The calendar mixes in non-equity issues: `DEBT`, `N0`… (NCDs), `IV` (InvITs), `RR` (REITs).
  An allowlist decides which series count as equity IPOs (`EQ`, `BE` → mainboard; `SME`, `SM`, `ST` → SME).
- **Subscription scope (settled in Phase 0).** `ipo-current-issue` and the detail's `bidDetails` are
  **NSE-only** bids: their totals equal `demandGraph.TOTAL_BIDS`. `ipo-active-category` is the
  **consolidated NSE+BSE** figure, ≈ `demandGraphALL.TOTAL_BIDS`. Snapshots store a `scope` so the UI never mixes them up.
- **SME payloads use a `Lot Size` title** (no `Bid Lot` or `Minimum Order Quantity`). An SME QIB row can show
  `offered: 0` with bids, so `times` must come out null rather than infinite.
- `public-past-issues` rows carry `linkRemovalDate`, but **detail survives for years (settled in Phase 0).**
  `ipo-detail` returned full facts and bid rows for issues listed 1 month, 4 months, 1 year and 2
  years ago; only the 2024 SME issue lacked an RHP link. The backfill can therefore fetch history
  (paced), and capture-on-sight remains as a safety net.
- `Eventions` appears with `"isBse":"1"`, yet InvestorGain lists it as **NSE SME**, so the flag does not mean
  BSE-listed and is ignored. **The BSE coverage gap is large (settled in Phase 0):** 26 of InvestorGain's
  50 current rows are **BSE SME** issues that NSE does not list. Phase 10 (the BSE source) is required for completeness.

### 3.3 Listing performance from the bhavcopy (2026-10-01 file)

```
AONESTEELS, EQ, 01-Oct-2026, PREV_CLOSE 405.00, OPEN 455.00, … CLOSE 416.55
MONEYVIEW,  EQ, 01-Oct-2026, PREV_CLOSE  34.00, OPEN  55.00, … CLOSE  53.88
```
The issue prices were ₹405 and ₹34, so `PREV_CLOSE` is the issue price on listing day.
Listing gain is +12.3% for AONESTEELS and +61.8% for MONEYVIEW. The file has 389 `SM` and 87 `ST` rows, so SME is covered.

### 3.4 Requested fields with no structured official source

| Field | Where it actually lives | Plan |
| --- | --- | --- |
| Company overview | RHP "Our Business" / "Summary of the Offer Document" | Phase 11 extract, cited by page |
| Promoters | RHP "Our Promoters and Promoter Group" | Phase 11 |
| Financial summary | RHP restated financial summary table | Phase 11 (table extraction is the most fragile step) |
| Objects of the issue | RHP "Objects of the Offer" | Phase 11 |
| Strengths / risks | RHP "Our Strengths" / "Risk Factors" (the company's own words) | Phase 11, attributed and never paraphrased into an opinion |
| Anchor investors | Exchange anchor-allocation filing / RHP addendum | Phase 11 **(verify)** |
| GMP | Nowhere official. Aggregators only | InvestorGain, labelled unofficial (§3.5) |

NSE's "Ratios / Basis of Issue Price" zip turned out to hold **newspaper price-band ad
PDFs** (18 MB). It is not structured, so it is not a shortcut to financials.

### 3.5 The GMP source: InvestorGain live GMP page (checked 2026-10-02)

- **One request covers every IPO.** `GET https://www.investorgain.com/report/ipo-gmp-live/331/`
  (the old URL `/live-ipo-gmp/331/` redirects here) returns server-rendered HTML that embeds
  the report's rows as JSON. That JSON sits in the Next.js flight data
  (`self.__next_f.push(...)`). The visible `<table id="reportTable">` is filled from it on the client.
- **The columns the report declares** are: Name, GMP, Sub, Price, Est Listing, IPO Size,
  Lot, Open, Close, BoA Dt, Listing, **GMP Updated**. Rows also carry `~ipo_name`,
  `~gmp_percent_calc`, `~ipo_category1` (`IPO`/`SME`), `~ipo_status1`, `~max_gmp1`/`~min_gmp1`
  (the GMP range so far), sortable dates (`Srt_Open`, `Srt_Close`, `Srt_BoA_Dt`,
  `Str_Listing`) and a per-IPO page path (`urlrewrite_folder_name`, e.g. `/gmp/…-ipo/2366/`).
- **We keep only:** the name, board, open and close dates (used for matching only), GMP in
  ₹, the min/max range, the "GMP Updated" time and the per-IPO page URL (for attribution).
  Their subscription, price, lot, size and estimated-listing-price columns are **discarded**.
  Official facts come from NSE only.
- **Fragility.** Parsing embedded flight data is more brittle than a JSON API. The parser
  locates the row array by its known keys, validates every row with Zod, and fails the feed
  loudly on a shape change. An unparseable page never turns into empty GMP. A JSON data host
  (`webnodejs.investorgain.com/cloud/v2/report/data-read/…`) exists and is the fallback
  transport to evaluate in Phase 8 **(verify)**.
- **Load.** 1 request per run, 3 runs a day, sent with an honest UA.
- **Row format (settled in Phase 0).** The rows sit at `resultData.initialTableResponse.reportTableData`
  on one flight-data line. Each row has `~ipo_name`, `~ipo_category1` (`IPO`/`SME`), `~ipo_status1`
  (`U`, `O`, `CT`, `C`, `LT`, `LP`, `LN`, `L`), ISO dates `~Srt_Open`/`~Srt_Close`/`~Str_Listing`,
  and `~urlrewrite_folder_name`. The `Name` HTML carries the exchange tag (`IPO`, `NSE SME`, `BSE SME`).
  The `GMP` HTML reads `₹<b>20</b> (9.09%) … 2 ↓ / 20 ↑`, where `--` means no quote, decimals and negatives occur,
  and the range is the low/high so far. `Updated-On` reads `2-Oct 7:02` (IST, **no year**), so the year is
  taken from `initialTableResponse.currentTime`, with a December→January rollover rule.

---

## 4. Feasibility and risk

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| NSE changes a JSON shape | Medium (yearly) | One feed fails | Zod plus pure parsers with captured-fixture tests. `withFeedHealth` records the failure. The last good data stays visible with a "stale since" banner. |
| NSE blocks the VPS IP or tightens Akamai | Low–medium | Feed goes dark | The existing NSE feeds succeed from the VPS today. Use `PathCircuitBreaker`, honour `Retry-After`, cap the request budget per run, and degrade to stale. Phase 0 tests from the VPS. |
| The browser-UA requirement (D2) | Certain | Ethical/legal exposure | An owner decision, conservative rates, and NSE only. If NSE objects or offers a licence, switch. |
| Redistribution rights (D3) | Unresolved | Legal | Signed-in only, attribution on every figure, no public/SEO surface. |
| Detail disappears after listing | Likely | No history for old IPOs | Capture-on-sight, with source records keeping each payload version (§6). |
| Free-text parsing (issue size, lot) | High variance | Wrong numbers | Never guess. Store and show the **verbatim text** whenever a parse is partial, and mark derived values (§6.3). |
| Subscription scope confusion | Medium | Misleading "×" | Store `scope`, label "consolidated NSE+BSE" or "NSE bids only", and show the source's "as of" time. |
| BSE-only SME issues missing until Phase 10 | Medium | Coverage gap | Say so on the page: "Covers issues bid on NSE. BSE-only SME issues arrive later." |
| SEBI RA exposure through editorial | Low if the rules hold | Regulatory | No opinions or scores (§1). A copy-review checklist runs in Phase 6. |
| XSS through source HTML | Medium | Security | Text-only rendering, tag stripping in the parser, and a link host allowlist (the pattern of `officialAnnouncementUrl` in core). |
| GMP source objects or sends a takedown | Low–medium | GMP disappears | Request written permission up front. The feed is one YAML flag, so the UI falls back to the GMP explainer with no deploy. Their content is never mirrored beyond the numbers and a link. |
| GMP page shape changes (embedded flight data) | Medium–high | GMP goes stale | A Zod-validated parser on captured fixtures. The feed fails loudly and shows "GMP last updated N hours ago" rather than blanking. The JSON data host is the evaluated fallback. |
| GMP row attached to the wrong IPO | Medium | A wrong number on the wrong company | Match on normalised name **and** open/close dates **and** board (§6.3). An unmatched or ambiguous row is dropped and listed in admin health, never guessed. |
| Users read GMP as a forecast | High | User harm | Show it as "unofficial premium", never as "expected listing price" or "expected gain". The badge stays on every GMP figure, and each detail page shows the GMP track record against actual listings (§10.2). |
| IST/UTC mistakes on dates | Medium | Off-by-one-day statuses | IST `date` keys for calendar days and `timestamptz` for instants (UPI cutoff, "as of"), with tests at the midnight IST boundary. |

**Load on NSE.** In a typical week with 5–15 active issues, the volume works out to about
4 calendar calls, up to 15 detail calls, about 6 runs × open issues for subscription, and 1 bhavcopy file per day.
That is **well under 150 requests a day**, paced at least 2 s apart, one at a time. This is less than a person clicking through the IPO pages.
**Load on InvestorGain:** 3 page requests a day.

---

## 5. Architecture

```
config/ipo-sources.yaml ──► apps/worker/src/sources/ipo/
                              http.ts      polite client: robots, rate, retry, circuit, cookies
                              nse.ts       NSE transport + pure parsers (fixtures)
                              investorgain.ts  GMP only — page + embedded-row parser (fixtures)
                              (bse.ts)     Phase 10
                                │  RawIpo* (packages/market-data/src/ipos.ts — the boundary)
                                ▼
apps/worker/src/jobs/ingest-ipos.ts  ── withFeedHealth ──► feed_ingestion_runs
        │ uses packages/core/src/ipos/*  (pure: match, resolve, status, timeline, money)
        ▼
packages/db  ipo_source_records → ipo_issues (+ subscriptions, documents, listing perf)
        ▼
apps/web/src/server/ipos.ts ──► /api/ipos/* (thin) and /ipos pages (SSR)
```

### 5.1 Why TypeScript in the worker, and not Python or Playwright

- **CLAUDE.md's stack rule says "No Python in the app."** Python's scraping ecosystem
  would only help with HTML-heavy sources, and the primary source here is JSON.
- **Playwright is not needed.** The NSE endpoints answer plain `fetch`. A headless
  Chromium on a single shared VPS costs hundreds of MB, and its main use would be getting
  past bot protection, which is a sign not to scrape that site.
- **Cheerio** (or similar) is added **only** when a real HTML source arrives (SEBI
  listings, Phase 10/11), with the dependency justified at that point.
- **PDF parsing** waits for Phase 11. The candidates are `unpdf` (pdf.js) plus `fflate`
  for the NSE RHP zips, chosen then.

### 5.2 Source adapters and the boundary

`packages/market-data/src/ipos.ts` is a sibling of `disclosures.ts` and defines provider-neutral shapes:

```ts
export type IpoBoard = 'mainboard' | 'sme';
export interface RawIpoListing   { source; externalKey; companyName; board; symbol; series;
                                   openDate: string | null; closeDate: string | null; listingDate: string | null;
                                   priceBand: { lowPaise; highPaise } | null; issuePricePaise: number | null;
                                   lotSize: number | null; sharesOffered: number | null; isin: string | null;
                                   sourceStatus: string | null; sourceUrl: string }
export interface RawIpoDetail    { …facts parsed by title…; issueSizeText: string; leadManagers: string[];
                                   registrar: { name; contact } | null; documents: RawIpoDocument[]; sourceUrl }
export interface RawIpoSubscription { scope: 'nse'|'bse'|'consolidated'; asOf: Date;
                                   rows: { category: IpoCategory; label: string; sharesOffered: number|null; sharesBid: number }[] }
export interface RawListingDay   { symbol; series; tradingDate; prevClosePaise; openPaise; highPaise; lowPaise; closePaise; volume }
export interface IpoSource {
  readonly id: string;
  fetchCalendar(): Promise<RawIpoListing[]>;
  fetchDetail(key: IpoKey): Promise<RawIpoDetail | null>;
  fetchSubscription(key: IpoKey): Promise<RawIpoSubscription | null>;
  fetchListingDay(date: string): Promise<RawListingDay[]>;
}

/** Unofficial grey-market premium — a separate boundary so it can never fill an official field. */
export interface RawGmpQuote     { source; externalKey; companyName; board: IpoBoard;
                                   openDate: string | null; closeDate: string | null;   // matching only
                                   gmpPaise: number | null;  // null = source shows "-" (no quote), not zero
                                   rangeLowPaise: number | null; rangeHighPaise: number | null;
                                   updatedAt: Date | null;   // the source's "GMP Updated", IST → UTC
                                   pageUrl: string }
export interface GmpSource {
  readonly id: string;
  fetchGmp(): Promise<RawGmpQuote[]>;
}
```

The GMP source implements **`GmpSource` only, not `IpoSource`**. The type system therefore
guarantees aggregator data cannot reach the calendar, detail, subscription or listing tables.

Every adapter method **throws** on transport or shape failure, as the disclosure source
does, so feed health records the reason. A source that does not support a method returns
`null` or `[]` and declares that in YAML.

### 5.3 The polite HTTP client (`sources/ipo/http.ts`)

One instance per source, configured from YAML:

- **robots.txt is enforced in code.** It is fetched once per host per run, parsed for
  the `*` and own-UA groups, and a disallowed path throws before any request is sent.
  An HTML or absent robots file counts as "no rules" and is logged.
- **Rate.** `RateLimiter` with `perSecond ≤ 0.5`, a per-minute cap and a per-run budget
  (NSE: `minIntervalMs: 2000`, `maxRequestsPerRun: 60`), and **concurrency 1**.
- **Retry.** Only on network errors, `429` and `5xx`, with at most 3 attempts,
  exponential backoff with full jitter, and `Retry-After` honoured through `parseRetryAfter`.
  `4xx` other than `429` is never retried.
- **Circuit.** `PathCircuitBreaker`. After a ban or repeated failures, the host is
  skipped for the rest of the run, and the job records a failed feed rather than hammering.
- **Session.** A cookie jar built on `Headers#getSetCookie()`, with no new dependency.
  NSE gets one warm-up GET of the IPO HTML page per run, and a re-warm on `401`/`403`, once.
- **Caching.** A per-run memo of identical URLs. The payload hash (`sha256` of the
  normalised payload) is compared with the last stored record, so an unchanged payload
  only bumps `last_seen_at` (§6.1).
- **Timeouts** of 15 s for JSON and 30 s for files. `AbortSignal` is threaded through so
  shutdown's drain window is respected.
- **User-Agent** comes from YAML per source. An honest
  `EquityWise/1.0 (+https://equitywise.io; support@equitywise.io)` is the default, and NSE
  is the browser-UA exception (D2).

### 5.4 `config/ipo-sources.yaml` (enable or disable without code)

```yaml
# Versioned config (CLAUDE.md: config is YAML, no admin CRUD). Zod-validated at
# worker boot; an invalid file fails startup, like intraday-orb.yaml.
sources:
  nse:
    enabled: true
    kind: official_exchange
    userAgent: browser            # D2 — the only source allowed this
    minIntervalMs: 2000
    maxRequestsPerRun: 60
    feeds: [calendar, detail, subscription, listing]
  bse:
    enabled: false                # Phase 10
    kind: official_exchange
    userAgent: equitywise
    minIntervalMs: 3000
    maxRequestsPerRun: 40
    feeds: [calendar, detail, subscription, listing]
  investorgain:
    enabled: true                 # D1 — flip to false on a takedown; UI falls back to the explainer
    kind: aggregator
    userAgent: equitywise         # accepted (200) on 2026-10-02
    minIntervalMs: 5000
    maxRequestsPerRun: 2
    feeds: [gmp]                  # GMP only — never a source for official fields
    attribution: { name: InvestorGain, url: https://www.investorgain.com/report/ipo-gmp-live/331/ }
equitySeries:                     # everything else (DEBT, N0…, IV, RR) is ignored
  mainboard: [EQ, BE]
  sme: [SME, SM, ST]
fieldPriority:                    # §6.3 — the issue's designated exchange always wins first
  fallback: [nse, bse, sebi]
documentHosts: [nseindia.com, nsearchives.nseindia.com, archives.nseindia.com, bseindia.com, sebi.gov.in]
```

`config/ipo-registrars.yaml` maps a registrar name pattern to its public allotment-status
page, for example MUFG Intime → `in.mpms.mufg.com/Initial_Offer/public-issues.html`
**(verify each URL in Phase 0)**. These are links, never automated lookups.

### 5.5 Manual refresh

- **There is no in-app refresh button.** An admin runs
  `pnpm --filter @equitywise/worker dev -- --once ingest-ipo-calendar` (or any IPO job) on
  the VPS. This is the existing operational pattern, and it keeps the web app from ever triggering upstream requests.
- **Later, only if wanted:** an admin button that inserts a row into
  `ipo_refresh_requests`, which the worker polls each minute. That is a small queue, and it is listed for an explicit decision rather than built by default.

---

## 6. Database design (`packages/db/src/schema/ipos.ts`)

The rules follow CLAUDE.md. Money is integer paise in `bigint`, because issue sizes reach
about ₹30,000 cr, which is 3×10¹³ paise and still within the safe-integer range. Calendar days are IST
`date` keys. Instants are `timestamptz`. Ratios and percentages are derived and never stored as truth.
Every fact carries its source.

**Tables this plan does not create.** `ipo_sources` is replaced by YAML (§5.4).
`ipo_scrape_runs` is replaced by the existing `feed_ingestion_runs`. `ipo_events` is
replaced by derivation from the date columns in core (§7). `ipo_financials` waits for Phase 11.
Empty tables are not created ahead of their phase. `ipo_gmp_snapshots` is created in Phase 1 (§6.7).

### 6.1 `ipo_source_records`: every observation, with history

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `ipo_id` | bigint FK → `ipo_issues`, **nullable** | null means unmatched, surfaced in admin health |
| `source` | text | `nse`, `bse`, … |
| `feed` | text | `calendar` \| `detail` \| `subscription` \| `listing` |
| `external_key` | text | e.g. `nse:VNL:EQ:2026-09-30` (symbol, series and open date, so a reused symbol never merges) |
| `source_url` | text | the exact URL fetched |
| `payload` | jsonb | the **normalised** `RawIpo*`, not the raw HTML or JSON blob |
| `payload_hash` | text | sha256 of the canonicalised payload |
| `first_seen_at` / `last_seen_at` | timestamptz | |

`UNIQUE (source, feed, external_key, payload_hash)`. A changed payload inserts a new row,
which gives a free change history ("price band revised", "lot changed"). An unchanged one
only bumps `last_seen_at`. A trigger allows updates to `last_seen_at` and `ipo_id` only.

### 6.2 `ipo_issues`: the canonical record, one row per IPO

| Group | Columns |
| --- | --- |
| Identity | `id` bigint PK · `slug` text UNIQUE (`vishal-nirmiti-ipo-2026`) · `company_name` · `board` (`mainboard`\|`sme`) CHECK · `issue_method` (`book_building`\|`fixed_price`) · `designated_exchange` · `exchanges` text[] |
| Identifiers | `nse_symbol`, `nse_series` · `bse_scrip_code` · `isin`. These are partial-unique: `(nse_symbol, open_date)`, `isin`, `bse_scrip_code`. |
| Dates (IST) | `open_date`, `close_date`, `listing_date` (official only) · `allotment_date`, `refund_date`, `demat_credit_date` (only when a source states them; otherwise derived as *expected*) · `upi_cutoff_at` timestamptz |
| Price | `price_band_low_paise`, `price_band_high_paise` (fixed price means low = high) · `issue_price_paise` (final) · `face_value_paise` |
| Size | `lot_size`, `min_bid_quantity` · `shares_offered` · `fresh_issue_shares`, `fresh_issue_paise`, `ofs_shares`, `ofs_paise` · `issue_size_text` (**verbatim**, always kept) |
| Parties | `registrar_name`, `registrar_contact` · `lead_managers` text[] · `market_maker` (SME) |
| Lifecycle | `lifecycle_override` (`withdrawn`\|`postponed`, only when a source says so) |
| Provenance | `field_sources` jsonb: `{ field: { source, url, observedAt, basis: 'official'\|'derived'\|'conflict' } }` |
| Audit | `first_seen_at`, `updated_at` |

CHECKs: `low ≤ high`, prices `> 0`, `lot_size > 0`, `close_date ≥ open_date`, and
`listing_date ≥ close_date`. Indexes on `open_date desc`, `close_date`, `listing_date desc`
and `board`. Search uses `ILIKE` on name and symbol; at hundreds of rows a year, no `pg_trgm` is needed.

**There is no `status` column.** Status depends on "today", so it is derived (§7) and never goes stale.

### 6.3 Dedup, matching and source priority (pure, in `packages/core/src/ipos/`)

**Matching** (`matchIpo(candidate, existing)`) tries these in order, and the first hit wins:
1. `isin` exact.
2. `nse_symbol` with `open_date` within ±10 days. Symbols can be reused years apart.
3. `bse_scrip_code` exact.
4. Normalised company name exact with `open_date` within ±3 days. Normalising lowercases
   the name, drops punctuation and strips only the legal suffixes (`limited`, `ltd`,
   `private`, `pvt`). It never strips words like "India".
5. A name-only match is **probable**. It is never auto-merged; the record stays unmatched and is listed in admin health.

**Resolution** (`resolveIpo(records, priority)`) works one field at a time:
- The **designated exchange** of the issue wins, then the other exchange, then SEBI documents, then values *derived* by us.
- Within one source, the most recent observation wins.
- When two official sources disagree, the higher-priority value is shown, `basis` is set to
  `conflict`, and the disagreement is listed in admin health.
- Derived values (for example ₹ issue size from shares × upper band, or expected T+3
  dates) are always `basis: 'derived'` and render with a marker such as "derived at upper band" or "expected".

There is **no numeric confidence score**. CLAUDE.md forbids a number the factors cannot
explain, and an official, derived or conflict label explains itself.

**Aggregator rule.** `kind: aggregator` sources are never in `fieldPriority`. They can only
write `ipo_gmp_snapshots`, and the type boundary in §5.2 enforces this. GMP rows are matched
with a stricter version of the rules above, since the source has no exchange symbol or ISIN.
A match needs the same board, open **and** close dates that agree within ±1 day, and name
**token containment**: the aggregator shortens names ("A-One Steels" for "A-One Steels India Limited",
"Nityas Gems & Jewellery" for "Nityas Gems and Jewellery Limited"), so every normalised token of the
aggregator's name must appear in the official name. Normalising lowercases, turns `&` into `and`,
drops apostrophes, turns other punctuation into spaces, and drops `limited`/`ltd`/`private`/`pvt`/`and`/`the`.
If two issues still qualify, the row is ambiguous and is held as unmatched.

### 6.4 `ipo_subscription_snapshots`: append-only time series

| Column | Notes |
| --- | --- |
| `ipo_id` FK · `source` · `scope` (`nse`\|`bse`\|`consolidated`) · `as_of` timestamptz (the source's "Updated as on" time) | |
| `category` | CHECK in `qib, nii, nii_big, nii_small, retail, employee, shareholder, policyholder, other, total` |
| `category_label` | verbatim source label |
| `shares_offered` bigint null · `shares_bid` bigint · `applications` bigint null · `fetched_at` | |

`PK (ipo_id, source, scope, as_of, category)`. Rows are inserted with
`ON CONFLICT DO NOTHING`, so repeated polls of the same "as of" are no-ops. The existing
`reject_mutation()` trigger makes them append-only. "× subscribed" is derived as `bid ÷ offered`.

### 6.5 `ipo_documents`

`id` · `ipo_id` FK · `kind` CHECK (`drhp`, `rhp`, `prospectus`, `addendum`,
`basis_of_allotment`, `anchor_allocation`, `price_band_ad`) · `title` · `url` (host must be
in `documentHosts`) · `source` · `first_seen_at`, `last_checked_at` · `sha256` null (filled
when Phase 11 downloads the file). `UNIQUE (ipo_id, url)`. **Link only.** The PDFs are never rehosted.

### 6.6 `ipo_listing_performance`

`ipo_id` FK · `exchange` · `listing_date` · `issue_price_paise` · `listing_open_paise`,
`listing_high_paise`, `listing_low_paise`, `listing_close_paise`, `listing_volume` ·
`latest_close_paise`, `latest_close_date` · `source`, `source_url`, `updated_at`.
`PK (ipo_id, exchange)`. The listing-day columns are written once and frozen by trigger;
the `latest_*` columns roll forward daily for issues listed within the last 365 days.

### 6.7 `ipo_gmp_snapshots`: append-only and unofficial

| Column | Notes |
| --- | --- |
| `ipo_id` FK · `source` (`investorgain`) | |
| `observed_at` timestamptz | The source's "GMP Updated" time. When the source gives none, it is the fetch time and `observed_at_basis = 'fetched'`. |
| `gmp_paise` bigint **null** | Premium over the upper band, in paise. It **can be negative** (a discount). Null means the source showed no quote, which is never zero. |
| `range_low_paise`, `range_high_paise` bigint null | The GMP range the source reports so far |
| `source_url` | The per-IPO page on the source, linked from the UI for attribution |
| `fetched_at` timestamptz | |

`PK (ipo_id, source, observed_at)`. Rows are inserted with `ON CONFLICT DO NOTHING` and
protected by the `reject_mutation()` trigger. Each fetch also writes an
`ipo_source_records` row with `feed = 'gmp'`, so a source's changes stay auditable. The
GMP percentage is derived at read time as GMP ÷ upper band; it is not stored.

### 6.8 Size

The data is tiny. With about 300 IPOs a year, subscription snapshots come to about 300 × 3 days ×
6 polls × 9 categories ≈ 50k rows a year. GMP snapshots add about 300 × 10 days × 3 ≈ 9k
rows a year. Source records are a few MB a year. **No hypertables** and no compression policy are needed.

### 6.9 Migration

The migration is a hand-written `00NN_ipos.sql` plus a `_journal.json` entry, in the
style of `0021_institutional_flow.sql`. The number is whatever is next when it is written (§2).
The migration is applied to the local Docker TimescaleDB first and never to production first.

---

## 7. Core domain functions (`packages/core/src/ipos/`, pure and fully tested)

| Function | Purpose |
| --- | --- |
| `ipoStatus(issue, todayIst)` | Returns `upcoming` (no dates yet, or before open), `open`, `closed`, `listed`, or `withdrawn`/`postponed` from the override. |
| `ipoStage(issue, todayIst, calendar)` | The sub-stage of a closed issue: `allotment_pending` → `allotment_done` → `listing_pending`. |
| `expectedTimeline(closeDate, calendar)` | SEBI T+3 in **trading days**, using `config/nse-calendar.yaml` holidays: T+1 allotment, T+2 refunds and demat credit, T+3 listing. Each date is labelled expected until a source states it. |
| `minInvestmentPaise(issue)` | `(min_bid_quantity ?? lot_size) × price_band_high_paise`, in integer maths with a safe-range guard. No SME-specific rule is hard-coded; the source's minimum order quantity is used. |
| `maxRetailLots(issue, capPaise)` | The number of lots that fit under the retail cap the source states (₹2,00,000 today). |
| `issueSizePaise(issue)` | Fresh issue plus OFS. The OFS rupee value is derived at the upper band when only shares are known, and the basis is returned with the result. |
| `subscriptionTimes(row)` | `bid ÷ offered`, or null when offered is unknown. Never a zero. |
| `listingGain(issuePrice, price)` | A percentage from paise integers, for display only. |
| `gmpPercent(gmpPaise, upperBandPaise)` | The premium as a % of the upper band, or null when either side is unknown. It is labelled "unofficial premium", never "expected gain". |
| `gmpTrackRecord(listed)` | For listed IPOs that had a GMP: the **last GMP before listing** (as a %) against the **actual listing-open gain**, per issue and in aggregate. The aggregate is a count, e.g. "within ±10 points in 41 of 63 listings", with the list behind it. It is a breakdown, not a score. |
| `matchIpo`, `resolveIpo`, `slugFor` | §6.3 |
| Unit parsers | Indian digit grouping (`15,00,000`), lakh/crore → paise via `rupeesToPaise`, `parseDdMonYyyy` (promoted from `india-disclosures.ts`), and the `Rs.` price/band forms. |

Source-specific string parsing (NSE's title/value pairs) stays in the adapter. Generic
domain rules live in core. This is the same split the disclosure code uses.

---

## 8. Worker jobs (`apps/worker/src/jobs/ingest-ipos.ts`)

| Job | Schedule (IST) | Requests per run | What it does |
| --- | --- | --- | --- |
| `ingest-ipo-calendar` | `40 8,12,18 * * 1-5` and `40 9 * * 6` | 1 warm-up + 3 | Current, upcoming and past issues → source records → match/resolve → `ipo_issues`. Newly seen active issues are queued for detail in the same run. |
| `ingest-ipo-details` | `50 7 * * 1-6` (after a calendar run discovers a new symbol, it runs inline) | 1 per active issue, ≤ 25 | `ipo-detail` for upcoming, open, closed-not-listed, and issues listed within the last 7 days. Writes facts, documents and registrar. Capture-on-sight. |
| `ingest-ipo-subscriptions` | `35 10,12,14,16 * * 1-5`, `35 17 * * 1-5`, `5 19 * * 1-5`. **Calendar-gated.** | 1 per **open** issue | `ipo-active-category` → snapshots. The 19:05 run catches the final-day numbers. |
| `ingest-ipo-listings` | `25 19,20 * * 1-5`, after the bhavcopy lands (18:30–19:30) | 1 bhavcopy + 1 `RecentListing` | Listing-day row for issues listing that day, ISIN capture, and `latest_close` for issues listed within 365 days. |
| `ingest-ipo-gmp` | `15 10,15,20 * * *`, every day, since GMP is quoted on weekends too | 1 page from InvestorGain | Parse the embedded rows → match to `ipo_issues` with the strict rule (§6.3) → insert snapshots. Skipped as a logged no-op when `investorgain.enabled` is false. Unmatched rows are recorded for admin health. |
| `backfill-ipos` | On demand only (`--once backfill-ipos`; the placeholder schedule never fires, as with `backfill-flows`) | Paced and capped | Loads the full past-issue list (1 request), then fetches the listing-day bhavcopy only for issues listed in the last 24 months, one file per listing date at 2 s spacing. Detail is fetched only where NSE still serves it. |

Every job:
- runs inside `withFeedHealth(context, feedId, …)` with feeds `ipo-nse-calendar`,
  `ipo-nse-detail`, `ipo-nse-subscription`, `ipo-nse-listing` and `ipo-gmp-investorgain`;
- reads `config/ipo-sources.yaml`, so a disabled source is a logged no-op;
- isolates failures **per issue** (one bad detail page never fails the run) but fails the
  feed when the **envelope** is unparseable, so a shape change is loud;
- writes in transactions (source records, then resolved issue, then provenance together);
- never touches the market-data provider or a credential. This is a separate public data path, like the disclosures.

---

## 9. API (read-only for users)

Routes are thin and follow the house pattern: `handle`/`ok`, `runtime = 'nodejs'`,
`force-dynamic`, `Cache-Control: no-store`, and query validation through Zod in
`server/ipo-schemas.ts`. Pages call `server/ipos.ts` directly in SSR. The routes exist for
client-side filtering and the future Android app.

| Route | Query | Returns |
| --- | --- | --- |
| `GET /api/ipos` | `status=upcoming\|open\|closed\|listed`, `board=mainboard\|sme`, `exchange=nse\|bse`, `q=`, `page=` | `IposPageDto`: counts per status, highlights (open now, opening this week, closing today, listing this week), rows, paging, per-feed freshness, disclaimer |
| `GET /api/ipos/calendar` | `from=YYYY-MM-DD&to=` (≤ 62 days) | Days → events (`opens`, `closes`, `upi_cutoff`, `allotment`, `listing`), each with `expected: boolean` |
| `GET /api/ipos/[slug]` | none | `IpoDetailDto`: facts with `fieldSources`, timeline, subscription latest and history, documents, listing performance, sources used, registrar allotment link, last updated, disclaimer, and `gmp` (below) |
| `GET /api/ipos/gmp-track-record` | `months=12` (≤ 36), `board=` | Per listed issue: last GMP % before listing vs actual listing-open gain %, plus aggregate counts. Unofficial-labelled. |
| `GET /api/admin/ipos/health` | none | **Admin only** (`getAdminUser`, otherwise 403). Feed health, unmatched records, conflicts and parse warnings. Read-only. |

GMP travels in its own object, so no client can render it without its label:
`gmp: { official: false, source: { name, url }, latestPaise, percentOfUpperBand, rangeLowPaise, rangeHighPaise, observedAt, history: [...], stale: boolean } | { official: false, unavailable: 'no_quote' | 'source_disabled' | 'unmatched' }`.
List rows carry a compact `gmp: { latestPaise, percentOfUpperBand, observedAt } | null`.
The detail DTO also carries a `gmpTrackRecord` block, served by `GET /api/ipos/gmp-track-record`
for a page-wide version.

DTOs go in `apps/web/src/lib/ipo-types.ts`. Money is paise, instants are ISO strings,
dates are IST keys, and `null` means unknown, never zero. This matches `disclosure-types.ts`.
Errors use the shared `{ error, code, remedy }` shape, with 400 for bad filters and 404 for an unknown slug.
User routes have no write endpoints.

---

## 10. UI

### 10.1 `/ipos` (dashboard) and `/ipos/mainboard`, `/ipos/sme` (board lists)

**Redesigned 2026-10-02** after the owner approved mockups modelled on Chittorgarh's IPO
dashboard (canvas: https://claude.ai/artifact/NGYM1QEwEMK9aG6341oKHH). The first build's
single page (open-now cards, agenda, filterable table) was replaced by a dashboard plus
one full list per board. Old `/ipos?status=…` links redirect to the board list.

**`/ipos` — the dashboard** (`components/ipos/dashboard/`, `getIpoDashboard`):

1. **Header.** "IPO dashboard", a one-line description, a **Mainboard / SME** switch
   (links: `/ipos`, `/ipos?board=sme`), and "Exchange data as of … IST". A failed or stale
   feed is named in an alert below, as before.
2. **Six headline figures** for the board this year: listed in the year · open now · yet to
   list · upcoming · *opened above issue price* (n / listings with exchange prices) ·
   *above issue price now* (n / listings with a latest close). Counts and outcomes only —
   the denominators say how many listings have prices, never a projection.
3. **Modules** in a two-column grid from `lg` (one column below; rows fold to two lines on a
   phone), each a short table with a footer and, where there is one, a "view all" link:
   *Current & upcoming* (rows tinted open / yet to list, with a legend) · *Subscription*
   (retail and total ×, "At close" once bidding ends) · *Grey-market premium* (amber,
   **Unofficial** tag, source and time in the footer, plus the 12-month track-record
   sentence; GMP figures are never coloured as gains) · *Listing performance* (issue price,
   listing-day open %, latest close %) · *Next five days* (the next five settlement days,
   grouped by kind, \* for T+3 dates) · *Allotment status* (registrar and exchange links —
   EquityWise never looks an application up) · *Offer documents* (RHP links, sections
   quoted) · *Filed with SEBI* (mainboard only).
4. **Disclaimer** at the foot (§11).

**`/ipos/mainboard`, `/ipos/sme` — the board lists** (`components/ipos/list/`,
`getIpoListPage`): one table of every issue on the board for a year (default this year,
`?year=2025`, `?year=all`), status pills with counts (links, so filtering works without
JavaScript), a year picker and search (URL state), 25 rows a page. Columns: company and
symbol · status chip with its next date · bidding dates and issue size (`xl`) · price band ·
minimum investment and lot · subscribed · **GMP** (the "Unofficial" tag in the column
header) · listing-day and latest change. Below `lg` each issue becomes a compact block with
its figures in a grid. A legend explains the row tints, \* (expected T+3 date) and † (size
partly priced at the upper band).

States: `loading.tsx` skeletons for both, `error.tsx` with retry, and empty states that say
what is missing.

### 10.2 `/ipos/[slug]` (detail)

**Redesigned 2026-10-02** with the dashboard: chips (state, board, exchange · symbol, issue
type), "<Company> IPO", the UPI cut-off while open, then **five key figures** (price band,
minimum investment, issue size, subscribed — or listing-day change once listed — and the
amber, unofficial GMP tile). A main column (IPO details, timeline with done / next /
expected chips and the UPI cut-off row, **investment limits by category** — retail, small
NII and big NII in whole lots at the upper band, mainboard only, computed by core's
`investmentLimits` — subscription by category with bars against a 1× line and an
"All bids / NSE only" switch, day by day, listing performance, and the RHP quotes) beside a
sidebar (GMP, check allotment, parties, documents, where this comes from). Below `lg` the
columns dissolve into one reading order, with jump links to the main sections.

| Section | Content |
| --- | --- |
| Header | Company, badges (Mainboard/SME, NSE/BSE, status or stage), key-dates line, last updated |
| Key facts | Price band · issue price (once fixed) · lot · min. order qty · **minimum investment** · max retail lots · issue size (₹ cr and shares) · fresh / OFS split · face value · issue type. Each fact has a source tooltip; derived values carry a marker, and partial parses show the verbatim text. |
| Timeline | Open → close (with UPI cutoff) → allotment → refunds/credit → listing, marked done or upcoming, with official vs expected dates |
| Subscription | Category table (QIB, NII with bNII/sNII, Retail, Employee, Total) showing ×, shares bid and offered. Scope label and "as of" time. A day-by-day history chart reuses the existing chart components. |
| Listing performance (once listed) | Issue price → listing open (gain %) → listing-day close → latest close (as of date). Source: NSE bhavcopy. |
| Issue participants | Registrar and contact, an **"Check allotment status on the registrar's site ↗"** link, lead managers, market maker (SME) |
| Documents | RHP (and DRHP when known) as official links, with "Read the RHP before investing." |
| From the RHP (Phase 11) | Company overview, promoters, objects of the issue, the restated financial summary, and the company's own "Our Strengths" and Risk Factors headings. Each is quoted with its RHP page and labelled "auto-extracted from the RHP, page N". When extraction is missing or fails, the page shows a link to the RHP instead. |
| Grey-market premium (unofficial) | A bordered panel with a permanent **Unofficial** badge and a warning line. It shows the latest GMP in ₹ and as a % of the upper band, the GMP range so far, the "updated" time, the source name with a link ("via InvestorGain ↗"), and a small history chart of daily GMP snapshots. **How GMP compared with actual listings:** for this issue once listed, the last GMP % against the actual listing-open gain %; and site-wide, e.g. "In the last 12 months GMP was within ±10 points of the listing gain in 41 of 63 listings", linking to the full list. **Not shown:** "estimated listing price" or "expected gain". When there is no GMP (no quote, source disabled, or not matched), the panel says which, and shows the explainer: what GMP is, why it is unregulated and unenforceable, and that SEBI has proposed a regulated alternative. |
| Sources | Every source used, with URL, last fetched time and what it supplied |
| Disclaimer | §11 |

### 10.3 Language and components

- Badges read "Upcoming", "Open", "Closed: allotment pending", "Listing Tue 6 Oct" and "Listed".
  No page uses "Apply", "Subscribe now", "Recommended", "Avoid", "Hot" or "Target".
- Components live in `apps/web/src/components/ipos/`: shared `module-card` (the module
  card, the table that folds to two-line rows on a phone, `FactRow`), `ipo-chip` (state
  chips, row tints, the `Unofficial` tag), `board-tabs`, `ipo-figures`, `ipo-feeds`,
  `ipo-disclaimer`, `gmp-chip`; `dashboard/` (the view and its modules); `list/` (the board
  table, controls, route body); `detail/` (key figures, details, timeline, limits,
  subscription, listing, RHP, GMP panel with track record and explainer, allotment,
  parties, documents, sources). State wording comes from `statusParts` / `stateLabel` in
  `lib/ipo-format.ts`, unit-tested against the copy rules.
  Each gets a Storybook story with fixtures, per the design-system plan. GMP components
  accept only the DTO's `official: false` shape, so the "Unofficial" badge cannot be left off.
- `formatPaise()` is the only money formatter, with a crore/lakh helper added to `lib/format.ts` if one is missing.
  GMP gets a signed formatter (₹45 / −₹12). A negative GMP is a discount and is shown as one.
- Navigation adds a `ready` entry (`href: '/ipos'`, `label: 'IPOs'`) to the **Market
  record** group in `lib/navigation.ts` at launch, for every user (D4).
- The pages are QA'd at **phone and desktop widths, in light and dark themes, in the
  running app** before they are called done (memory notes *responsive-mandatory* and *verify-ui-changes-visually*).

---

## 11. Compliance and disclaimers

This text is shown on both pages, in the API DTOs, and near the subscription and GMP sections:

> **For information only — not investment advice.** EquityWise does not recommend applying
> for, or avoiding, any IPO. Figures are as published by the exchanges and may change or be
> revised; check the timestamp on each. Subscription figures show demand so far, not future
> performance. **Grey-market premium (GMP) is an unofficial, unregulated quote.** No
> exchange or regulator publishes it. EquityWise shows it as reported by a third-party
> website (InvestorGain) and does not verify it. It can change sharply or disappear, it is
> not a forecast of the listing price, and grey-market deals are not enforceable. Read the
> Red Herring Prospectus (RHP), especially its Risk Factors, before investing. Past listing
> gains, and past GMP accuracy, do not indicate future results.

A shorter GMP line appears next to **every** GMP figure, card and table header included:
*"Unofficial grey-market quote via InvestorGain — not verified, not a forecast."*

The Phase 6 copy review checks the following:
- no imperative investing verbs;
- no scores;
- every number either has a source or carries a derived/expected marker;
- every GMP figure carries the Unofficial badge and source, and none is worded as an
  estimate, expectation or target;
- RHP extracts (Phase 11) are quoted as the company's statements with page numbers;
- the disclaimer is present on every IPO surface.

---

## 12. Testing

| Layer | Tests |
| --- | --- |
| **Adapter parsers** (`sources/ipo/nse.test.ts`) | **Captured real fixtures** (Phase 0) for mainboard, SME, a listed issue, past issues, an active category and a bhavcopy excerpt. Cases: title/value parsing, quote-wrapped values, HTML stripping and link allowlist, the SME missing `Bid Lot`, every price-band form, both date casings, Indian grouping, mixed-unit issue size (14500 lakhs + 15,00,000 shares), the series allowlist, and envelope failures that must throw. |
| **GMP parser** (`sources/ipo/investorgain.test.ts`) | A captured page fixture. Cases: locating the embedded rows, Zod per row, `-` → null (not 0), negative GMP, range fields, "GMP Updated" IST → UTC, board mapping (`IPO`/`SME`), and a page with the rows missing **throws** (never "no GMP today"). |
| **Core** (`core/src/ipos/*.test.ts`) | Status at every boundary, including **midnight IST** and close day; expected T+3 timeline across a holiday and a weekend; minimum investment and max retail lots (hand-computed); issue size with its derived basis; subscription times (null offered → null); listing gain; matching (ISIN, symbol reuse years apart, name normalisation that never merges "X India" with "X"); resolver priority and conflict marking; the strict GMP match (same name but dates off → unmatched; a different board → unmatched); `gmpPercent` with a negative GMP; `gmpTrackRecord` counts against a hand-built set; and a check that an aggregator source can never be in `fieldPriority` (the config loader rejects it). Expected values are hand-computed and never derived from the implementation (the repo's rule). |
| **DB** (`packages/db/src/__tests__/ipos.test.ts`, local TimescaleDB) | CHECK constraints, partial-unique identifiers, append-only subscription and GMP snapshots (an UPDATE throws), the source-record hash dedup, the frozen listing-day columns |
| **Jobs** (`ingest-ipos.test.ts`) | A fake `IpoSource`: health rows on success and failure, per-issue isolation, a disabled source as a no-op, idempotent re-runs |
| **Polite client** (`http.test.ts`) | robots disallow blocks, `Retry-After` honoured, no retry on 404, budget cap, circuit opens after a ban, cookie warm-up, all with an injected clock and fetch |
| **Server/API** (`server/ipos.test.ts`) | DTO mapping, filter validation (400), unknown slug (404), admin health 403 for a user (while `/api/ipos*` answers any signed-in user), freshness states, the GMP DTO always `official: false`, GMP `stale` after 36 h |
| **UI** | View-model tests (formatting, empty-state copy, badges) in the `announcements-view.test.ts` style; Storybook stories for every component and state; manual QA at both widths and both themes |
| **Live check** (not CI) | `--once` on each job from the VPS, then `pnpm data:coverage`-style counts |

---

## 13. Phased implementation checklist

Sizes are S (½ day or less), M (about a day) and L (2+ days). The work goes on branch `feat/ipos` off `main`. **Nothing is pushed without the owner's say-so.**

**Phase 0: Spike and decisions (S).** *Exit: fixtures captured and (verify) items settled.*
- [x] Owner decisions D1–D5 (2026-10-02).
- [x] Draft the email to InvestorGain asking for written permission to display its GMP with attribution, and confirm its ownership (D1 follow-up). The build does not wait on the reply.
- [x] Capture sanitised fixtures: 2 mainboard, 2 SME, 1 listed, past issues, active category, bhavcopy excerpt, and the InvestorGain GMP page.
- [ ] Verify from the **VPS IP**: the endpoints, whether the cookie warm-up is needed, and the browser UA. *(Blocked 2026-10-02: no SSH key in the agent session. The owner runs the one-liner, which is also a Phase 9 pre-merge item.)*
- [x] Settle the (verify) items: subscription scope, how long detail survives after listing, NSE listing BSE-SME issues, and the registrar allotment URLs (all reachable with 200 except Bigshare, which was unreachable from the dev network and is kept as an unverified link).

**Phase 1: Schema and core domain (M).** *Exit: migration applied locally; core tests green.*
- [x] `packages/market-data/src/ipos.ts` (boundary types, including the separate `GmpSource`).
- [x] `packages/core/src/ipos/` (status, timeline, money, match, resolve, units, gmp) with tests.
- [x] `packages/db/src/schema/ipos.ts`, the hand-written migration, journal entry, repository and DB tests. *(Run against the Docker PG17 + TimescaleDB test database on 2026-10-02: green after fixing the tests' reading of trigger errors, which drizzle wraps as the error's `cause`, and their cleanup query.)*

**Phase 2: Source framework and the NSE adapter (M).** *Exit: parsers green on fixtures.*
- [x] `sources/ipo/http.ts` (robots, rate, retry, circuit, cookies, budget) with tests.
- [x] `config/ipo-sources.yaml` and `ipo-registrars.yaml` with Zod loaders that fail at boot.
- [x] `sources/ipo/nse.ts` transport and pure parsers with fixture tests.

**Phase 3: Worker jobs (M).** *Exit: `--once` of each job fills the local DB from live NSE.*
- [x] `jobs/ingest-ipos.ts`: calendar, details, subscriptions (gated), listings, backfill. *(2026-10-02: every IPO job ran once against live NSE, InvestorGain and SEBI into the local Docker database. That run found and fixed two bugs: the listing job now takes the newest missing listing dates first, since oldest-first let one never-resolvable old date starve today's listings; and a known observation newly attached to an issue now counts as a change, so the issue is re-resolved.)*
- [x] Register them in `index.ts` with `SCHEDULES` comments, health feed ids and job tests.

**Phase 4: Server and API (S–M).** *Exit: routes return real data locally.*
- [x] `server/ipos.ts`, `server/ipo-schemas.ts`, `lib/ipo-types.ts` and `API_ROUTES` entries.
- [x] The routes (the GMP track record arrives in Phase 8), with server tests.

**Phase 5: List page (L).** *Exit: QA'd at phone and desktop widths in both themes.*
- [x] `/ipos` page, loading and error; the summary strip, open-now cards, agenda, tabs, table/cards, filters and search.
- [x] Empty, stale and failed states; stories; the **Market record** nav entry for all users (D4). *(QA'd in Storybook at 375 and 1280–1440 px in both themes; the real-app pass is in Phase 9.)*

**Phase 6: Detail page (L).** *Exit: QA'd; copy review (§11) passed.*
- [x] `/ipos/[slug]` page, loading, error and not-found, with all §10.2 sections.
- [x] The sources panel, field-source tooltips and derived/expected markers. The GMP panel shows its explainer state until Phase 8 fills it.

**Phase 7: Listing performance (S).** *Exit: correct gains on recent listings.*
- [x] Bhavcopy listing-day rows, ISIN capture, rolling latest close, and backfill for 24 months.

**Phase 8: GMP (M).** *Exit: GMP shown with its label on cards, table and detail; track record correct on hand-checked listings.*
- [x] `sources/ipo/investorgain.ts` (`GmpSource`) with fixture tests. The JSON data host was evaluated and **not adopted**: it is an undocumented internal API, less clearly permitted than the public page robots.txt allows, and a second fragile format. When the page breaks, the feed fails loudly and `/ipos` shows the last GMP as stale.
- [x] `ingest-ipo-gmp` job (strict matching, unmatched rows logged) and the `ipo-investorgain-gmp` feed health.
- [x] `gmp-panel`, `gmp-chip`, `gmp-track-record` and `gmp-explainer` with stories; the GMP column in the table; `GET /api/ipos/gmp-track-record`.
- [x] Check the source-off path: setting `investorgain.enabled: false` turns every GMP surface into the explainer with no deploy.

**Phase 9: Admin health and ship (S).** *Exit: live for every signed-in user; feed health clean for the first week.*
- [x] Admin health panel at `/admin/ipos` (read-only): feeds, unmatched NSE and GMP rows, conflicts, and RHP extraction counts.
- [x] Runbook notes in `docs/operations/ipo-pipeline.md`. Update `CLAUDE.md`'s scope, `docs/planning/README.md`, `pending-features.md` and the `/data-sources` page (now naming InvestorGain as the GMP source, SEBI filings and RHP extracts).
- [ ] **Before merge**, since there is no admin beta (D4): run every job with `--once` locally against the Docker DB with live sources, QA both pages at both widths and in both themes, and check the endpoints from the VPS IP with curl.
  - [x] 2026-10-02: the full suite is green against a fresh Docker test database (1,236 tests pass; the only 3 failures are announcement tests that read the local `.env`'s `AUTH_BASE_URL` and pass with it set to localhost). Every IPO job also ran once against live sources: 450 issues, 213 listing-day rows and live RHP extracts. The backfill ran for 30 minutes and was still in progress when stopped; it is slow by design.
  - [ ] QA `/ipos` and `/ipos/[slug]` in the running app at phone and desktop widths, in both themes.
  - [ ] Check the endpoints with curl from the VPS's IP.
- [ ] Merge, which deploys and runs the migration through `deploy.sh`. Then run `--once backfill-ipos` and watch the feed health for a week.

Phases 10 and 11 are part of the same build; there are no versions.

**Phase 10: BSE source (M–L).** Identify the BSE IPO API, build the adapter on the
`fix/bse-announcements` transport, turn on cross-source matching and conflict reporting,
and add the BSE bhavcopy for BSE-only listings.
- [x] Built and verified live (2026-10-02): `sources/ipo/bse.ts` on a lenient `node:https`
  transport (BSE sends header lines `fetch` rejects), calendar, detail, category demand
  with the SME fallback, new listings and the BSE bhavcopy. Cross-source resolution ranks the
  designated exchange first and marks conflicts.
- [ ] Turn it on: `sources.bse.enabled: true` once the owner extends D2 (browser
  User-Agent) to BSE, whose CDN refuses the honest one.

**Phase 11: RHP extraction (L).** Download the RHP once per issue (with a size cap and
hash), extract text, and pull headed sections: Objects, Promoters, the restated financial
summary, Our Strengths and the Risk Factors headings. Each extract is stored with page
numbers in `ipo_financials` and `ipo_disclosure_extracts`, labelled "auto-extracted, page N"
and linked to the source page. A YAML override file covers corrections, reviewed by PR.
The SEBI DRHP pipeline ("filed, not yet scheduled") is added here too.
- [x] `extract-ipo-rhp` (08:20, 18:20 Mon–Sat; two documents a run): download through the
  owning exchange's client (cap 60 MB, SHA-256 kept), a checked zip reader, pdf.js text via
  `unpdf`, then the pure, conservative extractor `packages/core/src/ipos/rhp.ts`. On the real
  551-page VNL RHP it reads the overview, objects with amounts, nine promoters, five restated
  rows over three years and the first ten risk headings in ~3 s; it **skips** strengths there,
  because un-numbered headings cannot be told from prose. One table, `ipo_rhp_extracts`
  (migration 0027), replaces the two the plan named: every extract is a quotation, so figures
  stay the document's own strings (never money EquityWise computes with) and one shape
  serves all six sections. Pages are cited as **PDF** pages, which is what a viewer shows.
- [x] `config/ipo-rhp-overrides.yaml` **hides** a wrong section for one issue, read on each
  request. It does not replace text: a hand-typed quote could not honestly carry the
  "auto-extracted from PDF page N" label. A systematic error is fixed in the extractor,
  and bumping `RHP_EXTRACTOR_VERSION` re-reads every RHP.
- [x] SEBI filings: `ingest-sebi-filings` reads the regulator's public-issue filings list
  (honest User-Agent; robots.txt allows it). Filings live in `ipo_sebi_filings` (migration
  0028) and never create or change an issue. One is linked for display only when exactly
  one issue has the same normalised name and opens within ~18 months after it. `/ipos`
  shows the latest ten; an issue page lists its own DRHP and addenda.

**Later, not planned yet:** if SEBI's regulated "when-listed" platform launches, add its
prices as an official pre-listing source alongside GMP, or in place of it. Also per-user "follow an IPO" with an `owner_id`, and alerts for
opens, closes, allotment and listing. The schema already supports this, since alerts can be derived from dates and snapshot changes.
