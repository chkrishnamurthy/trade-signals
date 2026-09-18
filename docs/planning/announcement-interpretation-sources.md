---
name: Announcement interpretation
status: done
horizon: none
created: 2026-09-13
updated: 2026-09-14
board: EW-079
area: [worker, web]
confidence: 3
summary: "Announcement interpretation: free sources, reuse rights, and the metadata-only first release (shipped 2026-09-14). Attachment interpretation deferred."
owner: krishna
---

# Announcement interpretation: free sources, FYERS and delivery limits

Assessed and implementation verified: **14 September 2026**. Status: the first
metadata-based interpretation release is implemented. See “Implemented scope and
remaining limits” below; this is not full attachment interpretation.

This assesses the supplied “Announcement Interpretation” specification against
the current repository and official source documentation. It is specific to
EquityWise's public, multi-user product. No dedicated announcement plan existed
in `docs/`; the broader stock-research plan only mentioned announcements.

## Decision

**Much of the requested factual content is publicly readable without a data
subscription. A complete, reliable, automatically interpreted NSE/BSE feed with
public redistribution rights has not been verified as available for free.**

Use NSE as the preferred source for the NSE universe, BSE as a complementary
filing source, company investor-relations pages for supporting documents, and
rating-agency publications for rating rationale. Prefer structured exchange
filings/XBRL over PDF extraction when the required filing is available in that
format. Use FYERS only for separate technical market context.

There are three separate questions:

1. **Can a person read the information for free?** Often yes.
2. **Can software reliably collect and interpret it?** Sometimes; integration,
   extraction, validation and recovery work are still required.
3. **May EquityWise retain, transform and display it to its users?** This depends
   on the source's terms and applicable agreement. Public availability and
   attribution alone do not establish those rights.

NSE's policy explicitly covers corporate data and makes redistribution subject
to agreement. Its non-commercial category is not simply “an app that charges
users nothing”. Treat permission for EquityWise's intended use as unresolved,
not as an assumed free entitlement. [NSE data policy](https://www.nseindia.com/static/market-data/nse-data-policy)

## Best sources and their roles

The ranking below is an engineering recommendation based on source authority and
fit to our NSE universe, not a claim that any source grants unrestricted reuse.

| Priority / source | Best use | Free access and practical limits |
| --- | --- | --- |
| 1. NSE corporate filings | Official announcement, source timestamp, original attachment and verification | Public filing search/download interface. Website availability does not establish a supported free bulk API, completeness guarantee or redistribution licence. [Announcements](https://www.nseindia.com/companies-listing/corporate-filings-announcements) |
| 1. NSE official RSS | Discover newly published announcements and other corporate filings | NSE explicitly offers RSS for announcements, results, board meetings and corporate actions. Best first discovery candidate; validate the actual feed, retained window and recovery behaviour. An RSS listing is not full document extraction or a guaranteed historical archive. [RSS directory](https://www.nseindia.com/static/rss-feed) |
| 2. BSE corporate filings | Supplement/cross-check dual-listed companies; retain BSE's own original filing | Public announcement page; the existing adapter targets its website JSON service. Access reliability and automated/public reuse permission remain unverified. The page could not be retrieved through the research browser in this assessment. [BSE announcements](https://www.bseindia.com/corporates/ann.html) |
| 3. NSE financial results and XBRL | Reporting period, accounting basis, financial numbers and more reliable structured extraction | Public results interface and documented filing taxonomies; availability of a taxonomy is not proof every historic filing is downloadable in that format. [Results](https://www.nseindia.com/companies-listing/corporate-filings-financial-results), [XBRL information](https://www.nseindia.com/static/companies-listing/xbrl-information) |
| 3. Exchange corporate-action records | Authoritative ex-date, record date, action purpose and entitlement information when published | Separate from a board's announcement of a proposed dividend/action. Reconcile conflicting or revised dates; never infer ex-date from record date. [NSE corporate actions](https://www.nseindia.com/companies-listing/corporate-filings-actions) |
| 4. Company investor-relations website | Annual/quarterly reports, presentations, company explanations, supporting copies | Useful primary-source supplement, with inconsistent layouts and coverage across issuers. Preserve its distinct provenance; an IR publication time is not the exchange filing time. Example: [RIL financial reporting](https://www.ril.com/investors/financial-reporting?page=1) |
| 5. Rating agency's own publication | Rating, outlook, instrument and agency-stated rationale | Consult the agency's original publication when available; do not treat its entire database as freely reusable. Example: [ICRA rating rationales](https://www.icra.in/Rating/AllRatingRationales) |

Third-party finance sites, social posts and search snippets should not be the
factual source of record. They can help locate an original filing but do not
replace it. We have not verified a free third-party API with complete NSE/BSE
coverage and the required public-display rights.

## What the requested feature can obtain or build without buying a data feed

“Possible” below means technically possible with appropriately permitted source
access. It does not mean already implemented, always disclosed, or zero operating
cost. Every extracted amount/date/party/status must retain a source location.

| Requested information or feature | Feasibility | Clarification |
| --- | --- | --- |
| Company, title, original category, source, filing timestamp, attachment | Usually available as exchange metadata | Missing identifiers, attachments or invalid dates need explicit handling; original title/category must survive normalization. |
| Financial results: period, standalone/consolidated, audit status, revenue, profit, EPS, exceptional items | Possible from the actual result filing | Prefer structured data; PDF tables need unit, sign, period and footnote validation. “Operating profit” definitions can differ, especially across sectors. |
| YoY, QoQ and margin changes | Can be calculated by EquityWise if comparable inputs exist | Match period length, accounting basis, definitions and restatements. Label calculated versus company-reported values. Zero/negative bases need explicit treatment; otherwise show “Comparable period unavailable”. |
| Order value, customer, geography, scope, execution period, taxes, related-party status | Possible only where disclosed | A headline often contains only some of these. Missing customer or margin is unknown. Order value is neither recognized revenue nor profit. |
| Dividend, bonus, split, buyback and rights issue | Usually possible from action/offer documents and exchange records | Proposed amount/ratio, approvals, record date, ex-date and payment/completion date are separate facts. Never substitute one for another. |
| Acquisition, divestment, merger and capex | Conditional on filing detail | Extract stake, consideration, structure, approvals, purpose and timing. Target financials, funding and synergies may be absent. Board approval does not establish completion. |
| Fundraising and dilution | Proposed amount/instrument/use may be available | Dilution needs valid share-count, issue-price and instrument/conversion terms. A fundraising ceiling alone is insufficient. |
| Credit rating | Possible from filing and agency publication | Instrument-specific previous/new rating, outlook and action; do not assume a missing prior rating. |
| Management and board/shareholder meetings | Usually possible from notices and outcome filings | Meeting scheduled, resolution approved, appointment effective and shareholder approval pending are distinct. |
| Legal/regulatory matters and related-party transactions | Conditional on source detail | Preserve authority, procedural stage, response, approval and pending outcome. A notice/allegation is not a final finding. |
| Shareholding and investor presentations | Possible from published filings | Quarterly holdings are snapshots, not live institutional activity. Presentations are company statements, not independent forecasts. |
| Clarifications, corrections, cancellations and follow-up timelines | Partially automatable | Prefer explicit prior filing references; preserve every version. Similar titles alone cannot establish identity. Missing follow-up means status unknown, not completed. |
| Cross-exchange deduplication | Buildable locally, with uncertainty | Map security/company carefully and compare document checksum or strong event identifiers. Same bytes can establish document identity; different bytes do not prove different events. Preserve both sources. |
| Facts / why it may matter / unknowns | Buildable with deterministic templates | Requires document facts, not just title keywords. “May affect debt” is business context, not a prediction. Unknowns must say whether information was absent in a reviewed source or extraction was incomplete. |
| Relevance areas and explainable reading priority | Buildable locally | Store factors and rule version. Priority is not investment confidence or expected price direction. |
| Watchlist summary, names, read/unread, saved/dismissed, filters | Buildable from our database | No external provider needed. Enforce owner ID, including empty-watchlist behaviour and all personal state. |
| Checksums, provenance, interpretation versions and issue reporting | Buildable locally | Record source ID/URLs, publication/ingestion times, document identity and evidence locations; document retention must match permission. |
| Responsive cards, details, accessibility and quality states | Buildable locally | These are engineering work, independent of whether a feed costs money. |
| AI-assisted summaries | Optional; not required for first release | No announcement AI pipeline was found in the inspected path. A local model can avoid per-request vendor charges but still consumes compute and validation effort. Free hosted quotas are not a production guarantee. |

All requested categories are supportable as a taxonomy. That does **not** mean
all fields will be populated for every filing. Unsupported or ambiguous material
must remain OTHER / STATUS_UNKNOWN, with the original filing accessible.

## What FYERS can provide

FYERS states that historical data, quotes and real-time market data are available
to its clients at zero API data-feed fees, with an account/app and appropriate
permissions. This is not anonymous access. [FYERS data-feed fees](https://support.fyers.in/portal/en/kb/articles/do-i-need-to-pay-for-datafeeds)

| FYERS capability | Useful announcement context | Current EquityWise position |
| --- | --- | --- |
| Quotes | Price snapshot and session change, independently timestamped | `fetchQuotes` exists behind `MarketDataProvider`. |
| Historical OHLCV candles | Closed-session return, chart and volume comparison | `fetchBars` exists. Compute our comparisons from sufficient, comparable closed bars. |
| Real-time data | Optional live price context | Adapter streaming capability depends on configured transport; do not assume every deployment has it. |
| Symbol master | Instrument lookup/mapping support | `listInstruments` exists. It does not by itself guarantee correct mapping of a BSE filing code to an NSE security. |
| Exchange/segment market status | Explain whether market context is live or closed | `fetchMarketStatus` exists. |

These capabilities are documented in the [FYERS Data API support reference](https://support.fyers.in/portal/en/kb/fyers-api-integrations/fyers-api/api-v3/data-api).
Volume anomalies and indicators are EquityWise calculations, not FYERS
announcement interpretations. Show market observations separately and do not
claim the announcement caused a move.

**No documented announcement/disclosure API was found in the reviewed FYERS
references.** Do not plan to obtain filing PDFs, company results tables, order
details from company disclosures, approval status, correction chains, source
excerpts or interpreted summaries through FYERS. A feature visible in a broker
app is not proof that its public API exposes it. An undocumented/partner product
could exist; that remains a question for FYERS, not a supported dependency.

**Public display needs separate confirmation.** FYERS API terms §12 require
written consent for specified copying/caching for redistribution and distribution
or public display of API content. A free client API does not establish permission
to serve one account's feed to all EquityWise users. [FYERS API terms](https://fyers.in/terms-and-conditions-api)

Questions to send to FYERS when arranging access (not sent during this task):

1. May this public research app display one account's quotes, OHLCV and derived
   indicators to signed-in users, including users without a FYERS account?
2. What written permission, exchange licences, fees, retention limits and derived
   data conditions apply? Does delayed/EOD display change those requirements?
3. What account-wide limits, history coverage, corporate-action adjustment rules
   and streaming entitlements apply to our existing data-only app?
4. Is there an officially supported announcement/corporate-action/fundamentals
   API or licensed partner feed? Request documentation, coverage and reuse terms.

No new FYERS login or production session change is needed for this assessment.
Order execution and account portfolio endpoints remain outside product scope.

## What cannot be promised from free resources

| Limitation | Exact meaning / alternative |
| --- | --- |
| Guaranteed complete NSE+BSE collection with low latency and an SLA | No free offering meeting this requirement was verified. Public RSS/web pages may aid collection, but do not establish completeness, delivery guarantees or recovery support. Evaluate a licensed feed for a contractual service level. |
| Unrestricted automated collection, storage and public redistribution | Not established by public access, attribution, or a successful JSON response. Obtain source-specific terms/permission; a paid plan also needs the correct display licence. |
| Complete, normalized, long-term history with every correction | Public archives can help, but all-history coverage, point-in-time versions and bulk access are not verified. Prospectively preserve permitted records; scope historical promises to validated coverage. |
| Ready-made structured interpretation of every filing | Free source documents are not an extraction service. We must build and maintain parsers/templates and review difficult documents. |
| Perfect extraction from every scanned PDF, table, language or attachment type | OCR and models can fail. Expose unsupported/pending/failed states and original links. Paying does not guarantee perfect extraction either. |
| Automatically complete event chains | Some references are ambiguous or unpublished. Conservative linking and occasional review remain necessary even with paid data. |
| Unlimited free AI with stable quality and capacity | No such service has been verified. Deterministic templates are the appropriate baseline. Hosting, storage and engineering still cost money. |
| Undisclosed customer, contract margin, funding source or financial impact | Cannot be recovered reliably from the announcement, even by paying or using AI. Record “not disclosed” after source review. |
| Certain future profit, stock-price direction or announcement causation | Not facts established by these sources. These outputs also violate the supplied product specification. |
| Confirmed completion merely because a planned date passed | Impossible to establish without a subsequent authoritative statement. Preserve the last evidenced status and mark the missing update. |

Licensed alternatives exist: NSE lists paid corporate data and an EOD
announcement product delivered after 20:00 IST. BSE publishes tariffs for
announcement feeds and a separate corporate-data public website/mobile
redistribution offering. Ask for a current quote and explicit rights for
extraction, summaries, document retention and public display; delivery fees and
redistribution permission are different things. [NSE corporate data products](https://www.nseindia.com/static/market-data/corporate-data-subscription),
[BSE published tariff](https://www.bseindia.com/downloads1/Information_Products_Pricing_Sheet.pdf)

The BSE tariff was available in search-indexed official text, but direct PDF
retrieval failed during this assessment. Its current applicability requires
confirmation; no price estimate is used as an approved budget here.

## Pre-enhancement baseline: verified from repository, not production

Data flow at the initial assessment:

```text
BSE website JSON service (AnnGetData)
  -> worker source: Zod parsing -> provider-neutral RawAnnouncement
  -> ingestAnnouncements: trailing 3-day fetch + instrument resolution
  -> upsertAnnouncements -> corporate_announcements
  -> getAnnouncementsPage: database read + owner-scoped watchlist membership
  -> /announcements server page OR GET /api/announcements
  -> AnnouncementsView cards, filters, pagination and filing links
```

Files inspected:

- [Source adapter](../../apps/worker/src/sources/india-disclosures.ts),
  [source tests](../../apps/worker/src/sources/india-disclosures.test.ts),
  [worker job](../../apps/worker/src/jobs/ingest-disclosures.ts),
  [scheduler configuration](../../apps/worker/src/index.ts).
- [Disclosure contract](../../packages/market-data/src/disclosures.ts),
  [schema](../../packages/db/src/schema/disclosures.ts),
  [repository](../../packages/db/src/repositories/disclosures.ts).
- [Server service](../../apps/web/src/server/disclosures.ts),
  [API](../../apps/web/src/app/api/announcements/route.ts),
  [page](../../apps/web/src/app/announcements/page.tsx),
  [cards](../../apps/web/src/components/disclosures/announcements-view.tsx),
  [classification](../../apps/web/src/lib/announcement-meta.ts),
  [classification tests](../../apps/web/src/lib/announcement-meta.test.ts).
- [FYERS adapter](../../packages/providers-fyers/src/adapter.ts).

Already stored: source/external ID, nullable instrument mapping, symbol/company,
category, headline, detail, attachment URL, announcedAt and ingestedAt. Search,
category/company/date filters, keyword-based key-filings filtering, pagination,
watchlist membership and source links already exist. These should be reused.

Important gaps in the supplied “already implemented” premise:

1. **Announcement ingestion is BSE-only in this source.** NSE calls in the same
   file are for other disclosures. Do not claim verified dual-exchange coverage.
2. **Transport is explicitly unverified in the existing source comment.** Its
   statement that official feeds are automatically legal to store/re-present
   with attribution is unsupported. The schema repeats that assumption. This
   document supersedes that assumption for planning; runtime code was not changed.
3. **Fetch errors become `[]`.** Current ingestion counts cannot distinguish a
   failed source from a successful empty fetch. No explicit pagination loop is
   present in the announcement fetcher; completeness must be verified.
4. **Polling is four weekday sweeps**, configured at 10:20, 13:20, 16:20 and
   19:20 IST, with a trailing three-day window. This is not real-time coverage;
   weekend publication and extended outages require recovery design.
5. **The BSE scrip code is passed as `symbol`.** An explicit authoritative
   cross-exchange mapping is needed before assuming NSE watchlist matches.
6. **Invalid timestamps can fall back to the current time.** That can make an
   old/unparseable filing appear new; quarantine or explicitly mark invalid data.
7. **Same-source/ID conflicts update the existing row.** This does not preserve
   correction history. Preserve source revisions before implementing timelines.
8. **Freshness uses the newest returned filing date**, including filters/page,
   rather than a successful source-ingestion heartbeat. It cannot establish feed
   health or completeness.
9. **“New” is a device-local last-seen timestamp**, not owner-scoped per-item
   read state. The shared localStorage key can span accounts on one browser.
10. **Watchlist-only falls back to all companies when no watched IDs exist.**
    The proposed “No watchlist announcements” experience needs explicit semantics.
11. **Interpretation is not implemented.** No document extraction, fact citations,
    full requested taxonomy/status model, interpretation versions or related-event
    timeline is present in the inspected announcement path. Stored `detail` comes
    from provider text; it is not a validated interpretation.
12. **Keyword classification uses bullish badge tones and “high impact” flags.**
    Replace these with neutral category styling and evidenced reading-priority
    factors as part of the future enhancement. A substring such as “order” can
    also describe a legal order, not an order win.

## Delivery sequence from the initial assessment

1. **Establish source access and measure coverage.** Validate official NSE RSS
   as discovery, confirm permitted attachment/structured-filing access, and
   clarify BSE collection rights. Record source-specific success/failure,
   pagination, last successful ingestion, newest source filing and coverage
   window separately. Never bypass access controls. Use permitted fixtures for
   development while source agreements remain unresolved.
2. **Preserve evidence.** Reuse the existing announcement table/read path, with
   minimal append-only revision, document/evidence, interpretation and relation
   additions designed during implementation. Keep source timestamps/URLs distinct
   from our processing times. Preserve original category/title and unmapped items.
3. **Build deterministic interpretation first.** Start with results, dividends,
   management changes and meeting notices where explicit structured evidence is
   available. Add orders, rating, transactions, fundraising and legal filings
   category by category. Every category keeps unknown and unsupported fallbacks.
4. **Add personalization and timelines.** Persist read/saved/dismissed state by
   owner and announcement; expose relevant watchlist names without N+1 queries.
   Add conservative correction links and factors explaining attention labels.
5. **Add optional FYERS context only under confirmed display rights.** Reuse
   persisted quotes/bars and the provider-neutral adapter; do not add broker calls
   to React or interpret prices as evidence of announcement impact.
6. **Consider AI after deterministic quality is demonstrated.** Worker-only,
   versioned, Zod-validated, source-cited output; retain rejected/failed status and
   original access. Reprocessing must not silently replace earlier interpretations.

Acceptance must be scoped to evidenced coverage, not “every filing always has
every fact”. Test proposed versus completed events, legal notices versus final
orders, order value versus revenue, missing facts, incompatible financial periods,
corrections, ambiguous matching, owner isolation and ingestion failure states.
Then verify responsive/accessibility behaviour and run the implementation's
required typecheck, lint and tests without starting the full worker or mutating
production.

## Implemented scope and remaining limits

The initial implementation is already in `main` (commit `cc20038`, included in
subsequent merges). Follow-up validation fixes are on
`codex/announcement-interpretation-followup`. Existing ingestion, source metadata,
filters, pagination and original-filing links are preserved.

| Area | Implemented behaviour |
| --- | --- |
| Interpretation | Worker-generated, deterministic `metadata-rules-v1`; uses only persisted title, category and description. No AI provider or new dependency. |
| Category and status | Full requested category/status vocabulary; conservative keyword categories and explicit labelled status only. Unknown, conflicting or qualified completion remains unknown. |
| Facts and dates | Explicit label/value lines retain source field, character span and exact excerpt. Original units and conditional wording are preserved. No guessed numeric values or financial comparisons. |
| Explanation | Separate official facts, business relevance and unknowns. Every interpretation identifies that the attachment was not analysed. |
| Provenance | Original metadata and source ID, filing/ingestion times, method and SHA-256 metadata/method checksum. This is explicitly **not** a document checksum. |
| Versioning | Append-only source snapshots and interpretation versions, enforced by a database trigger. Retries do not duplicate versions; revisions and reversions remain inspectable. Existing rows are preserved before upgrade. |
| Personalization | Owner-scoped watchlist names, read/unread, save, dismiss/restore and a personal issue flag. Reading state records the interpretation checksum so a changed filing becomes unread again. |
| Filters | Existing search/date/company/category filters plus interpreted category, event status, source, reading state and presence of extracted labelled facts. Empty watchlist scope remains empty. |
| Feed health | Separate persisted successful/failed attempts and last success, independent of filtered rows. Successful empty fetches and failed fetches are distinct. Coverage remains explicitly partial/unverified. |
| UI | Neutral category styling, explained keyword-based reading priority, IST date groups, first three facts on cards, responsive Radix detail/filter drawers, keyboard focus handling and original links. |
| Failure handling | Invalid announcement timestamps are rejected rather than replaced with the current time. HTTP, malformed and rejected-row failures propagate to ingestion history; unrelated jobs remain isolated. |

The web application reads worker-produced interpretations; it writes only personal
announcement state. State mutation validates the request, verifies the session,
checks origin, and never accepts an owner ID from the client. Original attachment
links are restricted to supported HTTPS exchange hosts. Interpretation is withheld
when a valid original attachment link is absent. A valid URL is not proof that the
remote document remains reachable.

The first release intentionally retains these limits:

- **No PDF/XBRL download, OCR or attachment extraction.** A missing extracted fact
  means “not established from the available metadata”, not “the company omitted it”.
- **No financial normalization, YoY/QoQ calculations or dilution estimates.**
  Labelled monetary strings are source excerpts, not computational money values.
- **No new NSE/RSS feed, expanded website scraping or FYERS context.** Source
  permissions, validated transport and public-display rights remain unresolved.
- **No verified complete coverage or real-time delivery.** The existing BSE source
  and weekday sweep schedule remain; pagination and outage recovery still need
  source-specific validation.
- **No inferred BSE-to-NSE company mapping.** Unmapped filings stay visible but
  cannot receive reliable watchlist membership until authoritative mapping exists.
- **No automatic links between separate filings or NSE/BSE duplicates.** The
  drawer shows stored versions of the same source filing ID. Similar titles are
  not treated as an event identity.
- **No automatic general-language lifecycle inference.** The v1 status reader
  requires an explicit labelled status; a title alone never establishes completion.
- **The issue flag is personal state**, not a promise of an editorial review queue
  or an external message being sent.

Existing metadata is processed in bounded batches of 100 by the worker during
announcement ingestion runs, including before an attempted external fetch.
After migrations, older items can remain pending until those batches run. A rule
change must bump the method version; reprocessing preserves earlier versions.

### Schema and verification

- `0017_announcement_interpretation.sql`: current interpretation/checksum columns,
  immutable-version storage, ingestion-attempt history and per-owner state.
- `0018_announcement_version_guards.sql`: preserve pre-upgrade snapshots and reject
  UPDATE/DELETE on evidence versions.
- `pnpm typecheck`: passed.
- `pnpm test:integration`: **657 passed, 4 skipped**. The actual migrations ran
  against disposable local PostgreSQL 17 + TimescaleDB. All six announcement
  database tests executed and passed; the remaining skips are the separate auth
  integration suite. The test container is removed by the existing test script.
- Browser fixture checks: 375px and 1440px, light and dark, drawer content,
  Escape/focus restoration, saving, marking read and unread filtering passed.
  Reduced-motion checks also passed, with no drawer animation or horizontal overflow.
  The fixture uses the real components and stylesheet, isolated API responses
  and a mocked app shell; it does not prove live production source availability.
- Full-repository lint reports **26 pre-existing errors outside the changed files**.
  Changed-file lint passes; unrelated code was not reformatted.

The follow-up also aligns the announcement integration suite with the shared
`TEST_DATABASE_URL` resolver used by Vitest global setup, so the existing integration
command actually exercises these database invariants. Filter selects now have
explicitly associated accessible labels. The shared sheet and overlay now disable
state-based animations when the user requests reduced motion.

No production migration, deployment, authenticated FYERS request or live exchange
payload validation was performed by this task. No source provider was contacted.
The earlier source research establishes available products, not permission for
EquityWise's particular reuse or proof of the adapter's live coverage.

### Reported production failure: 14 September 2026

The user reported “Latest ingestion failed” for the 13:20 IST attempt, with
“Last successful ingestion: Not recorded”. This is an actual failed worker run,
not a healthy-feed status. “Not recorded” means no successful run is present in
the new ingestion history; it does not establish that no filings were ever
collected before that history existed.

The health banner does not persist the underlying exception. A failure can occur
during stored-metadata interpretation, the BSE request, response validation,
instrument resolution or database writes. The scheduler logs the actual error
under `job: ingest-announcements`, `run failed`, with `errorName` and
`errorMessage`. Do not assume a BSE HTTP block without that evidence.

The accompanying NSE-not-connected, unverified-coverage and attachments-not-analysed
notices describe remaining implementation limits; they are not additional runtime
errors. FYERS credentials are unrelated to this ingestion path.

A read-only production SSH diagnostic was attempted from this workspace and
failed with `Permission denied (publickey)`. No production logs were retrieved
and the root cause remains unconfirmed. Obtain the relevant worker error log
through existing server access; do not send private keys, tokens or `.env` files.
Live ingestion verification remains outstanding despite passing fixture and local
database tests. The release must not be described as a verified working live feed.
