# Public launch data freshness matrix

Values marked `Verify` are proposed launch contracts and must be checked against the worker's
actual schedule before approval. Every surface must show source, observation/session time and an
Unavailable/Stale state—never silently treat old data as current.

| Dataset / surface | Expected cadence | Proposed stale threshold | Source | Required unavailable behavior | 2026-10-11 state |
| --- | --- | --- | --- | --- | --- |
| Market status / index strip | Market-session live updates | 60 seconds during open session | Licensed provider | Replace values with unavailable status and recovery guidance | Unavailable / blocker |
| Watchlist quotes | Live/sweep during session | 60 seconds or route-specific tier | Licensed provider | Preserve last value only with explicit timestamp/stale label; no live colour implication | Not live-verified |
| Daily candles / stock charts | After completed NSE session | By next scheduled daily ingestion + grace | Licensed exchange/provider | Show last completed session and missing-session warning | Needs VPS evidence |
| Market Brief | Once per completed session after dependencies | Before next trading-session morning | Derived from approved inputs | Keep prior brief dated; state latest brief unavailable | 2026-10-09 available |
| Screener snapshot | After daily indicators complete | Same completed session as latest daily candles | Derived | Show dataset date and prevent “today” wording when stale | Needs live route audit |
| Intraday research / paper feed | During verified session only | 15 seconds for active simulated study | Licensed live provider | Mark outcome unavailable; never backfill/fabricate | Feed stopped / blocker |
| Institutional flows | Per published source update | One business day after expected publication | Approved source | Show source date and delayed/unavailable state | Needs VPS evidence |
| Corporate announcements | Frequent during exchange publishing window | Verify job schedule; alert after two missed cycles | Licensed NSE/BSE source | Identify source and last sync; disable unlicensed source | Rights blocker |
| Corporate actions | Daily | One business day | Licensed source | Show last sync; suppress conclusions requiring missing action | Needs VPS evidence |
| IPO calendar/details | Scheduled several times daily | 24 hours for active issues | Approved NSE/SEBI source | Show source/update time and partial-feed notice | Technically fresh; rights open |
| IPO subscription/listing | During active issue/listing schedule | Route schedule + one cycle | Approved source | Mark unavailable without carrying value as live | Technically fresh; rights open |
| IPO GMP | Currently InvestorGain | Immediate disable until licensed | InvestorGain | Hide feature; do not show an old quote | Rights blocker |
| AMFI categories | Semi-annual/official publication | One publication cycle | AMFI | Keep prior category dated or disable if unlicensed | Rights blocker |
| Market calendar | Exchange circular driven | Alert 14 days before verified-through date | Operator-verified config | Do not schedule on unverified dates | Verified through 2026-12-31 |

