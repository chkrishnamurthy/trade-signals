---
name: Market Calendar
status: done
horizon: now
created: 2026-10-02
updated: 2026-10-02
area: [web, worker, db]
confidence: 3
summary: Authenticated NSE market-event calendar with IST date ranges, watchlist relevance, provenance, and an idempotent YAML-backed event sync.
owner: krishna
---

# Market Calendar (`/calendar`) — implementation plan

**Status:** implemented and verified · **Date:** 2026-10-02

> A signed-in user's chronological view of NSE market holidays, result dates,
> corporate actions, IPO events, board meetings, and corporate announcements.
> The page is factual decision support: it explains what an event is, why it may
> be relevant, and what factual follow-ups to observe. It does not provide
> investment advice, execution, broker actions, or transaction-shaped controls.

Implementation verification: all TypeScript projects pass, the full unit suite passes,
the production web and worker builds pass, and all files changed for this feature pass
Biome. The PostgreSQL integration cases are included and run when the guarded local
`TEST_DATABASE_URL` is configured.

---

## 1. Decisions confirmed before implementation

The following product and technical decisions are final for v1.

| Question | Decision |
| --- | --- |
| API access | `/calendar` and `GET /api/market-calendar` are authenticated in v1, matching the current closed-by-default application and acceptance criteria. |
| Stable identity | Add nullable `source_key` to `market_events`. Every YAML event must have a globally unique `key`, persisted as `source_key`, so edits upsert the same row. |
| Timed-event input | YAML uses `HH:mm` in IST. The importer combines it with `event_date`, converts it to a UTC instant, and stores it in a `TIMESTAMPTZ` `event_time` column. |
| Date semantics | Weeks run Monday–Sunday in IST. “Upcoming corporate actions” covers today through the next 30 calendar days, inclusive. |
| Holiday source | Market holidays derive from the existing `config/nse-calendar.yaml`; they are not duplicated in `config/market-calendar.yaml`. |

Additional v1 defaults:

- The page opens on **This Week**.
- `from` and `to` are inclusive IST calendar-date keys (`YYYY-MM-DD`).
- “Upcoming corporate actions” includes dividend, bonus, stock split, rights issue,
  and buyback events.
- “Watchlist-related events” counts events from today through the next 30 days.
- Summary cards are stable overview counts and do not change with the list's event-type
  or watchlist filters.
- The Event Type filter selects one type at a time, plus “All event types”, matching
  the singular API parameter `eventType`.
- The importer never deletes a database row merely because an item was removed from
  YAML. Corrections reuse the same key and update the row. A future cancellation model
  can be represented explicitly rather than inferred from absence.

---

## 2. Goals and non-goals

### 2.1 Goals

1. Add an authenticated `/calendar` page using the existing application shell and
   semantic design tokens.
2. Present events in a responsive date-grouped timeline/list.
3. Let users switch between Today, This Week, and This Month; filter to their
   watchlists; and select an event type.
4. Explain each event in plain, factual language with visible provenance.
5. Highlight events related to any instrument in the signed-in user's watchlists
   without exposing another user's membership.
6. Seed and refresh events idempotently from versioned local configuration.
7. Keep all calendar-day arithmetic in IST and every stored instant in UTC.

### 2.2 Non-goals

- No broker integration, execution flow, portfolio view, or transaction affordance.
- No recommendation, predicted price effect, confidence score, or sentiment score.
- No live scraping or market-data-provider call from a page request.
- No admin CRUD surface; versioned YAML remains the operator interface.
- No automatic conversion of every stored corporate announcement into a calendar
  event in v1. Only explicitly configured future events and derived NSE holidays are
  included.
- No organisation/team tenancy, full RBAC system, billing, queue, or new service.
- No general monthly grid. The primary view is a timeline/list because it preserves
  readable titles, provenance, and mobile behavior.

---

## 3. Event taxonomy and shared contract

The canonical event-type ids are snake case in storage and over the API. Display labels
are presentation-only.

| Stored id | Display label | Corporate action? |
| --- | --- | --- |
| `market_holiday` | Market holiday | No |
| `result` | Result announcement | No |
| `board_meeting` | Board meeting | No |
| `dividend` | Dividend | Yes |
| `bonus` | Bonus | Yes |
| `stock_split` | Stock split | Yes |
| `rights_issue` | Rights issue | Yes |
| `buyback` | Buyback | Yes |
| `ipo` | IPO event | No |
| `corporate_announcement` | Corporate announcement | No |

Add a shared module, expected at `packages/shared/src/market-calendar.ts`, containing:

- `MARKET_EVENT_TYPES` and the `MarketEventType` union;
- `MARKET_EVENT_IMPORTANCE = ['low', 'medium', 'high']` and its union;
- the YAML input schema;
- typed metadata and wire DTOs;
- pure labels and event-type groupings such as `CORPORATE_ACTION_TYPES`;
- no clock, filesystem, database, or framework dependency.

### 3.1 Typed metadata

The `metadata` JSONB column remains extensible, but v1 recognizes only these optional
fields:

```ts
interface MarketEventMetadata {
  readonly whyThisMatters?: string;
  readonly whatToWatch?: readonly string[];
}
```

Unknown metadata keys may be preserved by the importer but are never blindly rendered.

When explanatory metadata is absent, the server supplies deterministic, factual
fallback copy by event type. It does not infer likely direction, magnitude, or outcome.

---

## 4. Database design

Add `packages/db/src/schema/market-events.ts` and export it through the schema index.

```text
market_events
  id                 bigint identity primary key
  source_key         text nullable
  instrument_id      integer nullable -> instruments.id
  symbol             text nullable
  event_type         text not null
  event_category     text nullable
  title              text not null
  description        text nullable
  event_date         date not null
  event_time         timestamptz nullable
  source_name        text nullable
  source_url         text nullable
  importance         text nullable
  metadata           jsonb not null default '{}'
  created_at         timestamptz not null default now()
  updated_at         timestamptz not null default now()
```

### 4.1 Constraints and indexes

- Unique index on `source_key`. PostgreSQL permits multiple null values, while every
  YAML-backed row has a non-null key for conflict-target inference.
- Check `event_type` against the ten supported ids.
- Check `importance` is null or `low | medium | high`.
- Index `(event_date, event_type)` for range/filter reads.
- Index `(instrument_id, event_date)` for watchlist-related reads.
- Optional index on `symbol` only if the resulting query plan shows it is needed;
  the expected v1 dataset is small, so do not add speculative indexes.

`event_date` is intentionally a PostgreSQL `date`, not a timestamp. It represents the
exchange-local calendar day supplied by the source. `event_time` is a real instant and
therefore uses `TIMESTAMPTZ`. `created_at` and `updated_at` are also UTC-backed
`TIMESTAMPTZ` values.

### 4.2 Upsert behavior

The v1 writer accepts only rows with a `sourceKey` because every local-config event and
derived holiday has a stable identity. It uses `ON CONFLICT (source_key) DO UPDATE` for
mutable descriptive/event fields and `updated_at`, while preserving `id` and
`created_at`.

Examples:

- configured event: `config:result:TCS:2026-Q2`
- derived holiday: `nse-holiday:2026-10-02`

Changing a title, description, URL, importance, or date while retaining the key updates
the existing event. Changing the key creates a different event and must therefore be a
deliberate review decision.

### 4.3 Repository boundary

Add `packages/db/src/repositories/market-events.ts` with:

- `upsertMarketEvents(db, rows)` — chunked, idempotent writes;
- `listMarketEvents(db, query)` — inclusive date bounds and optional type/scope filters;
- `marketEventSummary(db, input)` — the four fixed summary counts.

Every function receives `db: Database` first. No repository reads the current user from
ambient state. Watchlist scoping is expressed through explicit owner-resolved instrument
ids and symbols supplied by the server layer.

---

## 5. Configuration and worker sync

### 5.1 `config/market-calendar.yaml`

The file contains non-holiday events. The Zod schema rejects duplicate keys, unknown
event types, invalid dates, malformed `HH:mm` values, and unsafe source URLs.

```yaml
events:
  - key: "config:result:TCS:2026-Q2"
    symbol: "TCS"
    event_type: "result"
    event_category: "quarterly_results"
    title: "TCS quarterly results"
    event_date: "2026-10-10"
    event_time: null
    source_name: "NSE"
    source_url: null
    importance: "high"
    description: "Company is expected to announce quarterly results."
    why_this_matters: "The release updates reported revenue, margins, and other company disclosures."
    what_to_watch:
      - "Whether the announcement remains scheduled for this date"
      - "The company's filed financial statements and accompanying notes"
```

The config should include a small representative first-version dataset rather than
claiming comprehensive NSE coverage. The page must state provenance and handle an empty
or partial calendar honestly.

### 5.2 Holiday derivation

The sync reads `config/nse-calendar.yaml` and converts each explicit `holidays` entry
into a `market_holiday` event. It does not create weekend events. Special sessions are
not holidays and are outside the v1 taxonomy, so they remain operational calendar data
only.

Derived holiday rows use:

- `instrument_id = null`, `symbol = null`;
- `source_name = 'NSE'`;
- the holiday date and published name;
- `importance = 'high'`;
- deterministic key `nse-holiday:<date>`;
- a factual fallback description when the config has no extra detail.

### 5.3 Worker behavior

Add `apps/worker/src/jobs/market-calendar-sync.ts`.

The job:

1. loads and validates both config files;
2. normalizes symbols to uppercase;
3. resolves known NSE symbols to instrument ids in one query;
4. keeps `instrument_id = null` for unresolved symbols so the event is not lost;
5. converts each optional IST `HH:mm` value to a UTC `Date` with shared time helpers;
6. merges derived holidays and configured events;
7. rejects a key collision across the merged inputs;
8. upserts all rows and logs counts, unresolved symbols, and duration.

Run it once after the worker obtains a database connection, with failure logged without
preventing unrelated worker jobs from starting. Also schedule it daily at 06:35 IST so
config changes and instrument resolution self-heal. Expose the same job through the
worker's existing `--once` mechanism for local and operational verification.

The sync has no provider dependency and does not perform network I/O.

---

## 6. Server service and API

### 6.1 Server service

Add `apps/web/src/server/market-calendar.ts`. It is the only web layer allowed to call
the calendar repositories. Responsibilities:

- perform the authoritative `getSessionUser()` check;
- parse or receive validated filters;
- compute date boundaries in IST from an injected `now`;
- resolve the signed-in user's distinct watchlist instrument ids and symbols;
- resolve the company name from the instrument row when `instrument_id` is available;
- query events and summary counts;
- add `onWatchlist` to each event DTO;
- provide factual fallback explanations for missing descriptions/metadata;
- serialize instants as ISO-8601 UTC strings and leave calendar dates as date keys.

Although the underlying events are general market information, the endpoint is not
placed on the middleware public allow-list in v1. Authentication is still enforced in
the service so a forged/stale cookie cannot rely only on the edge presence check.

### 6.2 Query validation

Add `apps/web/src/server/market-calendar-schemas.ts` and a reusable query parsing helper
alongside the existing route helpers. The API route remains thin and does not import the
database.

Accepted parameters:

| Parameter | Validation |
| --- | --- |
| `from` | Optional `YYYY-MM-DD` IST date key. Must appear with `to`. |
| `to` | Optional `YYYY-MM-DD` IST date key. Must appear with `from`. |
| `eventType` | Optional exact `MarketEventType`. |
| `watchlistOnly` | Optional exact `true` or `false`; defaults to `false`. |

Rules:

- If neither `from` nor `to` is supplied, use the current IST Monday–Sunday week.
- Supplying only one boundary is `400 INVALID_QUERY`.
- `from` must be on or before `to`.
- The inclusive range may not exceed 366 days.
- Invalid calendar dates such as `2026-02-30` are rejected, not normalized.

### 6.3 Route and response

Add `apps/web/src/app/api/market-calendar/route.ts` with Node runtime,
`force-dynamic`, and `Cache-Control: no-store`.

Successful response:

```ts
interface MarketCalendarResponse {
  readonly events: readonly MarketEventDto[];
  readonly summary: {
    readonly today: number;
    readonly thisWeekResults: number;
    readonly upcomingCorporateActions: number;
    readonly watchlistRelated: number;
  };
  readonly filters: {
    readonly from: string;
    readonly to: string;
    readonly eventType: MarketEventType | null;
    readonly watchlistOnly: boolean;
  };
  readonly nowIso: string;
}
```

Errors use the existing shape:

```json
{
  "error": "Invalid market calendar filters.",
  "code": "INVALID_QUERY",
  "remedy": "Use valid inclusive IST dates and a supported event type."
}
```

`watchlistOnly=true` with no watched instruments returns an empty successful result,
not an authorization or server error.

---

## 7. `/calendar` page and interaction design

### 7.1 Page structure

Add the route to the existing signed-in app navigation under **Market record**, after
Announcements.

The page order is fixed:

1. Header
2. Summary cards
3. Filter bar
4. Events grouped by date
5. Empty/error/loading state as applicable
6. Informational disclaimer

Header copy:

- Title: **Market Calendar**
- Subtitle: **Track results, corporate actions, holidays, and events that may affect your watchlist.**

The existing `PageDisclaimer` primitive prepends transaction-related wording that this
feature explicitly excludes. The calendar therefore renders its own concise footer and
drawer disclaimer: **“This is market information, not investment advice.”** It does not
change the shared disclaimer used by existing pages.

### 7.2 Summary cards

Use the existing metric-card primitive and semantic tokens.

| Card | Window | Count |
| --- | --- | --- |
| Today's events | Today in IST | All event types |
| This week's result events | Current Monday–Sunday in IST | `result` only |
| Upcoming corporate actions | Today through today + 30 days | Dividend, bonus, split, rights, buyback |
| Watchlist-related events | Today through today + 30 days | Events matching any of the user's watchlists |

Cards are informational in v1. They do not silently rewrite the active list filters.

### 7.3 Filters and URL state

The page URL uses:

- `range=today|week|month` (default `week`);
- `eventType=<supported-id>`;
- `watchlistOnly=true`.

The server page converts `range` to the API/service `from` and `to` contract. Range
buttons are a segmented single-select control. Event type is an accessible select. The
watchlist control uses the existing scope-toggle pattern and is disabled with explanatory
text when the user has no watchlist instruments.

Changing a filter performs a URL navigation and server render, so filters survive refresh,
back/forward navigation, and link sharing. No client-side cache or duplicate fetch state is
introduced.

### 7.4 Timeline/list

Events are ordered by:

1. `event_date` ascending;
2. timed events before untimed events on the same date;
3. `event_time` ascending;
4. importance (`high`, `medium`, `low`, null);
5. title for deterministic ties.

They are grouped under semantic date headings rendered from date keys in IST. Each event
row/card shows:

- event-type badge;
- symbol/company identity when available;
- title and short description;
- IST time or “Time not specified”;
- source name or “Source unavailable”;
- a visible and accessible watchlist marker when applicable.

Use existing badge variants and semantic token classes only. Do not introduce raw color
values. Watchlist emphasis must include text/icon semantics, not color alone.

Desktop uses a compact timeline with aligned date/time and content columns. Small screens
use stacked cards with full-width tap targets and no horizontal scrolling.

### 7.5 Empty, loading, and failure states

- Route-level `loading.tsx` uses skeletons that preserve the summary/filter/list layout.
- Route-level `error.tsx` uses the shared error state and retry action.
- No data in the range: “No market events in this period.”
- Watchlist filter with no matches: “No watchlist-related events in this period.”
- Event-type filter with no matches names the selected type and offers a clear-filter action.
- Missing optional values remain visibly unavailable; they are never guessed.

### 7.6 Event detail drawer

Clicking or keyboard-activating an event opens the existing Radix-backed `Sheet`. It is a
right-side drawer on larger screens and uses a mobile-friendly near-full-width treatment
on narrow screens.

Contents:

1. company/symbol, when available;
2. event type and optional category;
3. event date and optional IST time;
4. plain-language explanation;
5. **Why this matters**;
6. **What to watch** as factual observation points;
7. source/provenance, with a safe external link when available;
8. exact disclaimer: **“This is market information, not investment advice.”**

The source link uses `target="_blank"` and `rel="noopener noreferrer"`. Missing source
name or URL produces calm fallback copy rather than an empty label or broken control.

---

## 8. Watchlist matching and isolation

The signed-in user's watched instruments are loaded through the existing owner-scoped
watchlist repository. Matching rules:

1. exact `instrument_id` match when the event resolved to an instrument;
2. otherwise exact uppercase NSE symbol match against symbols belonging to watched
   instrument ids;
3. no fuzzy company-name matching.

The list query receives only the current owner's resolved ids/symbols. No calendar table
contains owner data, and no response includes another user's watchlist names or counts.

General results include `onWatchlist` so the UI can highlight relevant rows.
`watchlistOnly=true` filters the database query to the current owner's match set rather
than fetching all events and filtering them only in React.

---

## 9. Planned file map

```text
config/
  market-calendar.yaml

packages/shared/src/
  market-calendar.ts
  market-calendar.test.ts
  index.ts                                  export additions

packages/db/src/schema/
  market-events.ts
  index.ts                                  export addition

packages/db/src/repositories/
  market-events.ts
  repositories.test.ts                      repository behavior where suitable
  index.ts                                  export additions

packages/db/drizzle/
  0025_market_calendar.sql                  migration (manual; snapshot chain ends at 0017)
  meta/_journal.json                        migration journal entry

apps/worker/src/jobs/
  market-calendar-sync.ts
  market-calendar-sync.test.ts

apps/worker/src/index.ts                    startup, schedule, and --once wiring

apps/web/src/server/
  market-calendar.ts
  market-calendar-schemas.ts
  market-calendar.test.ts
  watchlist-routes.ts                       reusable Zod query parser if appropriate

apps/web/src/app/api/market-calendar/
  route.ts

apps/web/src/app/calendar/
  page.tsx
  loading.tsx
  error.tsx

apps/web/src/components/calendar/
  calendar-view.tsx
  calendar-summary.tsx
  calendar-filters.tsx
  event-timeline.tsx
  event-detail-sheet.tsx
  calendar-view.test.ts

apps/web/src/lib/
  navigation.ts                             ready navigation entry

docs/
  api-reference.md                          endpoint contract update
```

Exact component splitting may be reduced if a file would contain only trivial wrappers;
the architectural boundaries—shared contract, DB repository, server service, route, and
view—must remain.

---

## 10. Testing strategy

### 10.1 Pure contract and date tests

- accept every supported event type;
- reject unknown types and importance values;
- reject duplicate YAML keys;
- reject impossible dates and invalid times;
- reject non-HTTP(S) source URLs;
- convert `2026-10-10` + `09:30` IST to the correct UTC instant;
- compute Monday–Sunday, month, and 30-day ranges across month/year boundaries;
- verify the calendar logic uses injected `now`, not ambient local timezone.

### 10.2 Worker tests

- merge configured events and derived holidays;
- do not create weekend rows;
- do not misclassify special sessions as holidays;
- resolve known symbols and preserve unresolved ones;
- reject cross-file key collisions;
- produce the same upsert keys on repeated runs;
- log unresolved symbols without failing the whole sync;
- never call a provider or network source.

### 10.3 Repository/database tests

- migration creates the requested columns, foreign key, checks, and indexes;
- repeated `source_key` upsert updates one row rather than inserting another;
- range bounds are inclusive;
- event-type filtering is exact;
- watchlist filtering returns only the current owner's instruments/symbols;
- two users with different watchlists receive different scoped results;
- null symbol/instrument events remain visible in general results;
- invalid event types and importance values fail at the database boundary.

Constraint/index behavior belongs in the real PostgreSQL integration suite when a test
database is configured. Pure mapping and query-input behavior stays in ordinary Vitest
tests.

### 10.4 Server/API tests

- absent range defaults to the current IST week;
- one missing date boundary is rejected;
- reversed, impossible, and over-366-day ranges are rejected;
- unsupported `eventType` and invalid booleans return `400 INVALID_QUERY`;
- missing/stale authentication returns the standard `401 UNAUTHENTICATED` shape;
- `watchlistOnly=true` with no watched instruments returns `200` and an empty list;
- response instants are ISO UTC and dates remain date keys;
- summary definitions match the agreed windows and ignore list filters.

### 10.5 UI tests

- group events by date in deterministic order;
- show all four summary values;
- preserve range/type/watchlist state in the URL;
- visually and accessibly mark watchlist events;
- open and close the detail sheet by pointer and keyboard;
- render missing symbol, time, description, source, and URL safely;
- render contextual empty states;
- include the exact disclaimer and no recommendation/execution language;
- use semantic tokens and avoid raw hex colors.

### 10.6 Final verification

Run from the repository root:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Also run the local PostgreSQL integration suite when `TEST_DATABASE_URL` is available,
then execute the sync twice against the test database and verify stable row counts.

---

## 11. Implementation sequence

| Phase | Work | Completion check |
| --- | --- | --- |
| 0 — Contract | Shared enums, metadata, config schema, IST range helpers | Pure tests pass |
| 1 — Persistence | Drizzle table, migration, repository, indexes/checks | Migration and DB tests pass |
| 2 — Sync | YAML file, holiday derivation, symbol resolution, worker startup/daily/once wiring | Two syncs produce no duplicates |
| 3 — Server/API | Authenticated service, Zod query parsing, API response and errors | API tests cover valid/invalid/scoped requests |
| 4 — Page | Navigation, summary cards, filters, grouped list, states, detail sheet | Desktop/mobile and keyboard review pass |
| 5 — Verification | Full checks, migration rehearsal, seed rehearsal, API docs | Acceptance matrix is green |

The implementation should proceed in this order so the UI is built against a stable,
tested response contract rather than fixtures that later drift from persistence.

---

## 12. Acceptance matrix

| Acceptance criterion | Planned evidence |
| --- | --- |
| `/calendar` works for signed-in users | Middleware gate + authoritative server session check + route/page test |
| Events grouped by date | IST date-key grouping test and UI review |
| Today / This Week / This Month | URL-backed range controls and IST boundary tests |
| Watchlist Only | Owner-scoped ids/symbols, repository and cross-user tests |
| Event Type filter | Zod enum + exact repository predicate + UI select |
| Summary cards | Fixed-window summary query tests |
| Detail drawer | Accessible Sheet interaction test and responsive review |
| Source/provenance shown | DTO and missing-source rendering tests |
| Missing values handled | Explicit fallbacks tested for each nullable field |
| Helpful empty/loading states | Route skeleton and contextual empty-state tests |
| No investment-advice language | Exact disclaimer plus copy review |
| No broker/execution UI | No provider calls or transaction affordances in file map/design review |
| API Zod validated | Shared query schema with invalid-input tests |
| Drizzle schema and migration | Versioned migration plus PostgreSQL verification |
| Seed/upsert behavior | Stable keys, two-run idempotency test |
| Typecheck, lint, tests pass | Final root commands recorded in implementation handoff |

---

## 13. Rollout and operational checks

1. Apply the migration through the existing main-branch deployment path; never point
   migration tooling at a pooled connection.
2. Let the worker's startup sync populate the initial rows, then run the `--once` job
   explicitly if an immediate operational retry is needed.
3. Confirm the sync reports the expected configured-event and holiday counts and names
   any unresolved symbols.
4. Call the authenticated API for the current week, a month boundary, every event type,
   and `watchlistOnly=true` using two different users.
5. Verify all displayed event times against their YAML IST values and UTC database
   instants.
6. Review the page at phone and desktop widths in light and dark themes, including
   empty, partial-source, missing-time, and missing-symbol cases.
7. Update `config/market-calendar.yaml` through normal version control. Reuse a key for
   corrections; do not change it casually.

The v1 feed is configuration-backed and therefore intentionally partial. The UI must
describe what is stored without claiming exhaustive NSE event coverage. Live source
ingestion can be planned later behind the same repository and API contract.
