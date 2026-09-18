---
name: Dhan provider
status: in-progress
horizon: next
created: 2026-09-16
updated: 2026-09-17
board: EW-075
phases_total: 9
phases_done: 8
phase_names: [Probe, packages/dhan, providers-dhan, Credential lifecycle, Provider switch, Validation, Router + cut-over ready, Live socket, Production cut-over]
area: [provider, worker, ops]
supersedes: [upstox-provider-plan]
confidence: 3
summary: Run Dhan and Fyers both, routed by strength. All build phases complete; production cut-over (§10g) not yet executed.
owner: krishna
---

# Dhan as a market-data provider — research, verdict, and migration plan

**Status:** **All phases 0–7 complete** (2026-09-17, see §10a–§10h) · production cut-over not yet executed (procedure in §10g) · Dhan socket built and live-verified, not yet the default
**Date:** 2026-09-16 (all Dhan/Fyers figures verified against live docs on this date)
**Question asked:** Can we stop depending on Fyers for everything and switch to Dhan?
Or run both? What does Dhan cost? What stays on Fyers and what moves to Dhan?
**Related:** [upstox-provider-plan.md](upstox-provider-plan.md) (the same shape of plan,
for Upstox — superseded by this one if Dhan is chosen) ·
[market-data-scaling-plan.md](market-data-scaling-plan.md) ·
[../operations/deployment.md](../operations/deployment.md) §5

> Plain-language summary first, details after. Every number in §3 has a source in §11.
> Anything I could not confirm from Dhan's own docs is marked **(verify)**.

---

## 0. The answer in five sentences

1. **Yes, we can switch, and yes, we can run both.** The code was built for this: every
   feature talks to a neutral `MarketDataProvider` interface, never to Fyers directly. Dhan
   is one new adapter, not a rewrite.
2. **Dhan costs ₹499 + 18 % GST ≈ ₹589 per month (≈ ₹7,070 per year) for its Data API.**
   The old "free with 25 trades a month" promotion has been **discontinued** (Dhan support,
   checked 2026-09-16). Fyers' data API is free.
3. **Dhan is better at the two things that hurt us most today:** its token minting is an
   *officially documented* TOTP endpoint (Fyers' is an undocumented one that can break any
   day), and its bulk quote and websocket limits are 20–25× bigger (1,000 symbols per
   quote call; 5,000 symbols per socket vs Fyers' 50 and 200).
4. **Fyers is still better at one thing we use:** it has a real *market-status* endpoint
   (open / pre-open / closed). Dhan has no REST equivalent. Fyers also stays the free,
   already-working fallback.
5. **Recommended shape: run both, route by strength.** Bars + bulk quotes + (later) the
   live socket go to Dhan; market status and instant fallback stay on Fyers. One env flip
   per capability moves it back. Total added cost: ≈ ₹7,070/year.

**One thing neither broker fixes:** both Fyers' and (by exchange policy) Dhan's API terms
allow *personal* use only and forbid *displaying data to third parties*. Once EquityWise
has real public users, live NSE prices must come from an **authorised data vendor**
(TrueData, Global Datafeeds, …), not a retail broker account. That is a separate, later
decision (§9) and it does not change anything in this plan — the same provider interface
absorbs a vendor too.

---

## 1. Plain-words glossary

| Word | Meaning here |
| --- | --- |
| **Provider** | Whoever gives us prices. Today: Fyers. The code calls it `MarketDataProvider`. |
| **Adapter** | The small package that translates one provider's shapes (symbols, prices, times) into ours. `packages/providers-fyers` is one. `packages/providers-dhan` would be the second. |
| **Token** | The daily password that lets the worker read prices. Both brokers expire it every 24 h (SEBI rule). |
| **Single-session** | Fyers' rule: log into the Fyers app on your phone and the worker's token dies. Dhan does not document any such rule **(verify)**. |
| **Data API** | Dhan's name for the paid bundle: live socket + quotes + history. Order APIs are free; we never use them. |
| **Router** | A tiny in-repo provider that says "bars → Dhan, market status → Fyers". Lets us run both. |
| **Authorised vendor** | A company licensed by NSE/BSE to *redistribute* prices to the public. Brokers are not. |

---

## 2. What we actually take from Fyers today

Measured from the code, not the docs. Six things, and only six:

| # | What | Where it is called | How often |
| --- | --- | --- | --- |
| 1 | **Daily bars (1d)** | `apps/worker/src/jobs/ingest-daily.ts` | Once per trading day, every instrument in the demand set |
| 2 | **Intraday bars (1m)** | `apps/worker/src/jobs/vwap-signals.ts`, `apps/web/src/server/history.ts` | Every 5 min in-session (worker); on chart open (web) |
| 3 | **Snapshot quotes** | `vwap-signals.ts` quote cycle, `apps/web/src/server/watchlists.ts`, `live-quotes.ts` poll fallback | Every 5 min (worker); every 3 s per 50 symbols while the socket is down (web) |
| 4 | **Live tick socket** | `apps/web/src/server/live-quotes.ts` via `fyers-api-v3` SDK | One socket per web process; ≤ 200 symbols |
| 5 | **Market status** | `apps/web/src/server/market-status.ts`, `vwap-signals.ts` | Every cycle; drives the "Live / Closed" badge and whether the worker scans at all |
| 6 | **Instrument list** | `apps/web/src/server/search.ts` | Cached; used by `/api/search` |
| — | **Daily token** | `apps/worker/src/jobs/refresh-credential.ts` | 08:30 IST + on startup + self-heal after a rejected token |

Everything else (indicators, signals, watchlists, charts) never sees a provider. That is
the whole reason a second provider is cheap.

---

## 3. Dhan vs Fyers — the facts (verified 2026-09-16)

### 3.1 Money

| | Fyers | Dhan |
| --- | --- | --- |
| Data API price | **₹0** | **₹499 + GST per 30 days** (≈ ₹589 with 18 % GST; ≈ ₹7,070/year), no waiver |
| Waiver | n/a | **None.** The "free with 25 trades in 30 days" promotion is discontinued; third-party blogs still repeat it. Trades placed manually or via API make no difference |
| Billing | n/a | Auto-debit from the trading account balance; email on each renewal; cancellable from the platform |
| Account needed | Fyers trading account (have) | A Dhan trading account (new). Keep enough balance for the monthly debit or the feed stops. |

Practical note: **budget the full ₹7,070/year.** Nothing you do on the account reduces it —
and this app never places orders in any case (CLAUDE.md).

### 3.2 Limits (the numbers that shape the worker)

| Limit | Fyers (as coded) | Dhan (documented) | Winner for us |
| --- | --- | --- | --- |
| REST, data calls | 10/s · 200/min · 100k/day (we run at half: 5/s · 100/min) | **5/s, no per-minute cap, 100k/day** (Data APIs) | Tie on volume; Dhan has no per-minute cliff |
| Quote call | **50 symbols per call**, counted against the minute budget | **1,000 symbols per call at 1 call/s** (Quote APIs) | **Dhan, by ~20×** — the whole demand set in one call |
| Non-data calls (profile, instruments) | shared budget | 20/s | Dhan |
| Websocket | **200 symbols per connection** (our `MAX_SUBSCRIPTION_SYMBOLS`) | **5,000 per connection × 5 connections**, 100 per subscribe message | **Dhan, by 25×** — the multi-user fan-in stops being symbol-capped |
| Punishment for breach | 3 per-minute breaches ⇒ blocked rest of day; edge bans up to ~1 h | Not documented as harshly **(verify)** — still run our limiter at half |

### 3.3 History depth

| | Fyers (as coded) | Dhan |
| --- | --- | --- |
| Daily bars | From 2017-07-03 (`HISTORY_EPOCH_START`), 366 days per request | **Since the stock's inception**, no stated window |
| 1-minute bars | From 2017, 100 days per request | **Last 5 years**, **90 days per request** |
| Intraday intervals served natively | 1..240 min | 1, 5, 15, 25, 60 min |
| Effect on rule #4 (store 1m + 1d only) | none | none — we still derive 5m/15m/30m/1h from 1m |

Dhan's deeper daily history is a real upgrade for the EOD indicator warm-up (200-day
averages on newly listed names, long-lookback returns). Its 1m window (90 vs 100 days)
is slightly smaller; the backfill just takes ~10 % more calls.

### 3.4 Token / login (the part that breaks today)

| | Fyers | Dhan |
| --- | --- | --- |
| Token life | 24 h (expires ~07:00 IST) | **24 h from generation** |
| Refresh token | Withdrawn 1 Apr 2026 | None. But `POST /v2/RenewToken` gives a fresh 24 h **while the current one is still alive** |
| Headless daily mint | **Undocumented** `api-t2.fyers.in/vagator/v2/*` endpoints (see `AUTOMATED_LOGIN_CAVEAT` in `packages/fyers/src/auth.ts`) | **Officially documented**: `POST https://auth.dhan.co/app/generateAccessToken?dhanClientId=…&pin=…&totp=…` → `{ accessToken, expiryTime }`. For individual accounts with TOTP enabled. |
| Other flows | Browser OAuth (`generate-authcode`) | Web-dashboard static token; API-key + secret consent flow (3-step OAuth) |
| Single-session kill | **Yes** — a phone login kills the worker's token | **Not documented** as a limitation; no logout/revoke endpoint exists **(verify in Phase 0 by logging into the app while the worker runs)** |
| Static IP | Not needed for data | **Only for order APIs** — we never call them |
| SEBI algo rules (Apr 2026) | Order placement locked down | Same — irrelevant, we place no orders |

This is the single biggest quality-of-life win: the self-heal machinery in
`refresh-credential.ts` stays, but it would call a *supported* endpoint. And if Dhan is
indeed not single-session, the "manual trading login killed the feed" incident class
disappears.

### 3.5 Feature-by-feature

| Need (from §2) | Fyers | Dhan | Note |
| --- | --- | --- | --- |
| Daily bars | ✅ | ✅ `POST /v2/charts/historical` | Dhan: floats + epoch-seconds; adapter converts to paise + UTC ms |
| 1m bars | ✅ | ✅ `POST /v2/charts/intraday` | 90-day windows, resumable backfill |
| Snapshot quotes | ✅ 50/call | ✅ `POST /v2/marketfeed/ltp` · `/ohlc` · `/quote`, 1,000/call | `/ohlc` gives LTP + OHLC; `/quote` adds volume, avg price, depth |
| Live socket | ✅ via obfuscated SDK (protocol unpublished) | ✅ `wss://api-feed.dhan.co?version=2&token=…&clientId=…&authType=2`, **documented little-endian binary** packets (ticker / quote / full) | We can hand-write the transport; no SDK dependency |
| **Market status** | ✅ REST endpoint | **❌ No REST endpoint.** The socket sends a market-status packet **(verify it exists in v2 as in v1)** | The one real gap. See §5.3 |
| Instrument list | ✅ | ✅ CSV master `https://images.dhan.co/api-data/api-scrip-master.csv` (+ `-detailed.csv`), and `GET /v2/instrument/{segment}` | Numeric `securityId` + `exchangeSegment` (`NSE_EQ`, indices under `IDX_I`) |
| Node SDK | `fyers-api-v3` (obfuscated CJS, needed for socket) | `dhan-oss/DhanHQ-js` v1.0.6, MIT, TypeScript, ~24 stars, low activity | **Don't depend on it**; use it as a reference for the binary layout only |
| Corporate actions | ◐ none usable | ◐ none usable | Unchanged: adjustment factors keep coming from a separate NSE/BSE reconciliation job |

### 3.6 Reliability signals

- Dhan: a June 2026 community report of the 20-depth socket silently stopping while
  connected — the same "connected but silent" failure our hub already detects
  (`live-quotes.ts` 10 s silence rule) and falls back from. Nothing suggests Dhan is
  worse than Fyers; nothing proves it better. **Phase 5's cross-diff is how we find out.**
- Both brokers changed auth in the last 18 months (Fyers removed refresh tokens; Dhan
  moved to 24 h tokens + TOTP from 1 Oct 2025). Zod-at-the-boundary keeps that a loud,
  local failure.

---

## 4. Three ways to do it — and which one

| Option | What it means | Verdict |
| --- | --- | --- |
| **A. Full switch to Dhan** | `MARKET_DATA_PROVIDER=dhan`; Fyers stays in the tree, unused | ❌ Loses market status; pays ₹7k/yr to keep a free fallback idle |
| **B. Switch-only (Upstox-plan shape)** | One env var picks *one* provider for everything | ◐ Fine as the first cut, but forces option A's gap |
| **C. Run both, route by capability (recommended)** | A `createRoutedProvider()` in `packages/market-data` sends each method to a preferred provider, with the other as fallback | ✅ Best of each; each route is one env var; instant rollback per capability |

**Option C, implemented on top of B**: build the `MARKET_DATA_PROVIDER` switch first
(cheap, proves the adapter), then add the router.

---

## 5. Recommended split — what stays on Fyers, what moves to Dhan

### 5.1 Move to Dhan

| Capability | Why Dhan |
| --- | --- |
| **Daily bars (EOD pass)** | History since inception; no per-minute cap; deeper warm-up for long lookbacks |
| **1m bars (worker scan + web chart)** | 5 years of 1m; 90-day windows; fine for the closed-candle engine |
| **Bulk snapshot quotes (worker quote cycle, watchlist detail)** | 1,000 symbols per call. The entire multi-user demand set is **one request per second**, instead of `ceil(N/50)` requests against a 100/min budget |
| **Daily token mint** | Documented TOTP endpoint; `RenewToken` for a pre-expiry rollover; (probably) no single-session kill |
| **Live socket — later, Phase 7** | 5,000 symbols/connection removes the 200-symbol ceiling that forces REST polling for the overflow today. Do it *after* the REST paths are proven; the current Fyers socket works |

### 5.2 Keep on Fyers

| Capability | Why Fyers |
| --- | --- |
| **Market status** | The only one of the two with an authoritative REST endpoint. `capabilities.marketStatus: true` stays honest |
| **Fallback for bars and quotes** | Free, already rate-limited and circuit-broken, already self-healing. When Dhan throws `MarketDataProviderError`, the router retries on Fyers |
| **Live socket — for now** | Works today; SDK transport + fan-in hub are done and tested. Move only when the 200-symbol cap actually binds |

### 5.3 The market-status gap, three ways to close it

1. **Route it to Fyers** (recommended for now — it is what the router is for).
2. **Derive from the Dhan socket's market-status packet** **(verify it exists in v2)** —
   turns a push into a `fetchMarketStatus()` answer via the hub's last-seen state.
3. **Clock + NSE holiday calendar** in `config/market-calendar.yaml` — pure, testable,
   but not authoritative (special sessions, halts). Use only as the last fallback.

---

## 6. Package design (mirrors the Fyers layout one-for-one)

```
packages/dhan/                 raw Dhan knowledge — the ONLY place a Dhan type may live
  src/http.ts                  fetch wrapper: base https://api.dhan.co/v2, header `access-token`,
                               reuses RateLimiter + PathCircuitBreaker (5/s, 100k/day; run at half)
  src/auth.ts                  generateAccessToken (TOTP), RenewToken, expiry model (24 h from mint)
  src/instruments.ts           download + parse api-scrip-master.csv; symbol ⇄ securityId indexes
  src/candles.ts               /charts/historical (daily) and /charts/intraday (1m, 90-day windows)
  src/quotes.ts                /marketfeed/ohlc and /marketfeed/quote, batched at 1,000, 1 call/s
  src/stream.ts                ws transport + little-endian binary packet decode (Phase 7)
  src/symbols.ts               `NSE_EQ` / `IDX_I` segment codes, securityId helpers
  src/errors.ts, types.ts      typed errors; Zod schemas for every response
packages/providers-dhan/       the adapter — the ONLY file that holds a Dhan type and a product type together
  src/adapter.ts               createDhanProvider(): MarketDataProvider
  src/mapping.ts               rupee float → integer paise (Math.round(x*100)); epoch s → UTC ms;
                               null-for-missing; dropFormingBar (share with Fyers via a small util)
  src/resolution.ts            '1m'|'5m'|'15m'|'1h'|'1d' → 1|5|15|60|daily; 30m and 1w derived, never requested
  src/auth.ts                  neutral CredentialStore + ensureCredential, same shape as providers-fyers
  src/errors.ts                PROVIDER_ID = 'dhan'
packages/market-data/
  src/routed.ts                createRoutedProvider({ bars, quotes, status, stream, instruments }) —
                               provider-neutral, pure composition, capabilities = union with honesty rules
```

**Symbol model.** Dhan addresses instruments by a numeric `securityId` inside an
`exchangeSegment`, not a ticker string. Like the Upstox plan, the adapter resolves
`RELIANCE` → `(NSE_EQ, 2885)` through the instrument master, cached and refreshed daily,
and stores the id in `Instrument.providerRef` (opaque, never rendered). A stale master
must fail loudly, not resolve to nothing.

**Money.** Dhan returns rupee floats (`2734.5`). `toPaise = Math.round(x * 100)` inside the
adapter only; test against hand-computed fixtures including `.005` edge cases (hard rule 3).

**Time.** Dhan candle timestamps are epoch **seconds**; ours are epoch **milliseconds**,
bar-open, UTC (hard rule 6). Multiply by 1,000; never touch the server's zone.

**Closed candles.** Same `dropFormingBar` discipline as Fyers (hard rule 2). Move that
function into `packages/market-data` so both adapters share one tested copy.

---

## 7. What changes outside the new packages (and what does not)

**Changes:**

1. `apps/web/src/server/provider.ts` — builds Fyers, Dhan, or the router from env.
2. `apps/worker/src/context.ts` — same, plus one `setAccessToken(providerId, token)` per provider.
3. `apps/worker/src/jobs/refresh-credential.ts` — becomes per-provider: the Fyers strategy
   (TOTP via vagator) and the Dhan strategy (TOTP via `generateAccessToken`, `RenewToken`
   before expiry). Both write to `provider_credentials` under their own `providerId`.
4. `packages/db` — `provider_credentials.appId` holds `dhanClientId` for the `dhan` row.
   The column is already free-text and keyed by `providerId`; **no migration needed**.
   Rename to `principalId` only if it bothers us later.
5. `.env` — `DHAN_CLIENT_ID`, `DHAN_PIN`, `DHAN_TOTP_SECRET` (worker only; never the web
   host — same rule as `FYERS_TOTP_SECRET`), and the routing switches:
   `MARKET_DATA_PROVIDER=fyers|dhan|routed`, `MARKET_DATA_ROUTE_BARS`, `…_QUOTES`,
   `…_STATUS`, `…_STREAM`, `…_INSTRUMENTS` each `fyers|dhan`.
6. `packages/market-data/src/__tests__/boundary.test.ts` — assert nothing in `apps/*`,
   `packages/core`, or DTOs imports `@equitywise/dhan`.
7. `docs/operations/deployment.md` §5 — a Dhan sub-section (subscription auto-debit,
   token lifecycle, what "feed dark" looks like when the ₹499 debit failed).

**Does not change:** `packages/core`, every indicator, every signal, every watchlist
route, the charts, the EOD job's logic, the live-quote hub, the boundary rules.

---

## 8. Phased plan

| Phase | Work | Done when | Effort |
| --- | --- | --- | --- |
| **0 · Confirm** | Open a Dhan account; enable TOTP; subscribe Data API; from a script hit `generateAccessToken`, `/charts/intraday`, `/marketfeed/ohlc`; log into the Dhan app mid-run to test single-session; check for a v2 socket market-status packet | The five **(verify)** items in this doc are settled | 1 day + account KYC wait |
| **1 · Raw package** | `packages/dhan` (http, auth, instruments, candles, quotes, symbols, errors, Zod types) | A script fetches Dhan daily + 1m + quotes for RELIANCE | 3–4 days |
| **2 · Adapter** | `packages/providers-dhan`; fixture tests for paise, UTC, forming-bar drop, symbol round-trip; boundary test extended | `MarketDataProvider` green | 2 days |
| **3 · Credential lifecycle** ✅ | Per-provider refresh job; Dhan TOTP mint at 01:35 IST + startup (`RenewToken` turned out not to apply — §10d); self-heal per provider | Worker keeps a Dhan token fresh unattended | done |
| **4 · Switch** ✅ | `MARKET_DATA_PROVIDER` in both roots; Fyers still default | Either provider selectable by env | done |
| **5 · Validate** ✅ (job) | Cross-diff job written and tested; Dhan daily-vs-1m self-check run live (§10f); the Fyers run is one command on the VPS; 1m backfill deliberately deferred | Bar agreement quantified; the 15:14 offset understood | done / VPS run pending |
| **6 · Router + cut-over** ✅ (router) | `createRoutedProvider`; daily bars/quotes/instruments → Dhan, intraday bars/status/stream → Fyers; each the other's fallback | Router built and tested; cut-over procedure in §10g, execution is the operator's call | done / cut-over pending |
| **7 · Socket** ✅ | `packages/dhan/src/stream.ts` speaks the documented binary format over Node's built-in `WebSocket`; reconnect machine shared with Fyers; `MARKET_DATA_ROUTE_STREAM=dhan` switches the hub | Built, tested, live-verified pre-market (§10h); default stays Fyers until a full session confirms it | done / default pending |

Total: roughly **two to three working weeks** of focused work, phases 0–6. Phase 7 only
when the multi-user fan-in needs it.

---

## 9. The licence question (applies to Fyers, Dhan, Upstox — every broker)

Fyers' API T&C §11–12: the client must not "permit the use of the APIs by any third party"
nor "publicly display … to any third party" or "build databases … with the intent of
redistribution" without written consent. Dhan's public terms do not spell this out, but
the underlying NSE/BSE data policy is the same for every broker: the feed is licensed to
*you*, for *your* trading.

**What this means in simple words:** a broker account is fine while EquityWise is used by
its operator. The moment strangers sign up and see live prices, we are redistributing
exchange data, and the right supplier is an **authorised real-time data vendor**
(TrueData, Global Datafeeds, and similar), which sells exactly that licence.

**What it means for this plan:** nothing changes technically — a vendor is a third
`MarketDataProvider` behind the same interface and the same router. But it belongs on the
roadmap **before public launch**, next to the auth work, and it is the real answer to
"how do we scale market data", ahead of any broker-vs-broker choice.

---

## 10. Risks

- **Dhan's ₹499 auto-debit fails** (low balance) → Data API stops → every Dhan route
  falls back to Fyers via the router. Alert on `dataValidity` from `GET /v2/profile`.
- **Market status has no REST source on Dhan** → keep it on Fyers; if Fyers is ever
  dropped entirely, build §5.3 option 2 or 3 first.
- **Instrument master drift** (securityId changes, new listings) → daily refresh, loud
  failure on a missing symbol, never a silent empty result.
- **Single-session** → **settled, Phase 0:** a web/app login did *not* invalidate the
  API token. The "phone login killed the feed" incident class does not exist on Dhan.
- **Node SDK is thin** → we do not depend on it; the socket binary format is documented,
  and REST needs nothing but `fetch`.
- **Two tokens to keep alive** instead of one → both go through the same
  `ensureCredential` shape and the same self-heal; one more row in `provider_credentials`.
- **Fyers' undocumented login breaks** → today that is an outage; with the router it is
  "bars and quotes already on Dhan; only market status degrades to option 3".

## 10a. Phase 0 results (2026-09-16, `pnpm dhan:probe`)

| Check | Result |
| --- | --- |
| TOTP mint (`generateAccessToken`, individual account, no API key) | ✅ Works. Token expiry is **24 h from the mint instant**, not a fixed daily cutoff — minted 23:01 IST, expires next day 23:01. The credential job must therefore mint at a fixed time (08:30 IST) and/or `RenewToken` on a schedule; "expires ~07:00" Fyers logic does not transfer. |
| Data API subscription | ✅ `dataPlan: Active`, valid till 2026-10-15 (auto-renews). Segments E, D, C, M. |
| Instrument master | ✅ `api-scrip-master.csv`, 207,017 rows; RELIANCE → `NSE_EQ` / `securityId 2885`. |
| Daily bars (`/charts/historical`, 30 d) | ✅ 21 bars, 2026-08-17 → 2026-09-15. Timestamps are **IST midnight** (`00:00+05:30`) of the trading date — the adapter must map that to our 1d bar-open convention, whatever Fyers' daily timestamps use today (check before diffing). Note the run was at 23:01 IST on the 16th and **the 16th's daily bar was not yet present** — either `toDate` is exclusive or EOD publication lags; Phase 1 must pin this down before the EOD job depends on it. |
| 1-minute bars (`/charts/intraday`, 5 d) | ⚠ Returned **1,080 bars, 2026-09-11 09:15 → 2026-09-16 15:14**. Four sessions (11, 14, 15, 16 Sep) should be ~1,500 bars, and the last session should end at 15:29, not 15:14. Something is being truncated — `toDate` semantics, a per-response cap, or same-day data lag. **Open item for Phase 1**: pull with explicit narrower windows, count bars per session, and confirm against Fyers before trusting the window logic. |
| Quotes (`/marketfeed/ohlc`, 3 ids in one call) | ✅ LTPs returned for all three as rupee floats; paise conversion clean (`1240.00 → 124000`). |
| Single-session | ✅ **Not single-session.** Logging into web.dhan.co while the worker's token was live left the token valid. |
| Prices | ✅ Floats with ≤ 2 decimals; `Math.round(x * 100)` is exact for every value seen. |

## 10b. Phase 1 results (2026-09-16, `packages/dhan` built and smoke-tested live)

**Delivered:** `packages/dhan` — `http` (two rate buckets, per-path circuit breaker,
backoff), `auth` (documented TOTP mint, `RenewToken`, `/profile`), `instruments`
(detailed scrip master → `InstrumentIndex`), `candles` (daily + intraday, chunked),
`quotes` (`/marketfeed/quote`, 1,000 per call), `symbols` (index alias table),
`errors`, Zod `types`. `RateLimiter` and `PathCircuitBreaker` were promoted from
`packages/fyers` to `@equitywise/shared` (Fyers re-exports them; nothing else moved).
The boundary test now quarantines `@equitywise/dhan`, `securityId`, `NSE_EQ`, `IDX_I`.

**Live smoke (real account, read-only):** token minted → profile Active → scrip master
parsed (2,943 NSE equities + 119 indices, 0 skipped; `BAJAJ-AUTO`, `M&M`, `NIFTY50`,
`NIFTYBANK` all resolve) → 21 daily bars → 1m bars → 4 quotes in one call, 4.4 s total.

**Facts learned that change the design (all verified live):**

| Finding | Consequence |
| --- | --- |
| **Mint throttle: "Token can be generated once every 2 minutes"** (undocumented; a third error envelope `{status:"error", message}`) | `generateAccessToken` raises `DhanRateLimitError(retryAfterMs: 120000)`, not an auth failure. The credential job must not re-mint on a hair trigger; the existing 10-minute self-heal floor is enough. |
| **`fromDate` is exclusive too**, not just `toDate` | `requestDates` pushes the end one unit past the range; the adapter must ask from one minute *before* the first wanted bar. Fixed in Phase 2 mapping. |
| **Equity 1m history ends at 15:14 IST every session** (360 bars 09:15→15:14; 15:15–15:29 absent in every request variant: datetime, date-only, next-day end, 5-min interval). Index (`NIFTY50`) bars run past close to ~18:44. | **Open item, top of Phase 5.** If Fyers has the 15:15–15:29 bars and Dhan never does, the live scanner keeps the closing window on Fyers, or builds those 1m bars from Dhan's 1/s quote poll. Not a blocker for daily bars or quotes. |
| **Today's daily bar is not published by 23:42 IST** | The EOD job cannot pull "today" from Dhan in the evening. Either run it the next morning before 08:30, or pull the day's close from `/marketfeed/quote` and let the daily bar backfill later. Decide in Phase 2. |
| **`net_change` is `0` after hours**; `ohlc.close` is the previous close | `toQuote` derives change from `ltp − ohlc.close` and uses `net_change` only as a fallback. Fixed in Phase 1 (below). |
| **429 (`DH-904`) at a ~4/s burst of chart calls**, no `Retry-After` | Default data limit lowered to 3/s (documented 5/s). Same lesson as Fyers. |
| Equity tick sizes in the master are **paise** (`1/5/10/50/100/500`), index ticks **rupees** (`0.05`) | Settled in `tickSizePaise()`; never a rupee downstream. |
| Error messages must never carry the auth URL | Query strings are redacted from every error (`redactedUrl`); regression test added. |

## 10c. Phase 2 results (2026-09-17, `packages/providers-dhan` built and smoke-tested live)

**Delivered:** `createDhanProvider(): MarketDataProvider` — `adapter` (scrip-master cache
with one-download-at-a-time, per-request token read, forming-bar rule for every
resolution incl. weekly), `mapping` (paise/UTC, daily-stamp normalisation, `aggregateMinutes`,
`aggregateWeekly`, inferred market status), `resolution` (plan: only 1m and D are fetched),
`auth` (neutral surface mirroring providers-fyers: `readRefreshConfig`, `ensureCredential`
with renew-before-mint, `checkSubscription`), `errors` (Dhan → `MarketDataProviderError`,
incl. a lapsed-subscription remedy). 33 tests on hand-computed fixtures.

**Live smoke through the adapter:** neutral mint → subscription check → 1d/1w/1m/5m/15m/30m/1h
for real symbols → quotes for equities + indices in one call → unknown symbol reported as
`missing` → no provider vocabulary in any output. 4.2 s.

**Facts learned that change the design (verified live):**

| Finding | Consequence |
| --- | --- |
| **Daily bars are stamped at IST midnight by Dhan; the database (Fyers-era) stamps them at UTC midnight of the trading date.** | `dailyBarTimestamp()` moves Dhan's onto the existing convention so the same session cannot land twice under two keys. Changing the convention is a migration, not an adapter choice. |
| **Intraday `toDate` is read at DATE granularity for past days** — `… 15:30:00` returns nothing; `next-day 00:00:00` returns nothing; only a bare next-day date works. A timed `toDate` worked on 2026-09-16 only because the 16th was the current day. `fromDate`'s time IS honoured (exclusive). | `requestDates` sends a timed start one minute early and a bare next-day end; `fetchCandles` clips back to the range. 10→17 Sep returned 1,440 = 4 sessions × 360. |
| **Dhan's 5/15/25/60-minute endpoints mishandle datetime ranges** and share the 15:14 cut-off (15m stops at 15:00). | **Not used.** The adapter fetches only 1m and D and derives 5m/15m/30m/1h on the 09:15 grid and 1w from 1d — hard rule 4 applied at the provider too. |
| **No market-status endpoint.** | `fetchMarketStatus` infers from the NSE timetable in IST and `capabilities.marketStatus` is `false`. The router (Phase 6) sends this question to Fyers. |
| Weekly bars have no native source; derived from daily. | Stamped at the Monday (UTC midnight); forming until Saturday. |

**Still open after Phase 2:** (1) the 15:14 cut-off — cross-check against Fyers in
Phase 5; (2) whether the v2 socket emits a market-status packet (Phase 7 or a throwaway ws
probe); (3) how long a `DH-904` ban lasts (the breaker assumes 60 s without `Retry-After`).

---


## 10d. Phase 3 results (2026-09-17, credential lifecycle in the worker)

**Delivered:** the worker keeps a token fresh for **every provider it holds**, not just Fyers.

| Piece | What it does |
| --- | --- |
| `apps/worker/src/credentials.ts` (new) | One `CredentialStrategy` per provider: which env vars mint, the login flow, the remedies, and whether the token needs a nightly rollover. The only file besides the composition root that names a provider package. |
| `apps/worker/src/jobs/refresh-credential.ts` | Now provider-neutral: loops over the held strategies, one `provider_credentials` row each (`providerId` = `fyers` / `dhan`, `appId` = Fyers app id / Dhan client id — no migration). Every provider is attempted even if an earlier one fails; the first failure is rethrown afterwards so the scheduler records it. |
| `apps/worker/src/context.ts` | Builds every provider whose identity is configured (`FYERS_APP_ID`, `DHAN_CLIENT_ID`), one token slot each, `setAccessToken(providerId, token)`. |
| Schedules | `refresh-credential` 07:05 IST weekdays (all providers, unchanged for Fyers) **+ `credential-rollover` 01:35 IST daily** for providers whose token lasts 24 h from its mint (Dhan). |
| Self-heal | `vwap-signals` now expires and re-mints **the provider named in the error** (`MarketDataProviderError.providerId`), at most once per 10 min per provider — above Dhan's 2-minute mint throttle. |

**Why 01:35 for Dhan.** A Dhan token lives 24 h from its mint. Minted at 07:05 it dies at 07:04 the
next day — mid pre-open. Rolling it over at 01:35 puts the one-minute gap in the middle of the
night; the 07:05 run then finds ~18 h of life and leaves it alone. Daily, not weekdays: a 24 h token
does not survive a weekend.

**Live-verified (this session, no secrets or tokens printed):**

| Check | Result |
| --- | --- |
| Empty store → mint | `via: minted`, 384 ms, expiry = mint + 24 h − 60 s |
| Same store again | `via: stored`, no network call |
| **`RenewToken` on a TOTP-minted token** | **HTTP 500 `DH-905` "Renewal of token not allowed for this token type"** — renewal is for another token type. `ensureCredential` falls through to a mint, so behaviour is correct; the renew attempt is documented as a known no-op for our tokens. |
| Second mint inside 2 minutes | `failure: rate_limit`, `retryAfterMs: 120000` — the throttle surfaces as a retryable product error, never as an auth failure |
| A correct TOTP rejected once ("Invalid TOTP") | Reproduced when minting in the same 30 s window as an earlier attempt; the next window succeeded. The worker never mints twice in a window (10-minute self-heal floor), so this is a note, not a fix. |

**Tests:** 12 new (7 refresh job, 5 composition root + strategies); worker suite 37 → all green.
Fyers behaviour is unchanged: same schedule, same store row, same remedies.

**Still open after Phase 3:** nothing blocking. The `RenewToken` finding removes the "renew at ~20 h"
idea from §8 — a daily mint at 01:35 is the whole lifecycle.

---


## 10e. Phase 4 results (2026-09-17, `MARKET_DATA_PROVIDER` switch in both roots)

**Delivered:** either provider is selectable by one env var; unset means Fyers, exactly as before.

| Piece | What it does |
| --- | --- |
| `packages/market-data/src/config.ts` (new) | `readProviderSelection(env, available, fallback)` — neutral: provider ids are opaque strings, and the roots say which ids they could build. A typo or an unconfigured provider is a startup error with a remedy. |
| `apps/web/src/server/provider.ts` | Builds Fyers or Dhan from `MARKET_DATA_PROVIDER`. Per-provider token cache (60 s), per-provider credential row (`appId` = Fyers app id / Dhan client id), per-provider limiter and breaker state held for the process lifetime. The Fyers path — including the socket transport — is unchanged. |
| `apps/worker/src/context.ts` | Same switch (landed in Phase 3): every configured provider is built and refreshed; the selected one is `context.provider`. |
| `.env.example` | `MARKET_DATA_PROVIDER` documented at the top of the market-data section; the web host's variable list now names `DHAN_CLIENT_ID` (identity only — never the PIN or TOTP seed). |

**How to switch (both processes):** set `MARKET_DATA_PROVIDER=dhan`, restart the worker and the web
app. Nothing else changes; `MARKET_DATA_PROVIDER=fyers` (or unset) switches back. Rows written while
on Dhan are tagged `provider_id = 'dhan'`, so history from either source stays attributable.

**What a Dhan-only deployment loses today** (until Phase 6 routes around it): the live tick socket
(`capabilities.streaming: false` → the watchlist polls every 3 s and shows "Updating every few
seconds") and authoritative market status (inferred from the clock; no holiday awareness). That is
why the recommended production shape is the **router**, not the switch.

**Tests:** 5 new (web composition root: default, switch, cache reuse, wrong-principal row, refused
selection). Boundary test still green: only the two roots and the adapters name a provider.

---


## 10f. Phase 5 results (2026-09-17, validation)

**Delivered:** `apps/worker/src/jobs/cross-check-bars.ts` — a provider-neutral bar cross-check.
`compareBars` (pure: same-stamped bars compared field by field, price deltas in paise, volume
separately, timestamps only one side has), `crossCheckBars(a, b, …)` (any two providers), and the
job shape `crossCheckProviders` — Fyers vs Dhan for NIFTY 50 + a sample of its constituents, 60 days
of 1d and 5 sessions of 1m, ending at the last **closed** session so neither side is asked for a
forming bar. Writes nothing. 9 tests.

**Run it on the VPS** (the only host holding a live Fyers token — a Fyers login from anywhere
else kills the worker's session):

```
cd /path/to/checkout && node apps/worker/dist/index.js --once cross-check-bars
# or, in development:  pnpm --filter @equitywise/worker dev -- --once cross-check-bars
```

Each symbol logs `compared / mismatched / maxPriceDeltaPaise / only_fyers / only_dhan` plus a
sample of the first five disagreements; the run ends with a totals line and a verdict.

**Not run against Fyers in this session** — no Fyers token was available here, and minting one
would have invalidated production's (single-session). What *was* run live, because it needs only
Dhan: **Dhan's daily bar against its own 1-minute bars, per session**, for RELIANCE, TCS and
NIFTY 50 over 10–16 Sep:

| | RELIANCE / TCS (equity) | NIFTY 50 (index) |
| --- | --- | --- |
| 1m bars per session | **360, last at 15:14** | 375, last at 15:29 |
| open / high | match the daily bar | match |
| low | matches on 2 of 4 sessions; **daily low is lower on the others** (Δ up to ₹9.10) | match |
| close | **never matches** the 15:14 close (Δ −₹5.30 … +₹11.20) | matches exactly |
| Σ 1m volume ÷ daily volume | **88–95 %** | n/a (index) |

So the 15:14 cut-off is real for equities, not a relabelling: the closing 15 minutes and the
closing auction are absent from Dhan's 1m history. Daily bars are complete. Index minutes are
complete. (14 Sep absent on both resolutions — Ganesh Chaturthi, an NSE holiday.)

**Consequence for Phase 6 (applied):** the router's default sends **daily/weekly bars to Dhan**
and **intraday bars to Fyers**. Dhan intraday remains one env var away (`MARKET_DATA_ROUTE_INTRADAY_BARS=dhan`)
once a live-session check shows whether the 15:15–15:29 minutes arrive during the session and
only vanish from history, or never arrive at all.

**Also observed:** one `HTTP 429 DH-904` on the *first* data call after a run of auth calls
(mint attempts, `RenewToken` probes); cleared after the breaker's 60 s. Auth traffic appears to
share the data budget — another reason the worker never mints in a loop.

**Deliberately not done — "backfill 1m to 5 years":** the current tree stores minute bars only in
`signal_minutes` (the VWAP scanner's rolling window for the NIFTY 50); the old `minute_candles`
hypertable and its ingest job were removed with the intraday engine (CLAUDE.md "Current scope").
A five-year 1m store is ~22 M rows for the NIFTY 50 alone (50 × ~1,250 sessions × 360) and needs
its own schema, compression policy and multi-day pull plan — a feature, not a validation step.
It should be planned when a consumer for that history exists.

---


## 10g. Phase 6 results (2026-09-17, router + cut-over ready)

**Delivered:** `createRoutedProvider` in `packages/market-data` and both roots able to build it.

| Piece | What it does |
| --- | --- |
| `packages/market-data/src/routed.ts` (new) | A `MarketDataProvider` assembled from others, one per question: `bars` (1d/1w), `intradayBars` (1m–1h), `quotes`, `instruments`, `status`, `stream`. Provider-neutral — holds providers by opaque id. On an `auth` / `rate_limit` / `upstream` / `unknown` / `not_configured` failure the other provider is asked; `not_found` and `unsupported` are answers and propagate. When both fail the **primary's** error propagates, so the self-heal targets the right token. Streaming delegates to the stream provider (a subscription cannot fall back mid-stream) and is absent when that provider has no socket. Capabilities are composed per route (`marketStatus` from the status provider, `historyStart` from the daily provider, …). `onRouteEvent` is the observability hook; both roots log it. |
| `packages/market-data/src/config.ts` | `readRoutingConfig(env, available)` — `MARKET_DATA_ROUTE_BARS / _INTRADAY_BARS / _QUOTES / _INSTRUMENTS / _STATUS / _STREAM`, `MARKET_DATA_FALLBACK=0`; `DEFAULT_ROUTES` = the §5 split amended by §10f (intraday bars stay on Fyers). |
| `apps/worker/src/context.ts` | `MARKET_DATA_PROVIDER=routed` (selectable only when both providers are built). `providerIdFor(route)` tags ingested rows with their **true** source — daily candles `dhan`, signal minutes `fyers` — never `routed`. |
| `apps/web/src/server/provider.ts` | Same; the router is rebuilt when **either** credential rotates (the live hub detects a new token by provider identity). One socket reconnect a day at 01:35 IST is the cost. `describeDataSources()` feeds the operator view. |
| `/data-sources` | Names both providers and shows the live "which source answers what" table. |
| `docs/operations/deployment.md` §5 | New "Dhan — the second provider" sub-section: selection, credential lifecycle, throttle, rate limits, the ₹499 subscription and what its lapse looks like, the 15:14 gap, force-refresh and cross-check commands. |
| `.env.example`, `CLAUDE.md` | Routing variables documented; the production-hosting note names Dhan. |

**Cut-over procedure (not yet executed — a production change is the operator's call):**

1. On the VPS, add to the worker's env: `DHAN_CLIENT_ID`, `DHAN_PIN`, `DHAN_TOTP_SECRET`; to the web app's env: `DHAN_CLIENT_ID` only.
2. Restart the worker with `MARKET_DATA_PROVIDER` still unset (Fyers). It now also mints a Dhan token (log line `credential minted` under `refresh-credential.dhan`). Confirm the `dhan` row in `provider_credentials`.
3. `node apps/worker/dist/index.js --once cross-check-bars` — read the daily totals. Expect `mismatched: 0` on 1d for the sample; intraday differences at 15:15–15:29 are the known gap and are why intraday stays on Fyers.
4. Set `MARKET_DATA_PROVIDER=routed` in both envs; restart both. `/data-sources` shows the table; `pm2 logs` shows `route fell back …` lines only when something is wrong.
5. Rollback is `MARKET_DATA_PROVIDER=fyers` (or unset) and a restart. Any single route can be moved back with its `MARKET_DATA_ROUTE_*` variable.

**Tests:** 11 router/config tests; +2 worker context, +2 web root. Boundary test green.

**Still open after Phase 6:** (1) run the cross-check on the VPS and paste the totals here;
(2) during a live session, check whether Dhan's 15:15–15:29 equity minutes arrive in real time
and only vanish from history — if they arrive, `MARKET_DATA_ROUTE_INTRADAY_BARS=dhan` becomes
viable for the scanner (which reads live) though not for backfills; (3) Phase 7 (socket) only
when the 200-symbol Fyers cap binds.

---


## 10h. Phase 7 results (2026-09-17, live socket)

**Delivered:** the Dhan live feed as a `TickTransport`, end to end through the product interface.

| Piece | What it does |
| --- | --- |
| `packages/shared/src/stream.ts` (new) | `createReconnectingStream` — the reconnect-with-backoff / full-resubscribe / heartbeat-watchdog machine lifted out of `packages/fyers/src/stream.ts`, generic over the decode step and the symbol cap. Fyers' module is now a thin wrapper; **its 15 existing tests pass unchanged**, which is the proof of the extraction. |
| `packages/dhan/src/stream.ts` (new) | The documented binary protocol, verified against dhanhq.co/docs/v2 this session: little-endian 8-byte header (code, length, segment, security id), ticker (2) / quote (4) / previous-close (6) / disconnect (50) packets, JSON subscribe/unsubscribe (15/16 ticker, 17/18 quote) chunked to 100 per message, 5,000 per connection, disconnect reasons 805–810. `DhanFeedTransport` speaks it over Node's built-in `WebSocket` — **no SDK, no new dependency**. Never throws on an unknown packet or a short frame. |
| `packages/providers-dhan` | `createDhanProvider({ stream: { mode } })` adds `streamTicks`; `capabilities.streaming: true`, `maxStreamSymbols: 5000`. Symbols are resolved to security ids through the (async) scrip master while the subscription is returned synchronously in `connecting`; symbols added meanwhile are applied when the socket opens; unknown symbols are skipped (the hub polls them). Feed disconnect reasons map to product failures (806 → subscription, 807–810 → `auth`, 805 → `rate_limit`). |
| `apps/web/src/server/provider.ts` | Dhan is built with the socket on; `DHAN_STREAM=0` is the kill switch. The router's `stream` route may now be `dhan`. **Default stays `fyers`** — the Fyers socket is proven in production and §5 said to move only when the 200-symbol cap binds. |

**Live-verified (this session):**

| Check | Result |
| --- | --- |
| Raw feed, ticker mode | 45 ticker + 2 previous-close packets in 6 s (RELIANCE, NIFTY 50), decoded to the paise |
| Raw feed, quote mode | 39 quote packets in 6 s, day OHLC/volume decoded |
| **Trade-time epoch** | **IST wall-clock seconds, not UTC** — RELIANCE's last trade decoded to 15:58:24 IST (the post-close session) only after subtracting 5 h 30 m; an index's stamp equalled the current IST time. Corrected in the decoder, same convention as the REST `last_trade_time`. |
| Through the adapter | `connecting → live` in 3.4 s (includes the 35 MB scrip master), ticks under OUR symbols, unknown symbol skipped, unsubscribe and stop clean |
| Our own disconnect | The server raises a socket error on a client-initiated close; suppressed after `close()` so a clean stop is not logged as a failure |

**Tests:** 12 (`packages/dhan` stream: codec on hand-built frames, transport over a fake socket, end
to end), +4 adapter, +2 web root. Fyers stream tests unchanged.

**What this unlocks:** the watchlist's live prices for **up to 5,000 distinct symbols per web
process** instead of 200, without REST polling for the overflow. Enable with
`MARKET_DATA_ROUTE_STREAM=dhan` under the router when that cap actually binds.

**Still open:** run it through a full live session before making it the default — the socket was
verified pre-market (index ticking, equities a single snapshot); tick rate under load and the
server-side ping/pong at 40 s idle are the two things a session will show that a probe cannot.

---

---

## 11. Sources (verified 2026-09-16)

- Dhan Data API subscription (₹499 + taxes / 30 days, auto-renewal):
  https://dhan.co/support/platforms/dhanhq-api/how-does-the-dhanhq-data-api-subscription-work/
- 25-trades waiver **discontinued** (Dhan support):
  https://dhan.co/support/platforms/dhanhq-api/is-the-dhanhq-data-api-subscription-free-if-i-execute-a-minimum-number-of-trades-every-month/
  (chittorgarh.com and other blogs still describe the old promotion — ignore them)
- Authentication (24 h token, TOTP `generateAccessToken`, `RenewToken`, API-key consent
  flow, static IP only for orders): https://dhanhq.co/docs/v2/authentication/
- Rate limits (Order 10/s; Data 5/s, 100k/day; Quote 1/s; Non-trading 20/s):
  https://dhanhq.co/docs/v2/ and
  https://dhan.co/support/platforms/dhanhq-api/what-are-the-api-rate-limits-for-dhan/
- Historical data (daily since inception; intraday 1/5/15/25/60 min; 90-day window):
  https://dhanhq.co/docs/v2/historical-data/ and
  https://dhan.co/support/platforms/dhanhq-api/what-timeframe-data-is-available-through-dhan-s-historical-data-apis/
- Market quote (1,000 instruments per call, 1/s): https://dhanhq.co/docs/v2/market-quote/
- Live market feed (5 connections × 5,000 instruments; binary little-endian; ping 10 s):
  https://dhanhq.co/docs/v2/live-market-feed/
- Instrument master CSVs: https://dhanhq.co/docs/v2/instruments/
- Auth change effective 1 Oct 2025 (24 h tokens, TOTP):
  https://github.com/marketcalls/openalgo/issues/488
- Node SDK: https://github.com/dhan-oss/DhanHQ-js
- Socket reliability report (June 2026):
  https://madefortrade.in/t/urgent-websocket-connection-issue-20-depth-market-data-api/91282
- Fyers data API is free: https://support.fyers.in/portal/en/kb/articles/do-i-need-to-pay-for-datafeeds
- Fyers API T&C (§11 third-party use, §12 redistribution/public display):
  https://fyers.in/terms-and-conditions-api
- Authorised NSE/BSE data vendors: https://www.truedata.in/ · https://globaldatafeeds.in/authorised-data-vendors/
- In-repo: `packages/market-data/src/provider.ts` (the contract),
  `packages/providers-fyers/src/adapter.ts` (the pattern), `packages/fyers/src/{auth,rate-limit,candles,quotes,stream}.ts`
  (Fyers limits as coded), `apps/web/src/server/{provider,live-quotes}.ts`,
  `apps/worker/src/{context.ts,jobs/refresh-credential.ts}`, `docs/operations/deployment.md` §5.
