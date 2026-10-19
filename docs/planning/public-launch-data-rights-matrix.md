---
name: Public launch data-rights matrix
status: blocked
horizon: now
created: 2026-10-11
updated: 2026-10-11
area: [legal, data, marketing]
summary: Source-by-source evidence and launch decisions for display, derived analysis and promotional reproduction.
owner: krishna
---

# Public launch data-rights matrix

This is an engineering launch-control record, not legal advice. `Unknown` or `blocked` means the
source must not be used for a public release until the owner holds written permission covering the
specific use. Attribution does not replace a licence.

## Decision vocabulary

- **Allowed:** written licence/permission is on file and covers the stated use.
- **Link only:** EquityWise may link to the source but may not copy, transform or display its data.
- **Blocked:** published terms conflict with the use, or a required agreement is absent.
- **Unknown:** public documentation does not answer the redistribution question; obtain a written
  answer before use.

## Matrix

| Source | Main-branch use found | Signed-in display | Derived analysis | Marketing capture | Current decision / required evidence |
| --- | --- | --- | --- | --- | --- |
| NSE / NSE Data | Prices, candles, indices, market breadth, screener inputs, IPO data | **Blocked** | **Blocked** | **Blocked** | The [NSE Data Sharing & Usage Policy](https://www.nseindia.com/static/market-data/nse-data-policy) requires a subscriber agreement describing intended handling/dissemination, prices commercial access and prohibits redistribution except as agreed. Obtain an NSE/NSE Data agreement explicitly covering a public multi-user research product, derived indicators, caching, end users, screenshots and recorded video. |
| FYERS API | Default market-data provider, credential minting, candles/quotes | **Blocked** | **Blocked** | **Blocked** | The current [FYERS API Terms](https://fyers.in/terms-and-conditions-api) state exchange data must not be used to develop charting/technical tools or paper/virtual trading and prohibit unauthorised dissemination/processing. Do not launch with FYERS-derived product surfaces unless FYERS and the exchange provide written terms that override/clarify this use. |
| Dhan Data API | Optional/routed provider and live feed | **Unknown** | **Unknown** | **Unknown** | Dhan publicly describes Data APIs for live/historical data, but no reviewed document grants EquityWise redistribution/display rights to multiple end users. Obtain a written commercial/public-display licence covering storage, derived indicators, screenshots and video. |
| BSE | Corporate announcements and IPO source code on `main` | **Blocked** | **Blocked** | **Blocked** | BSE's [Self Data Feed](https://marketdata.bseindia.com/) requires registration, plan selection, pricing and agreements, including for corporate announcements. The current undocumented browser-style endpoint is not licence evidence. Keep ingestion disabled until an agreement covers the use. |
| InvestorGain | Unofficial IPO GMP ingestion | **Blocked** | **Blocked** | **Blocked** | InvestorGain's [Disclaimer and Privacy Statement](https://www.investorgain.com/article/disclaimer-and-privacy-statement/250/) claims IP rights, prohibits unauthorised access and says its content may not be copied, reproduced, republished or used to build a similar site. Disable ingestion/display and remove its values from demos unless written permission is obtained. |
| SEBI website / filings | Filing links and RHP discovery/extraction | **Link only** | **Blocked pending permission** | **Blocked pending permission** | SEBI's [Website Policy](https://www.sebi.gov.in/website-policy.html) permits direct links, but says reproduction requires permission, accurate reproduction and prominent acknowledgement; third-party material requires the holder's authorisation. Linking is acceptable under that policy; extracted/reproduced RHP text needs a permission and issuer/third-party rights review. |
| Issuer RHPs | Parsed sections from offer documents | **Unknown** | **Unknown** | **Unknown** | Public availability is not a general reproduction licence. Establish whether EquityWise stores facts only, displays excerpts, or creates summaries; obtain legal approval and retain source/date citations. |
| AMFI | Market-cap category ingestion | **Blocked** | **Blocked** | **Blocked** | [AMFI Terms of Use](https://www.amfiindia.com/terms-of-use) limit use to personal, non-commercial use and prohibit public display, transmission, publication and derivative works without written approval. Obtain written permission or replace the source. |

## Immediate launch controls

1. Public launch remains **NO-GO** while NSE/FYERS rights are unresolved because those feeds power
   the core product promise.
2. Make BSE announcements and InvestorGain GMP opt-in only after a written approval record exists;
   do not include either in screenshots, demos or promotional copy now.
3. Keep SEBI/RHP output link-first. Do not quote or reproduce document content in promotion until
   permission and third-party rights are reviewed.
4. Store each approval/agreement outside Git; record its owner, effective date, permitted users,
   permitted transformations, display/redistribution terms, attribution and expiry here.
5. Re-review current provider/exchange terms before each public release; web terms can change.

## Approval record

| Source | Agreement owner | Evidence location | Effective / expiry | Approved uses | Reviewer | Status |
| --- | --- | --- | --- | --- | --- | --- |
| NSE / NSE Data | Unassigned | — | — | — | Legal counsel required | Open |
| FYERS | Unassigned | — | — | — | Legal counsel required | Open |
| Dhan | Unassigned | — | — | — | Legal counsel required | Open |
| BSE | Unassigned | — | — | — | Legal counsel required | Open |
| InvestorGain | Unassigned | — | — | — | Legal counsel required | Open |
| SEBI / RHP | Unassigned | — | — | Link-only currently | Legal counsel required | Open |
| AMFI | Unassigned | — | — | — | Legal counsel required | Open |
