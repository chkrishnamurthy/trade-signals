# Per-category inspection checklist

Work the checklist; report only what you verified. `grep`/`sed` commands are starting
points, not proof — read the surrounding code before asserting anything.

---

## 1. Architecture

- Separation of concerns: does `packages/core` stay pure? Any DB, network,
  `Date.now()`, `process.env`, module-level mutable state, or randomness in it is a
  🔴 violation of the project's own rule 1 — it means the backtester and the live
  path are no longer running identical code.
  `grep -rnE "Date\.now|new Date\(\)|process\.env|fetch\(|Math\.random|let [a-z]" packages/core/src --include='*.ts' | grep -v test`
- Are Fyers-specific types leaking outside `packages/fyers`?
  `grep -rn "fyers" apps packages --include='*.ts*' -il | grep -v packages/fyers`
- Dependency direction: does anything low-level import from a higher layer? Does
  `packages/shared` import `packages/db`? Circular imports?
- Service boundaries: what does `apps/worker` own vs `apps/web/src/server`? Is the
  same logic implemented twice on both sides?
- Duplicate/parallel implementations of the same feature — which one is live, which
  one is abandoned? Abandoned parallel implementations are debt AND a correctness
  trap (someone will fix the bug in the dead copy).
- Reusability: are there god-modules doing fetch + transform + format + cache?
- Is config genuinely versioned YAML, or are there magic numbers in code that should
  be in `config/*.yaml`?

## 2. Frontend

- Client/server boundary: which components are `'use client'`, and did that get
  chosen or did it spread by accident? `grep -rln "use client" apps/web/src`
- Data fetching: `useEffect` + `fetch` with no abort controller, no dedupe, no
  cache? Does a re-render restart the fetch? Race between a stale and a fresh
  response — does the older one win?
- Polling: what interval, does it stop when the tab is hidden, does it stop when the
  market is closed, does it stop on unmount, does it back off on error?
- Re-renders: a single state object holding all ticks re-renders the entire tree on
  every tick. Look for `useMemo`/`useCallback` that are missing where a big array is
  derived, AND for ones that are pointless noise.
- Keys: index-as-key on a list that reorders (movers, gainers/losers) is a real bug.
- Error boundaries: is there ANY? What renders when `/api/dashboard` 500s?
- Loading states: skeleton vs blank vs stale-showing-as-fresh. **Showing stale data
  with no staleness indicator is a data-integrity bug, not a UX nit.**
- Empty states: no data, market closed, holiday, pre-open, symbol not found.
- TypeScript: `any`, `as` casts across a boundary, non-null `!`, optional chaining
  hiding a missing-data path, props typed as `string` that are really enums.
- Number formatting: is paise→rupees conversion happening ONLY in components via
  `formatPaise()`? Any arithmetic on rupee floats in a component is 🔴.
- Accessibility: color-only encoding of up/down (red/green with no sign or arrow),
  missing `aria-label` on icon buttons, drawer/modal without focus trap or Escape,
  no `aria-live` on values that update silently, contrast of green/red on dark,
  tables without headers, non-button elements with onClick, tab order in the drawer.

## 3. Backend

- Every route handler: input validation with Zod at the boundary? What does an
  unknown `[index]` or a garbage `[symbol]` return — 400, 500, or a stack trace?
- Path params used unvalidated in a query or a filesystem path or a Fyers call?
- Error handling: does the catch block swallow, log-and-return-200, or return the
  raw upstream error message (which may contain the token)?
- Does an API route ever return an empty/zeroed payload that the UI renders as if it
  were real market data? That is 🔴 — failure must be visible.
- Caching: any `revalidate`, `Cache-Control`, `unstable_cache`? Next.js may be
  statically caching a route that must never be cached — check `dynamic` / `revalidate`
  exports on every market-data route. A cached price is a wrong price.
- Rate limiting on the app's own routes, and respect for Fyers' limits underneath.
- Auth: this is a single-user local tool, so the honest question is whether the
  Fyers OAuth callback route (`/callback`) validates state, whether `/login` can be
  triggered by a cross-site request, and whether the app binds to `0.0.0.0`.
- Logging: is anything logged that contains an access token, auth code, appId:token
  pair, or TOTP secret? `grep -rnE "console\.(log|error|warn)" apps packages --include='*.ts*' | grep -v test`
  — then read each one for what it interpolates.
- N+1: one Fyers call or one DB query per symbol in a loop.

## 4. FYERS integration

- **Token lifecycle**: where is the token stored, what are the file permissions, is
  expiry checked before use or only after a 401? Is expiry derived from a timestamp
  or from the token's own claims? What happens at the daily expiry boundary
  mid-session — does one request fail, or does everything fail until restart?
- Is there a stampede risk: N concurrent requests all detecting expiry and all
  starting a re-login? Is re-login single-flighted?
- TOTP/automated login: undocumented endpoints. Is failure degraded to a clear
  human-actionable error, or does it retry blindly and get the account locked?
- **Rate limits**: Fyers publishes per-second / per-minute / per-day caps. Is the
  limiter per-process only? What happens if the worker and the web app both call?
  Does the limiter queue unboundedly (memory) or reject? Is the daily cap tracked at
  all, and does it reset on the right boundary in the right timezone?
- **HTTP**: timeouts set? Retries with backoff and jitter? Is a retry applied to
  non-idempotent calls? Does it retry a 4xx (pointless) or only 5xx/429? Is
  `Retry-After` honored?
- **WebSocket**: reconnect with backoff — does it resubscribe the FULL symbol set
  after reconnect, or only the delta? Is there a heartbeat/watchdog treating silence
  as death? What is the max subscription count and what happens on symbol 201?
  On reconnect, is the gap in ticks backfilled from REST, or silently lost?
- **Duplicate ticks**: is there idempotency by (symbol, exchange timestamp)? Does a
  replayed tick double-count volume or re-trigger a signal?
- **Out-of-order ticks**: does a stale tick with an older timestamp overwrite a newer
  price?
- **Normalization**: Zod-parsed at the boundary? What are the units of each field
  coming back — Fyers returns rupees as floats; where exactly is the paise
  conversion and does it round or truncate? Off-by-one paise on every price is a
  real defect. Check `Math.round` vs `|0` vs `parseInt`.
- **Symbols**: `NSE:RELIANCE-EQ` construction, indices (`NSE:NIFTY50-INDEX`), symbols
  with `&`, `-`, series other than EQ, renamed/delisted symbols.
- **Market hours**: 09:15–15:30 IST, pre-open 09:00–09:15, holidays. Is the holiday
  list hardcoded and does it expire? Is `Asia/Kolkata` handled via a real tz
  database or via a `+5:30` offset added by hand? Muhurat trading sessions?

## 5. Market-data integrity

For each number the dashboard shows, trace it back to its source and answer: where
did this come from, and when.

- **Price**: real LTP or last close or a fallback? What renders when LTP is missing?
- **Previous close**: from Fyers' `prev_close_price`, or computed as
  "yesterday's candle close"? On the day after a holiday, after a split, or for a
  freshly listed stock, are those the same number? Corporate-action adjustment must
  be applied on read (rule 5) — is it?
- **Change %**: `(ltp - prevClose) / prevClose`. Computed in paise (correct) or in
  floats (drift)? What if `prevClose` is 0 or null — `Infinity`/`NaN` on screen?
- **Volume**: cumulative-for-the-day or per-tick delta? Summing per-tick deltas from
  a cumulative field inflates volume massively. Relative volume needs an average
  over N days — over how many, and does it exclude today?
- **Timestamps**: TIMESTAMPTZ UTC in the DB, IST only at the boundary (rule 6). Any
  naive datetime, any `new Date(string)` without a zone, any `toLocaleString` on the
  server, any use of server local time.
- **Staleness**: is there a "last updated" anywhere? If the socket died 10 minutes
  ago, does the UI look identical to a live feed? That is the single most dangerous
  possible failure in this app.
- **Market status**: computed from a clock, from Fyers, or hardcoded? Off by a
  holiday, off by a timezone, off by DST assumptions (India has none — does the code
  assume it might?).
- **Missing data**: a stock with no candles, a stock halted, a stock in a circuit,
  an index constituent that changed. Does a missing symbol drop silently from a
  breadth count and skew the percentage?
- **Derived timeframes**: `time_bucket` with origin at 09:15 IST (rule 4). Any
  persisted 5m/15m/1h table is a 🔴 rule violation.
- **Fake data**: any hardcoded price array, `Math.random()`, seeded demo constituent
  list, or "sample" JSON on a render path.

## 6. Technical indicators

**Read the math. Do not trust the docstring, the function name, or the test.**

For each indicator, verify:

- **Warm-up / seeding**: does it emit values before it has enough data? SMA(20) with
  15 candles must be `null`, not an average of 15. Off-by-one in the first emitted
  index is the most common indicator bug.
- **EMA**: seeded with an SMA of the first `period` values (standard) or with the
  first close (drifts)? Multiplier `2/(period+1)`?
- **Wilder's smoothing** (RSI, ATR, ADX) uses `1/period`, NOT `2/(period+1)`. Mixing
  them is a classic error. Check `moving-average.ts` for which is which.
- **RSI**: Wilder smoothing on both gain and loss; `avgLoss === 0` → 100; index
  alignment (first change is at index 1, so RSI is offset by one).
- **MACD**: `EMA(12) - EMA(26)`, signal is `EMA(9)` **of the MACD line**, and the
  signal EMA's own warm-up must be respected — it cannot start before the MACD line
  has 9 real values. Histogram = macd − signal.
- **ATR**: True Range = `max(h-l, |h-prevClose|, |l-prevClose|)`. The first bar has
  no prevClose. Then Wilder-smoothed, not simple-averaged.
- **`null` handling**: does a `null` in the middle of a series propagate, get treated
  as 0, or get skipped (silently shifting every later index)? Treating `null` as 0
  in a price series is 🔴.
- **Integer paise**: indicators on paise integers are fine and preferred; ratios
  (RSI) are floats by nature. Any indicator returning a rupee float is a bug.
- **Test quality**: open the test file. Were expected values **hand-computed or taken
  from an independent source**, or were they produced by running this implementation
  and pasting the output? The latter tests nothing but stability, and the project
  explicitly requires hand-computed fixtures. Say so if you find it.
- Cross-check at least one indicator by hand on a short series and show your
  arithmetic in the report.

## 7. Trading signals

- **Look-ahead bias** — the highest-value thing to hunt in this whole review.
  Rule 2: signals on CLOSED candles only, entry at the NEXT candle's open. Check:
  does the engine receive an array that includes the forming candle? Does any
  indicator index reach `i` when the decision is made at `i`? Does the backtest use
  `close[i]` as the fill price for a signal generated at `i`? Does a "confirmation"
  check peek at a later bar?
- **Insufficient history**: what does the engine do with 30 candles when the config
  needs 200? Does it emit HOLD, throw, or emit a confident BUY off a warm-up value?
- **Thresholds**: hardcoded in code vs versioned in config. Are they per-symbol or
  global? A single RSI threshold across a 2% daily-range stock and a 15% one is not
  meaningful — say so.
- **Conflicting indicators**: what happens when RSI says oversold and MACD says
  bearish? Is the resolution principled (weights) or accidental (order of `if`s)?
- **Signal strength**: is "strength" derived from anything statistical, or is it a
  weighted sum of factors scaled to 0–100 to look precise? **Explicitly call out any
  signal presented with more confidence than the data justifies** — a "87% confidence
  BUY" from a weighted sum of three indicators on 60 candles is a fabricated number,
  and displaying it is a 🔴 trust problem.
- **Factor breakdown persisted** (rule 8): does `signal_factors` get written, and
  does the "Why this signal?" UI read it rather than recomputing? Recomputing means
  the explanation can disagree with the signal.
- **Strategy versioning** (rule 7): can a weight change without minting a new
  `strategy_versions` row? Is `strategy_version_id` stamped on each signal?
- **False positives/negatives**: is there ANY measurement — a backtest, a hit rate,
  a baseline? If not, the honest score for this category is low regardless of code
  quality, because nothing has been validated.
- Survivorship bias in the constituent list; index rebalancing.

## 8. Security

Highest priority. Check, in order:

- Is `.env`, `.fyers-token.json`, or any credential tracked in git, now or in
  history? `git ls-files` and `git log --all --diff-filter=A --name-only`.
- Does `.env.example` contain real values rather than placeholders?
- Any secret reachable from the browser: `NEXT_PUBLIC_*`, a token embedded in a
  server-rendered payload, a token in an API response, a token in a client-side
  fetch header, a token in an error message rendered to the page.
- Token file permissions and location. World-readable token in the repo directory?
- Logs: tokens, auth codes, TOTP secrets, `appId:accessToken`, full request URLs
  with query-string credentials. Also check error objects being logged whole.
- OAuth callback: is `state` generated, stored, and verified? Is the auth code
  logged? Is the callback route reachable without any origin check?
- Injection: raw SQL string interpolation (`grep -rn "sql\`" packages apps`), a path
  param concatenated into a query, a symbol string passed into a filesystem path.
- XSS: `dangerouslySetInnerHTML`, `innerHTML`, rendering an upstream-provided string
  as HTML.
- CSRF: any GET route that performs a side effect (`/login` initiating an OAuth
  flow, any route that writes).
- WebSocket: is the URL and token constructed on the server only? Is any inbound
  socket payload trusted without Zod parsing before it reaches state?
- Dependency risk: `pnpm audit`, and any dependency that receives the token.
- Does the dev server bind beyond localhost?

## 9. Performance

Model it out loud at 50 / 500 / 5,000 symbols, and at 1 / 10 / 1,000 ticks per
second, and with 2 browser tabs open.

- API call count per dashboard render. Per poll. Per symbol.
- Does one page load trigger one Fyers quote call per symbol? At 500 symbols against
  a per-second rate limit, compute the actual wall-clock time and state it.
- WebSocket subscriptions vs the 200-symbol cap: what happens at 500? Multiple
  sockets? Does the code know?
- Tick fan-out: is every tick pushed into React state? At 1,000/sec that is 1,000
  renders/sec — is there batching, throttling, or a `requestAnimationFrame` coalesce?
- Indicator recomputation: is the full series recomputed on every tick or every
  poll? O(n) per tick × 500 symbols. Is there an incremental path?
- Memory: unbounded tick arrays, a `Map` keyed by symbol that never evicts, listeners
  added on every reconnect without removal, timers not cleared on unmount, sockets
  not closed on shutdown.
- DB: missing index on `(symbol, ts)`, `SELECT *` on a hypertable, fetching a full
  history to compute one indicator, no `LIMIT`.
- Payload size: sending 500 stocks × 200 candles to the browser as JSON. Compute the
  approximate megabytes and state it.
- Caching: is there any layer between the dashboard and Fyers? Should there be?
- Cold starts: Neon scale-to-zero — first query latency after idle, and whether
  every scheduled job retries connection failure with backoff.

## 10. Production readiness

- Structured logging with levels, or `console.log`? Can you answer "what happened at
  09:17 yesterday" from the logs?
- Error tracking: does an unhandled rejection in the worker kill it silently?
  `process.on('unhandledRejection')` / `uncaughtException` handlers?
- Health check endpoint. Does it check the DB and the Fyers token, or return 200
  unconditionally?
- Graceful shutdown: SIGINT/SIGTERM → stop the scheduler, close the socket, drain
  in-flight writes, close the pool.
- Scheduler: does croner overlap runs if one takes longer than the interval? Is
  there a lock? Does a missed run while the machine slept get backfilled?
- Retries: everywhere a network call happens, with backoff+jitter, and a cap.
- Migrations: are they checked in, ordered, and applied via `DATABASE_URL_DIRECT`?
  Is there a down path or at least a documented recovery?
- Env config: is every required var validated at startup with Zod and a clear error,
  or does the app boot and fail three hours later at 09:15?
- Backup/recovery: candles are irreplaceable once the Fyers history window rolls off.
  Is there any backup? What is the actual recovery procedure?
- Data gap detection: if the worker was down 09:15–10:00, does anything notice the
  missing candles, or does the chart just have a hole and the indicators silently
  compute across it?
