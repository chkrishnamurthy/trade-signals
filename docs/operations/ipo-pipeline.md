# IPO data pipeline — runbook

How `/ipos` gets its data, and what to do when it goes wrong. Design and decisions:
[`docs/planning/ipos-plan.md`](../planning/ipos-plan.md).

## Sources

| Source | Kind | What it supplies | Config |
| --- | --- | --- | --- |
| NSE (`www.nseindia.com/api/*`, `nsearchives.nseindia.com`) | Official exchange | Calendar, past issues, issue detail, consolidated subscription (mainboard: `ipo-active-category`; SME: the detail payload's `bidDetails` + `demandGraphALL`), new listings (ISIN), listing-day prices (bhavcopy) | `config/ipo-sources.yaml` → `sources.nse` |
| BSE (`api.bseindia.com`) | Official exchange | BSE-only SME issues and BSE-side facts | `sources.bse` |
| SEBI (`www.sebi.gov.in`) | Regulator | DRHPs and their addenda filed before an issue is scheduled | `sources.sebi` |
| InvestorGain (`www.investorgain.com`) | **Aggregator** | The **unofficial** GMP only | `sources.investorgain` |

RHPs are downloaded from the exchange that lists them (`rhp.hosts` in the same file),
through that exchange's client, so the extractor is as polite as the job that found
the link. Documents on other hosts are linked, never fetched.

Every request goes through the polite client (`apps/worker/src/sources/ipo/http.ts`):
robots.txt is enforced in code, requests are serialised and spaced (`minIntervalMs`),
each run has a request budget (`maxRequestsPerRun`), only network errors / 429 / 5xx
are retried, and a long `Retry-After` opens a per-host circuit instead of waiting.

**User-Agent (owner decision D2):** NSE resets every non-browser client, so NSE alone
uses the browser string. Every other source sends
`EquityWise/1.0 (+https://equitywise.io; support@equitywise.io)`.

## Jobs (IST, `apps/worker/src/index.ts`)

| Job | Schedule | Feed health id(s) |
| --- | --- | --- |
| `ingest-ipo-calendar` | 08:40, 12:40, 18:40 Mon–Sat | `ipo-nse-calendar` (`ipo-bse-calendar`) |
| `ingest-ipo-details` | 07:50, 17:50 Mon–Sat | `ipo-nse-detail` |
| `ingest-ipo-subscriptions` | 10:35, 12:35, 14:35, 16:35, 17:35 Mon–Fri, trading days only | `ipo-nse-subscription` |
| `ingest-ipo-subscriptions-final` | 19:05 Mon–Fri, trading days only | `ipo-nse-subscription` |
| `ingest-ipo-listings` | 19:25, 20:25 Mon–Fri | `ipo-nse-listing` |
| `ingest-ipo-gmp` | 10:15, 15:15, 20:15 daily | `ipo-investorgain-gmp` |
| `extract-ipo-rhp` | 08:20, 13:20, 18:20 Mon–Sat | `ipo-nse-rhp` (`ipo-bse-rhp`) |
| `ingest-sebi-filings` | 09:45, 19:45 Mon–Sat | `ipo-sebi-filings` |
| `backfill-ipos` | on demand, and on worker start until it has completed for `backfill.since` | `ipo-history-<since>` (plus the calendar, detail, subscription and listing feeds it drives) |
| `backfill-ipo-rhp` | on demand, and after the first history load | `ipo-nse-rhp` — up to 200 RHPs from `rhp.since` in one run |

Health is visible at **`/admin/ipos`** (admin only): every feed's last success, last
attempt and error; observations no issue claims; and official-source conflicts.

## Running a job by hand (on the VPS)

```bash
cd /opt/equitywise
pnpm --filter @equitywise/worker start -- --once ingest-ipo-calendar
pnpm --filter @equitywise/worker start -- --once ingest-ipo-gmp
```

Every job is idempotent: a re-run only bumps `last_seen_at` on unchanged observations.

## First deploy

1. The migrations run through `deploy.sh`: `0027_ipos.sql` (six tables, append-only and
   freeze triggers), `0028_ipo_rhp_extracts.sql`, `0029_ipo_sebi_filings.sql`,
   `0030_ipo_data_repair.sql`, `0031_ipo_history_repair.sql` and
   `0033_ipo_document_links.sql` (data only — see
   "Repairs" below).
2. The history load runs **by itself**: on every worker start until a run has
   completed for the configured `backfill.since` (the `ipo-history-<since>` feed has
   a success), the worker runs `backfill-ipos` in the background, then
   `ingest-ipo-gmp`, then `backfill-ipo-rhp`. The load takes every issue opening on or
   after `backfill.since` (2024-01-01: ~640 issues) and fetches what each is missing,
   newest first: the detail page, the final consolidated subscription (mainboard:
   NSE's category endpoint, stamped with its own final time; SME: the detail payload's
   whole book), the listing-day prices and today's close; then SEBI's draft filings
   back to `backfill.filingsSince` (2023-01-01), linked to their issues. About 1,500
   requests at one per 3 s — **about two hours**. A run cut short by its budget is
   recorded as failed and continues on the next start (or `--once backfill-ipos`).
   Widening the window (an earlier `since`) makes the next start load the difference.
3. Watch `/admin/ipos` for a day. Its feed health is also the check that NSE answers
   the VPS's IP address (plan Phase 0): a green `ipo-nse-calendar` means it does.

## Repairs (2026-10-03)

`0030_ipo_data_repair.sql` cleans rows written before the parser fixes of 2026-10-03.
It is idempotent and a no-op on a fresh database:

- **Withdrawal windows.** NSE's past list carries `- Withdrawal Window` /
  `-Special Withdrawal Option` rows: windows for bidders to withdraw from an existing
  issue, not issues. The parser now skips them; the migration deletes their stored
  observations and any issue only such a row created.
- **Status in the name.** NSE writes `-Issue Withdrawn` / `-Issue postponed` into some
  past rows' names. The parser now strips it into the status, so the next calendar run
  marks the issue withdrawn or postponed and corrects its name; the migration cleans
  the slug where the clean one is free (a company that came back later the same year
  keeps the clean slug for its later issue).
- **SME subscription.** NSE's category endpoint reports 0 shares offered for every SME
  category and leaves out the individual investors; the job now reads the detail
  payload's complete book instead. The migration drops the incomplete SME readings;
  the detail job (issues closed in the last 30 days) and the subscription job refill
  them. On SME only the total has a ratio — NSE publishes no SME issue's shares per
  category.

`0031_ipo_history_repair.sql` cleans what the first history load wrote with the
older parser: follow-on offers (`… - FPO`) and numbered partly-paid lines
(`ADANIENPP1`), which NSE's past list carries but are not IPOs (a bare `PP` suffix is a
real IPO's bidding symbol and is kept); closed issues' final figures stamped with the
time they were collected (NSE empties `demandDataNSE` once an issue closes — the
parser now reads `demandGraph`'s time); and old SME books read as "NSE only".

`0033_ipo_document_links.sql` (2026-10-04) repairs document links NSE published with a
stray space (`RHP_PRANAV .zip`, `RHP_ SRM.zip`). The old parser stopped at the space and
stored `…/RHP_PRANAV`, which 404s, so every RHP run that held only that document failed
and the pages warned "RHP extracts: the last update failed". The parser now joins such a
link back up; the migration corrects the six stored rows (PRANAV, SAWALIYA, SRM — each
new link checked against NSE's archive) and lets the PRANAV RHP be read again. To find
any new case: `SELECT id, url FROM ipo_documents WHERE url !~* '\.[a-z0-9]{2,5}$';`
should return nothing.

RHP and DRHP-filing failures are no longer shown to readers (a failed run leaves what
was already read correct); they stay on `/admin/ipos` with their error.

## What history exists, and what cannot

| Data | From | Why |
| --- | --- | --- |
| Issue list, dates, price band, listing date, status | `backfill.since` (2024-01-01) | NSE's past-issue list (back to 2012) |
| Lot, issue size, registrar, lead managers, documents | `backfill.since` | NSE keeps each issue's detail page for years |
| Final subscription (consolidated) | `backfill.since` | NSE's category endpoint (mainboard), the detail book (SME) |
| Day-by-day subscription | while bidding, from first deploy | Only live readings exist; the final is backfilled |
| Listing-day prices, latest close | `backfill.since` | NSE's end-of-day archive; BSE-only listings have none |
| SEBI draft filings | `backfill.filingsSince` (2023-01-01) | SEBI's paged list |
| RHP sections | `rhp.since` (2026-01-01) | Downloads are heavy; older RHPs are linked |
| Unofficial GMP | the first stored quote (2 Oct 2026) | InvestorGain's page carries only the last few weeks; the pages say "recorded since …" |

## Switching a source off

Set `enabled: false` under the source in `config/ipo-sources.yaml` and restart the
worker (`pm2 restart worker`). The jobs skip it as a logged no-op. For the GMP source,
the web pages switch every GMP surface to its explainer within five minutes (the web
reads the same file), with no deploy needed for that part. **Do this at once on any
takedown request from a source.**

## RHP extraction

`extract-ipo-rhp` reads up to `rhp.maxDocumentsPerRun` (3) new RHPs a run (08:20, 13:20 and 18:20 IST, Mon–Sat) for issues that opened on or after `rhp.since` (2026-01-01; `backfill-ipo-rhp` reads up to 200 at once after the first history load), newest
issues first: download (zip or PDF, capped at `rhp.maxBytes`), unzip, pdf.js text
(capped at `rhp.maxPages`), then the pure extractor in
`packages/core/src/ipos/rhp.ts`. A 550-page RHP takes about 3 s. What it can read with
confidence (overview, objects, promoters, the restated summary, numbered strengths,
the first ten risk headings) is stored in `ipo_rhp_extracts` with its PDF pages;
anything else is skipped and the page links the document. An issue whose RHP is
listed by both exchanges is read once.

- **A document keeps failing.** After `rhp.maxAttempts` (3) failed reads it is left
  alone and counted under "Given up" on `/admin/ipos`, with the last error. To retry it:

  ```sql
  update ipo_documents set extract_attempts = 0, extract_error = null where id = <id>;
  ```

- **An extract is wrong for one issue.** Add an entry to
  `config/ipo-rhp-overrides.yaml` (slug, section, reason) in a PR. The web hides that
  section within five minutes; no worker restart.
- **The extractor is wrong for many RHPs.** Fix `rhp.ts` (with a fixture test), then
  bump `RHP_EXTRACTOR_VERSION`. Every RHP is then re-read at two a run.

## SEBI filings

`ingest-sebi-filings` reads the first page (25 filings) of SEBI's public-issue filings
list; the history load reads older pages back to `backfill.filingsSince` through the
list's own paging (a form POST to `/sebiweb/ajax/home/getnewslistinfo.jsp` in the list
page's session — robots.txt allows `/sebiweb/`). Filings are stored in `ipo_sebi_filings` on their own: a filing is not an
announced issue and never creates or changes one. It is linked to an issue for
display only when exactly one issue has the same normalised name and opens after the
filing (within ~18 months); unlinked filings are retried on every run. `/ipos` shows
the latest ten; an issue's page lists its own under "Offer documents".

## Withdrawn, postponed and unlisted issues

- An issue is **withdrawn** or **postponed** only when a source says so: the
  resolver reads each source's own status word (NSE `status`, BSE `Status`) and
  the designated exchange is heard first. A later "Active" clears it again.
  The status words for a withdrawal have not been seen live yet; the matcher
  (`lifecycleFromSourceStatus` in `packages/core/src/ipos/timeline.ts`) accepts
  withdrawn/cancelled/recalled/abandoned and postponed/deferred/rescheduled.
  If an exchange uses another word or a code, add it there with a test.
- A closed issue with no official listing date more than 5 settlement days past
  its expected T+3 listing reads **"Closed · no listing reported"**. Its expected
  listing date is no longer shown. It is never called withdrawn without a source.

## Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| `ipo-nse-*` failed, error `SourceHttpError: 401/403` | NSE session cookie handshake changed | The adapter already re-visits the IPO page once; if it persists, check NSE's page by hand and update `NSE_WARMUP_URL` in `nse.ts` |
| `ipo-nse-*` failed, `CircuitOpenError` | NSE rate-limited us (`Retry-After`) | Nothing — the next run after the cooldown resumes. If it repeats daily, raise `minIntervalMs` |
| Error mentions an envelope / Zod / "not the expected layout" | NSE changed a response shape | Capture the new response into `apps/worker/src/sources/ipo/__fixtures__/`, make the failing parser test pass |
| `ipo-investorgain-gmp` failed: `no initialTableResponse` | InvestorGain changed its page | Capture the page, update `investorgain.ts` and its fixture; meanwhile the UI shows the last GMP as stale |
| An issue is missing from `/ipos` | BSE-only SME issue while BSE is off, or a probable-only match | Check `/admin/ipos` → unmatched observations |
| A GMP row is unmatched | Aggregator name or dates differ from NSE's | Expected for BSE-only SME issues; otherwise check the dates — the matcher refuses rather than guesses |
| `ipo-nse-rhp` failed: `neither a PDF nor a zip` | NSE served an HTML error page for the archive | Usually transient; the document is retried on the next run (up to `maxAttempts`) |
| `ipo-nse-rhp` failed: `exceeds the …-byte cap` / `-page cap` | An unusually large RHP | Raise `rhp.maxBytes` / `rhp.maxPages` if the document is genuine, then reset its attempts |
| `ipo-sebi-filings` failed: `no filing rows could be read` | SEBI changed the listing page | Capture the page into `__fixtures__/sebi-public-issues.html`, fix `sebi.ts` |
| `listing-day row does not match the issue` in the logs | Bhavcopy previous close ≠ official issue price (reused symbol / relisting) | Nothing is written. Check the issue by hand |

## Verify from the VPS (before the first deploy)

```bash
ssh krishna@187.127.171.118 'curl -s -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0 Chrome/125" https://www.nseindia.com/api/ipo-current-issue; curl -s -o /dev/null -w "%{http_code}\n" -A "EquityWise/1.0" https://www.investorgain.com/report/ipo-gmp-live/331/'
```

Both should print `200`. (The NSE call may need the cookie warm-up; the worker does it.)
SEBI is reached with the honest User-Agent; check it the same way:

```bash
ssh krishna@187.127.171.118 'curl -s -o /dev/null -w "%{http_code}\n" -A "EquityWise/1.0" "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=10"'
```
