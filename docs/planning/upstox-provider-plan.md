# Adding Upstox as a market-data provider

**Status:** plan / not yet implemented
**Author:** drafted 2026-09-04
**Scope:** add an Upstox implementation of `MarketDataProvider` *alongside* Fyers,
selectable by config. Fyers stays in the tree, fully working, so we can switch
back at any time without a code change.

> This is a design/planning document. No code changes are made by adopting it.
> It is grounded in the current repo (`packages/market-data`, `packages/fyers`,
> `packages/providers-fyers`, `apps/web/src/server/provider.ts`,
> `apps/worker/src/context.ts`) and in the provider-comparison verdict
> ("India Market-Data Provider Verdict", verified 01·Sep·2026). That verdict
> recommended Dhan as the standby; this document is the concrete plan for the
> provider you actually chose — **Upstox** — and does not re-argue the choice.

---

## 0. TL;DR

- **Nothing about Fyers is removed.** `packages/fyers` and
  `packages/providers-fyers` stay exactly as they are. Upstox is a *second*
  implementation behind the same `MarketDataProvider` interface.
- **Two new packages**, mirroring the Fyers layout one-for-one:
  - `packages/upstox` — raw Upstox knowledge (HTTP, OAuth, candles, quotes,
    instruments, websocket, symbol/resolution codes). The *only* place an
    Upstox type or `instrument_key` may appear.
  - `packages/providers-upstox` — the adapter that turns all of that into the
    product's neutral types (`Bar`, `Quote`, `Instrument`, `MarketStatus`,
    `Tick`), in **integer paise** and **UTC**, closed-candle by default.
- **Two composition roots change, and nothing else:**
  [`apps/web/src/server/provider.ts`](../apps/web/src/server/provider.ts) and
  [`apps/worker/src/context.ts`](../apps/worker/src/context.ts) learn to build
  *either* provider based on a `MARKET_DATA_PROVIDER` env var. The engine, the
  worker jobs, the web routes, the backtester — none of them change.
- **The one genuinely different piece is auth.** Upstox is *not* single-session
  like Fyers (a manual trading login does not kill the API token), but its token
  is a plain OAuth access token that expires daily and, in the standard flow,
  **cannot be minted headlessly** the way the Fyers TOTP auto-login mints one.
  The unattended daily self-heal that Fyers enjoys does **not** transfer for
  free. §5 is about exactly this and is the part that needs a decision.
- **The other genuinely different piece is the symbol model.** Upstox addresses
  instruments by an **ISIN-based `instrument_key`** (`NSE_EQ|INE002A01018`), not
  a ticker string. The adapter must resolve our symbol (`RELIANCE`) → key via the
  instrument master. §4.2.

---

## 1. Why this shape (and what the hard rules force)

The product is broker-independent by constitution: business logic consumes a
normalised `MarketDataProvider` and never a broker type (CLAUDE.md). That seam
already exists and is enforced by `packages/market-data/src/__tests__/boundary.test.ts`.
Adding Upstox is therefore *using* the seam, not building a new one.

Every hard rule that touches data applies identically to the new adapter:

| Rule | What the Upstox adapter must do |
| --- | --- |
| **#3 integer paise** | Upstox returns prices as rupee floats (`2734.50`). The adapter multiplies to paise (`273450`) with integer-safe rounding. A rupee float must never leave `packages/providers-upstox`. |
| **#2 closed candles** | `fetchBars` returns ascending, deduplicated, **closed** bars by default. The last, possibly-forming intraday bar is dropped exactly as the Fyers adapter does in `dropFormingBar`. |
| **#6 UTC** | Upstox candle timestamps are ISO strings with a `+05:30` offset. The adapter converts to a UTC epoch-ms `Bar.timestamp` (bar-open instant). No naive datetime, ever. |
| **provider boundary** | No `instrument_key`, no `NSE_EQ|…`, no Upstox interval code, no Upstox error class escapes the adapter. Failures throw `MarketDataProviderError`. |
| **#4 store 1m/1d only** | Unchanged — the worker still persists only 1m and 1d; 3m/5m/15m derive in pure code aligned to 09:15 IST. The provider only needs to *serve* 1m and 1d cleanly. |

The neutral contract the adapter implements is
[`MarketDataProvider`](../packages/market-data/src/provider.ts):

```ts
interface MarketDataProvider {
  readonly id: string;                 // 'upstox'
  readonly displayName: string;        // 'Upstox' (operator text only, never product branding)
  readonly capabilities: ProviderCapabilities;
  listInstruments(): Promise<readonly Instrument[]>;
  fetchQuotes(refs): Promise<QuotesResult>;
  fetchBars(request: BarsRequest): Promise<readonly Bar[]>;   // closed-only by default
  fetchMarketStatus(): Promise<MarketStatus>;
  streamTicks?(request): TickSubscription;                    // only if capabilities.streaming
}
```

---

## 2. What Upstox actually provides — the clear picture

> Verify every figure against live docs before implementation; the Upstox API
> has changed intervals, auth, and rate limits more than once. Sources are
> listed in §11. Items I could not confirm from first-party docs at drafting
> time are marked **(confirm)**.

### 2.1 Coverage vs. what the engine consumes

| Dataset the engine uses | Upstox | Notes |
| --- | --- | --- |
| **Daily OHLCV (1d)** | ✅ Yes | Deepest daily history of any broker — **from ~2000**. Excellent for long-horizon daily screening and warm-up. |
| **Intraday 1-minute** | ✅ Yes | **1m from Jan 2022** via the historical-candle API. Enough to make the intraday backtest more than an anecdote, but shallower than Kite (2015) or Dhan (5 yrs). |
| **Live 1m loop (closed bars)** | ✅ Yes | The worker's every-few-minutes pull of closed 1m candles is comfortably within limits. |
| **Snapshot quotes (LTP/OHLC)** | ✅ Yes | REST quote endpoints (LTP / OHLC / full). |
| **Market/holiday status** | ✅ Yes | Market-status + holiday endpoints; authoritative session state. |
| **Corporate actions (split/bonus/div)** | ◐ Limited | Like every broker: no clean, reliable CA API. Adjustment factors still come from a separate reconciliation job against NSE/BSE CA data (unchanged from today's plan). |
| **Live tick-by-tick** | ◐ Snapshot | WebSocket streams consolidated snapshots (~per-second), **not** true TBT. The engine does not consume ticks (rule #2), so this is colour, not a dependency. Note: this is a *downgrade* from Fyers' genuine TBT feed — irrelevant to the closed-candle engine, relevant only if a future feature ever wanted true ticks. |
| **Historical tick** | ○ No | Not available (true of all brokers). Not on our critical path. |
| **Options / F&O / greeks** | ✅ Yes | Available; **not used** by this equities engine. |
| **IPO / GMP** | ○ No | Not via broker API — stays a separate, optional source, never a feed-selection driver. |

### 2.2 History depth & windowing

| Axis | Upstox | Implication for us |
| --- | --- | --- |
| Daily depth | ~2000 → today | Best-in-class for daily screening/backfill. |
| 1-minute depth | Jan 2022 → today | ~3.5+ years of 1m at drafting time. Fine for the intraday backtest; deeper than "eight sessions", shallower than Kite. |
| Per-request window | Windowed by interval; the API is called in date chunks **(confirm exact window per interval)** | Backfill must be **windowed and resumable** — we already have `backfill:minutes`, which paginates; the Upstox adapter just needs to honour its per-interval window size. |
| Intervals | v3 historical-candle supports minute/day/week/month, and custom minute multiples on v3 **(confirm the exact set and any unit/multiple syntax)** | Our `Resolution` set (`1m/5m/15m/30m/1h/1d/1w`) maps onto these; anything not natively served we already derive from 1m in pure code. |

### 2.3 Auth model (the important one)

- **OAuth 2.0 authorization-code flow.** Operator logs in, we exchange a
  one-time code for an **access token**.
- **Token lifetime:** a single day — Upstox access tokens **expire at a fixed
  daily cutoff (~03:30 IST)** rather than N-hours-from-issue. **(confirm exact
  cutoff and whether a refresh token / extended token is offered on the current
  API version)** — this materially changes §5.
- **Not single-session.** Unlike Fyers, using the Upstox trading app/website does
  **not** invalidate the API token. This removes the single biggest operational
  pain we have today (the Fyers "manual login killed the feed" self-heal exists
  precisely for that). It does **not** remove the daily-expiry problem.
- **Headless minting:** the standard OAuth flow needs an interactive login +
  the account's 2FA. There is **no documented TOTP-seed auto-login equivalent**
  to what `refreshCredential` does for Fyers. This is the crux of §5.

### 2.4 Rate limits

Published as tiered per-interval limits (per-second / per-minute / per-30-min),
tightened under SEBI's 2025 algo framework. **(confirm current numbers.)** They
are comfortably sufficient for:
- a scanner reading closed candles on a few-minute cadence, and
- a **paced, windowed** historical backfill.

The adapter reuses the same shape of protection the Fyers client has — a
per-account `RateLimiter` and a `PathCircuitBreaker` — so a backfill cannot trip
a ban. (These live *inside* the provider and must outlive credential rotation;
see the note in `apps/web/src/server/provider.ts`.)

### 2.5 Symbol / instrument model

- Upstox addresses instruments by an **`instrument_key`** of the form
  `NSE_EQ|INE002A01018` — segment plus **ISIN**, not a ticker.
- Upstox publishes a **complete instrument master** (a gzipped JSON/CSV dump,
  refreshed daily) mapping ISIN ⇄ trading symbol ⇄ instrument_key ⇄ exchange
  token, with lot size, tick size, etc.
- **Consequence for the adapter:** our internal symbol is a plain ticker
  (`RELIANCE`). The adapter must resolve `RELIANCE` → `instrument_key` using the
  instrument master, and back again for responses. This is more involved than
  Fyers' string-templated `NSE:RELIANCE-EQ`, and it is where most of the
  adapter's real work is. See §4.2.

### 2.6 Cost

**₹0** in market-data and API cost. Requires a free Upstox demat/trading
account (₹0 AMC tier available). Broker data licence is personal, in-India,
non-public use — perfectly fine for this single-user tool, and the same licence
wall as every broker if the monetisation roadmap ever activates.

### 2.7 Node/TypeScript reality

Upstox ships an **official Python SDK**; for Node there is no first-class SDK, so
we talk **REST + WebSocket directly**. That is exactly what `packages/fyers`
already does (a hand-written HTTP client, its own socket transport), so this is
the pattern we already follow — not new ground. The WebSocket market feed is
**protobuf-encoded (v3)**, so the streaming path (if we build it) needs a
protobuf decode step; the REST candle/quote path does not.

---

## 3. What changes, precisely (and what does not)

**Changes (small, contained):**

1. `packages/upstox` — new package (raw Upstox).
2. `packages/providers-upstox` — new package (adapter + neutral auth surface).
3. `apps/web/src/server/provider.ts` — build Fyers *or* Upstox from config.
4. `apps/worker/src/context.ts` — same, plus the credential-lifecycle wiring.
5. `apps/web` auth routes (`/login`, `/callback`) — drive whichever provider's
   OAuth flow is active, still via the neutral auth surface (they already avoid
   importing `@equitywise/fyers` directly — see `providers-fyers/src/auth.ts`).
6. `config/*` + `.env(.example)` — new `MARKET_DATA_PROVIDER` switch and
   `UPSTOX_*` variables.
7. DB `provider_credentials` — already keyed by provider id; store Upstox's token
   under `upstox`. No schema change expected **(confirm the table already keys on
   provider id and needs no new column)**.

**Does NOT change:**

- `packages/core` (the whole signal + intraday engine) — untouched.
- `packages/market-data` — the contract already fits; no new methods.
- Any worker job (`minute_candles` loop, paper-trades, backfill, etc.).
- `apps/web` `/signals`, `/api/intraday-signals`, screener, charts.
- The backtester, `replay:session`, `verify:intraday`.
- Every hard rule and the boundary test.

This is the payoff of the existing abstraction: a provider swap is two new
packages and two composition-root edits.

---

## 4. Package design

### 4.1 `packages/upstox` (raw — mirrors `packages/fyers`)

Same file breakdown as Fyers, so a maintainer who knows one knows the other:

| File | Responsibility |
| --- | --- |
| `http.ts` | `UpstoxHttpClient` — fetch wrapper with the shared `RateLimiter` + `PathCircuitBreaker`, backoff, timeout, and Upstox error mapping. Reuse the existing `RateLimiter`/`PathCircuitBreaker` (they are generic; consider promoting them to a shared package if we don't want a Fyers import). |
| `auth.ts` | OAuth URL builder, code→token exchange, token-usability check, expiry model (daily cutoff). |
| `instruments.ts` | Download + parse the instrument master (gzipped JSON/CSV); build the ISIN/symbol ⇄ `instrument_key` indexes. |
| `candles.ts` | Historical-candle v3 calls, windowed by interval; returns raw candles. |
| `quotes.ts` | LTP/OHLC/full quote calls, batched. |
| `stream.ts` | Market-feed v3 WebSocket transport + **protobuf decode** (only if we build streaming). |
| `symbols.ts` | `instrument_key` encode/decode helpers, segment constants. |
| `resolution.ts` | Our `Resolution` → Upstox interval code. |
| `errors.ts` | Upstox error → typed internal error. |
| `types.ts` | Zod schemas for every Upstox response (rule: Zod at every boundary). |
| `index.ts` | Barrel. |

### 4.2 Symbol resolution — the real work

Fyers lets the adapter template a string (`toFyersSymbol('RELIANCE','equity') → 'NSE:RELIANCE-EQ'`).
Upstox cannot: the key embeds the **ISIN**, which only the instrument master
knows. So:

- On first use (and cached, refreshed daily like the master itself), build:
  - `symbol → instrument_key` (for requests), and
  - `instrument_key → symbol` (for responses / socket frames).
- `Instrument.providerRef` stores the `instrument_key` (opaque to the product,
  never rendered — the `types.ts` contract already reserves this field).
- `InstrumentRef.kind` (`equity` | `index`) selects the segment
  (`NSE_EQ` vs `NSE_INDEX`), exactly as `encode()` uses `kind` in the Fyers
  adapter.

This mapping cache is the Upstox adapter's one piece of state that Fyers does
not have. Keep it in `packages/upstox/instruments.ts`, injected into the
adapter, so the adapter stays a thin normalisation layer.

### 4.3 `packages/providers-upstox` (adapter — mirrors `packages/providers-fyers`)

- `adapter.ts` — `createUpstoxProvider(options): MarketDataProvider`. Same shape
  as `createFyersProvider`: reads the token per request via a getter (so daily
  rotation takes effect without rebuilding the provider, preserving the shared
  limiter/breaker), maps refs → keys, normalises every response, drops the
  forming bar, throws `MarketDataProviderError`.
- `mapping.ts` — `toBar` / `toQuote` / `toInstrument` / `toMarketStatus` /
  `toTick`, all doing the **rupee→paise** and **IST→UTC** conversions and
  null-for-missing.
- `resolution.ts` — `SUPPORTED_RESOLUTIONS` + `toUpstoxResolution`.
- `auth.ts` — neutral auth surface (OAuth URL, complete-authorization,
  credential store interface), matching `providers-fyers/src/auth.ts` so the web
  routes don't change shape. **Minus** an unattended `refreshCredential` unless
  §5 gives us a headless path.
- `errors.ts` — `PROVIDER_ID = 'upstox'`, `toProviderError`.
- `__tests__/` — adapter + auth tests; **indicator-grade fixture tests are not
  needed** (indicators live in core), but bar/quote normalisation, paise
  rounding, UTC conversion, and forming-bar dropping must be tested against
  hand-computed fixtures.

### 4.4 Capabilities

```ts
const capabilities: ProviderCapabilities = {
  streaming: /* only if we build stream.ts */,
  intradayHistory: true,
  resolutions: SUPPORTED_RESOLUTIONS,           // 1m…1w we can serve/derive
  historyStart: /* daily ~2000; but 1m only Jan 2022 — see note */,
  maxStreamSymbols: /* confirm Upstox per-connection ceiling */,
  marketStatus: true,
};
```

> **`historyStart` caveat:** the field is a single instant, but Upstox's real
> horizon differs by resolution (daily ~2000, 1m only 2022). Set `historyStart`
> to the **daily** epoch and have the backfill job clamp 1m requests to Jan 2022
> so we never ask for 1m data that cannot exist and misread the empty response
> as a gap. Document this asymmetry where the capability is read.

---

## 5. Credentials & the daily-token problem (decision needed)

This is the only part that is genuinely harder than Fyers, and it deserves an
explicit choice before coding.

**Today (Fyers):** the worker holds account-level minting secrets
(`FYERS_ID` + `FYERS_TOTP_SECRET` + `FYERS_PIN`) and `refreshCredential`
performs an **unattended TOTP auto-login** every morning, writing a fresh token
into `provider_credentials`. The web app only ever *reads* that token. This is
what makes the feed self-healing (see `docs/operations/deployment.md` §5 and
`providers-fyers/src/auth.ts`).

**Upstox:** the standard OAuth flow needs an **interactive** login and 2FA to
mint the daily token. There is no documented TOTP-seed headless mint. So the
morning self-heal does not come for free. Options, best-to-worst for an
unattended VPS:

1. **Refresh/extended token (if Upstox offers one on the current API version).**
   If a long-lived refresh token or an "extended token" exists, the worker uses
   it to mint the daily access token headlessly — a near drop-in for the Fyers
   self-heal. **This is the preferred path; confirm availability first (§2.3).**
2. **Semi-automated daily login.** A scripted OAuth run that replays the login
   form + TOTP against Upstox's auth pages (the same shape as the Fyers auto-login,
   but scraping the web flow rather than a documented endpoint). Works, but is
   **brittle** — it breaks whenever Upstox changes its login page — and it means
   the VPS holds the full account 2FA seed. Acceptable for a single-user tool if
   #1 is unavailable, but flag it as fragile.
3. **Manual daily authorization.** Operator opens `/login` once each morning
   before the market opens; the callback stores the token; the worker reads it
   all day. Simplest and most robust, but it is a **manual daily chore** and the
   feed is dark until it's done — the exact ergonomic regression the Fyers
   self-heal was built to avoid.

**Recommendation:** target **#1**, fall back to **#3** for the first cut (it is
safe and simple and proves the whole pipeline), and only build **#2** if #1
turns out not to exist and the daily manual step proves too painful. Whatever we
pick, keep it behind the neutral `CredentialStore` + auth surface so the worker's
credential job (`apps/worker`) treats "which provider" as config.

**Storage:** reuse the existing `provider_credentials` table, keyed by provider
id (`upstox`). The web composition root already reads the token from the DB per
`CREDENTIAL_TTL_MS` with an env fallback — the Upstox path slots into the same
`getProviderCredential(providerId)` read. **(confirm the table keys on provider
id and needs no migration.)**

---

## 6. Composition-root wiring

A single switch decides the active provider. Neither root learns anything about
the *other* provider's internals.

`apps/worker/src/context.ts` (sketch — not final code):

```ts
const providerName = process.env.MARKET_DATA_PROVIDER ?? 'fyers';

const provider =
  providerName === 'upstox'
    ? createUpstoxProvider({
        accessToken: () => accessToken,   // read per request; daily rotation is transparent
        attempts: 5,
        timeoutMs: 30_000,
      })
    : createFyersProvider({
        appId: process.env.FYERS_APP_ID ?? '',
        accessToken: () => accessToken,
        attempts: 5,
        timeoutMs: 30_000,
      });
```

`apps/web/src/server/provider.ts` gets the mirror-image switch, keeping its
shared `RateLimiter` / `PathCircuitBreaker` (per-account, must outlive
rotation) and its DB-first credential read. The credential job in the worker
selects its refresh strategy from the same `MARKET_DATA_PROVIDER` value.

**Because the switch is one env var, switching *back* to Fyers is flipping
`MARKET_DATA_PROVIDER=fyers` and restarting — no code change, no redeploy of a
different build.** That is the "keep Fyers so we can come back" guarantee, made
operational.

---

## 7. Testing & verification

- **Boundary test** (`packages/market-data/.../boundary.test.ts`) must still
  pass, and should be extended to assert `apps/*`, `packages/core`, and DTOs do
  not import `@equitywise/upstox` (the same rule that quarantines Fyers).
- **Adapter fixtures:** hand-computed cases for paise rounding, IST→UTC bar
  timestamps, null-for-missing, forming-bar dropping, and symbol⇄`instrument_key`
  round-tripping.
- **Zod at the seam:** every Upstox response parsed by a schema; a shape change
  fails loudly at the adapter, not three layers up.
- **Cross-validation (high value):** with both providers in the tree, run a job
  that pulls the same day of 1m bars from Fyers and Upstox and **diffs** them.
  This quantifies bar agreement and is the cheapest possible confidence check
  before trusting Upstox as primary. (This is also the mechanism the verdict's
  §19 "Validate" phase describes.)
- **`verify:intraday` / `replay:session`:** re-run against Upstox-sourced candles
  to confirm the engine produces identical structure — it must, since it never
  sees the provider.

---

## 8. Phased implementation

| Phase | Work | Outcome |
| --- | --- | --- |
| **0 · Confirm** | Verify §2 against live Upstox docs — especially the **refresh/extended token** question (§5) and per-interval **history windows** and **rate limits**. | The two unknowns that shape the design are settled. |
| **1 · Raw package** | `packages/upstox`: http, auth, instruments (master parse + key indexes), candles, quotes, symbols, resolution, errors, types. Zod-validated. | Can fetch Upstox candles/quotes in a script. |
| **2 · Adapter** | `packages/providers-upstox`: `createUpstoxProvider`, mapping (paise/UTC), resolution, neutral auth surface, tests. | `MarketDataProvider` fully implemented; boundary test green. |
| **3 · Wire config** | `MARKET_DATA_PROVIDER` switch in both composition roots; `.env.example` + `config` docs; store token in `provider_credentials` under `upstox`. | Provider selectable by env; Fyers still default. |
| **4 · Credential lifecycle** | Implement the §5 path (refresh-token self-heal if available, else manual `/login`). | Worker keeps the Upstox token fresh (or the operator does), same store. |
| **5 · Validate** | Cross-diff Fyers vs Upstox 1m for N sessions; backfill 1m from Jan 2022; re-run `replay:session` / `verify:intraday`. | Quantified bar agreement; deeper 1m history; engine parity proven. |
| **6 · Cut over (reversible)** | Set `MARKET_DATA_PROVIDER=upstox` in production. Fyers stays in the tree as the instant fallback. | Live on Upstox; one env flip restores Fyers. |
| **7 · Streaming (optional)** | Build `stream.ts` (protobuf WS) only if a feature needs live ticks; the engine does not. | Live quotes on `/signals` etc., if wanted. |

---

## 9. Risks & things to watch

- **Daily-token headless minting (§5)** is the make-or-break ergonomic question.
  If Upstox has no refresh/extended token, unattended self-heal is either brittle
  (scraped login) or a manual daily chore. Settle this in Phase 0.
- **1m history only from 2022** — shallower than Kite/Dhan. Fine for the intraday
  backtest, but set `historyStart` honestly and clamp 1m requests (§4.4) so an
  empty pre-2022 response is never misread as a data gap.
- **ISIN-based symbol model** adds an instrument-master dependency the Fyers path
  doesn't have. A stale/failed master download breaks *all* symbol resolution —
  cache it, refresh daily, and fail loudly (not silently to empty results).
- **Protobuf websocket** is real integration work; keep streaming in its own
  phase and out of the critical path (the engine reads closed candles).
- **No true TBT** (snapshot-only stream) — a downgrade from Fyers, but invisible
  to the closed-candle engine. Note it so a future tick-dependent feature isn't
  designed assuming it's there.
- **Rate limits tightened under SEBI 2025** — pace backfills; reuse the
  per-account limiter/breaker so a bulk pull can't earn a ban.
- **Redistribution licence** — same wall as every broker: personal, non-public,
  in-India use. Fine for a single-user tool; a known future migration if the
  monetisation roadmap activates (then an *authorised vendor*, not a broker).
- **API churn** — Upstox has revised auth/intervals/limits before. The Zod-at-
  the-seam discipline turns a breaking change into a loud, localised failure.

---

## 10. Open questions to resolve in Phase 0

1. Does the **current** Upstox API version offer a **refresh token or extended
   token** for headless daily minting? (Decides §5.)
2. Exact **per-interval history window** for the v3 historical-candle endpoint,
   and the **precise interval syntax** (unit + multiple) for 1m/5m/15m/30m/1h.
3. Current **rate-limit numbers** (per-second / per-minute / per-30-min) under
   the SEBI algo tiers.
4. **Instrument master** format, URL, and refresh cadence; confirm ISIN and
   trading-symbol fields are both present for NSE equities and indices.
5. **WebSocket market-feed v3** protobuf schema (only needed for Phase 7).
6. Does `provider_credentials` already key on **provider id** with no new column
   needed to store the Upstox token alongside Fyers?
7. Confirm the **daily token cutoff time** (~03:30 IST) so the credential job's
   schedule lines up with it.

---

## 11. Sources

- Upstox Developer API v3 — Historical candle data:
  https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/
- Upstox Developer API — auth, instruments, quotes, market-data feed
  (verify current versions from the developer portal).
- Provider-comparison verdict: "India Market-Data Provider Verdict"
  (internal, verified 01·Sep·2026) — for the field, scoring, and the
  keep-Fyers-add-a-standby architecture this plan implements with Upstox.
- Existing repo: `packages/market-data/src/provider.ts` (the contract),
  `packages/providers-fyers/src/{adapter,auth,resolution}.ts` (the pattern to
  mirror), `apps/web/src/server/provider.ts` and `apps/worker/src/context.ts`
  (the two composition roots), `docs/operations/deployment.md` §5 (Fyers credential
  self-heal).
