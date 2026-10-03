# IPO source fixtures

Captured from the live sources on **2026-10-02** (docs/planning/ipos-plan.md, Phase 0).
The parsers in `../nse.ts` and `../investorgain.ts` are tested against these; a
response-shape change upstream should become a failing test here first.

| File | Source | Notes |
| --- | --- | --- |
| `nse-current-issue.json` | `www.nseindia.com/api/ipo-current-issue` | Verbatim. Bid counts are **NSE-only** (equal the detail's `demandGraph.TOTAL_BIDS`). |
| `nse-upcoming-issues.json` | `/api/all-upcoming-issues?category=ipo` | Verbatim. Mixes in a `DEBT` issue; the SME row carries `lotSize`. |
| `nse-past-issues.json` | `/api/public-past-issues` | **Trimmed** from 1,470 rows to 54: the newest 45, one or more each of `BE`/`DEBT`/`IV`/`RR`/`N0`, and the 3 oldest (2012). Rows are unmodified. |
| `nse-detail-vnl-eq.json` | `/api/ipo-detail?symbol=VNL&series=EQ` | Verbatim. Mainboard, open. Issue size mixes "lakhs" and a share count. |
| `nse-detail-aonesteels-eq.json` | `…symbol=AONESTEELS&series=EQ` | Verbatim. Mainboard, listed 2026-10-01; employee discount, anchor report. |
| `nse-detail-rkfal-sme.json` | `…symbol=RKFAL&series=SME` | Verbatim. SME, upcoming: no bids yet, `Lot Size` title (no `Bid Lot`). |
| `nse-detail-eventions-sme.json` | `…symbol=EVENTIONS&series=SME` | Verbatim. SME, open; QIB offered `0`. |
| `nse-detail-nityas-eq.json` | `…symbol=NITYAS&series=EQ` | Verbatim. Band written `Rs. 70/- to Rs. 75/-per equity share` (the `/-` suffix); ₹5 face value. |
| `nse-active-category-vnl.json` | `/api/ipo-active-category?symbol=VNL` | Verbatim. **Consolidated NSE+BSE** bids (≈ `demandGraphALL.TOTAL_BIDS`), with an "Updated as on" IST time. |
| `nse-recent-listing.json` | `/api/new-listing-today?index=RecentListing` | Verbatim. Recent listings with ISIN; includes debt (`N0`) rows. |
| `nse-bhavcopy-01102026.csv` | `nsearchives.nseindia.com/products/content/sec_bhavdata_full_01102026.csv` | **Excerpt**: header + 15 rows. AONESTEELS and MONEYVIEW listed that day (`PREV_CLOSE` = issue price). |
| `investorgain-gmp-live.html` | `www.investorgain.com/report/ipo-gmp-live/331/` | **Reconstructed**: the page's Next.js flight data reduced to the one line carrying `resultData.initialTableResponse.reportTableData`, with 10 of the 50 real rows (unmodified), split across two `self.__next_f.push` chunks the way the live page splits lines. |

## BSE (Phase 10)

Captured from `api.bseindia.com` / `www.bseindia.com` on 2026-10-02 through the
lenient `node:https` transport (BSE's servers send header lines `fetch` rejects).

| File | Source | Notes |
| --- | --- | --- |
| `bse-public-issues.json` | `/BseIndiaAPI/api/GetPublicIssue_par/w` | Verbatim. Live/forthcoming issues of every kind: 9 equity IPOs among FPOs, rights, buybacks, debt. |
| `bse-issue-bbs-8020.json` | `/GetMkt_ISSUE_BBS_IPO/w?IPO_NO=8020` | Verbatim. A dual-listed mainboard issue (Vishal Nirmiti); parties as `Name^address\|\|\|…\|email\|contact`. |
| `bse-issue-bbs-8015-sme.json` | `…?IPO_NO=8015` | Verbatim. A BSE SME issue (Dove Soft); blank UPI cut-off. |
| `bse-ipo-details-8020.json`, `bse-ipo-details-8015-sme.json` | `/ipo_details_ng/w?stripono=…` | Verbatim. The label/value variant of the same detail (kept for reference; the adapter reads the flat record). |
| `bse-cumulative-demand-8020.json` | `/Pubissues_BBS_CumultveCatdem_ng/w?IPO_NO=8020` | Verbatim. Category demand on both exchanges, `Maxdt` in IST. |
| `bse-cumulative-demand-8015-sme.json` | `…?IPO_NO=8015` | Verbatim. `{}` — SME issues have no cumulative table. |
| `bse-bkbldg-demand-8020.json` | `/Pubissues_GetBkbldgCatdem_PAR_ng/w?IPO_NO=8020` | Verbatim. BSE's own book (`table1`); the fallback for SME issues. |
| `bse-listings-20261001.json` | `/MoreCompanyN/w?Fromdt=20261001&flag=1&type=2` | Verbatim. Mainboard new listings with issue price. |
| `bse-listings-sme-20260929.json` | `…&flag=2&type=2` | Verbatim. SME new listings; no ticker field — the ticker and trading code are read from the `IMAGE` URL. |
| `bse-bhavcopy-20261001.csv` | `/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_20261001_F_0000.CSV` | **Excerpt**: header + 7 rows. On listing day `PrvsClsgPric` is `0.00` (AONESTEELS, MONEYVIEW). |

## SEBI and RHPs (Phase 11)

| File | Source | Notes |
| --- | --- | --- |
| `sebi-public-issues.html` | `www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=10` | **Excerpt** (2026-10-02): the filings table (25 rows, unmodified) and the record count; the site chrome is cut. The title attribute nests an `<a>` to the abridged prospectus. |
| `sebi-public-issues-page2.html` | `POST www.sebi.gov.in/sebiweb/ajax/home/getnewslistinfo.jsp` (`doDirect=1`, with the list page's session cookie) | Unmodified (2026-10-03): the second page of the same list (25 rows, 11 Sep → 17 Aug 2026). Links are single-quoted here. |
| `packages/core/src/ipos/__fixtures__/rhp-vnl-pages.json` | `nsearchives.nseindia.com/content/ipo/RHP_VNL.zip` → `RHP.pdf` | **Excerpt**: pdf.js page texts of the 551-page Vishal Nirmiti RHP, only the pages the extractor reads (contents, risk factors, restated summary, objects, business, promoters); the rest are blank. Kept beside the pure extractor it tests. |

The zip reader and PDF text step are tested on archives and PDFs built inside the
test (`rhp-document.test.ts`), so no binary fixture is committed.
