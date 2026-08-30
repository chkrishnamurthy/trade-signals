# Backtesting architecture

Status: **proposal, not implemented.** Written 2026-08-29 against the repository
at `8656714`. Every claim about existing code names the file it came from.

All diagrams are plain text in fenced blocks, so they render in any editor,
any terminal, and on GitHub without a plugin. View in a monospace font.

## Decisions taken (2026-08-29)

| # | Question | Decision |
|---|---|---|
| D1 | Money, quantity, capital, rupee P&L | **Keep R-multiples and per-share paise.** `CLAUDE.md` is unchanged. Max drawdown in R, concurrency in place of capital utilisation, top-N-by-score in place of max positions. |
| D2 | Where to start | **Correctness first — Phases 0-3.** Close G1-G4 on stored candles before any archive work. |
| D3 | Archive host | **This Mac.** Downloader and backtest runner share a process with the live worker; the market-hours yield keeps the live cycle first. |
| D4 | New dependencies | **Approved:** `telegram` (GramJS), `apache-arrow`, `yauzl`. All pure Node, no new service, no Python. |
| D5 | Archive location in Telegram | **A channel or group.** Not Saved Messages. The `@name` or invite link goes in `config/historical.yaml` and fences the downloader to that one peer. |
| D6 | Archive depth | **3 years or more.** ~750+ sessions. Two consequences below: raw-tier disk sizing (§6.3) and survivorship (§11.5). |
| D7 | Dated index membership | **Not available.** Backtests run against today's constituents; every run is stamped `universe: undated` so the survivorship caveat travels with the result. |
| D8 | Schema discovery | **Operator-run commands.** Owner runs diagnostics locally and returns the output; no archive file needs to be shared. |
| D9 | Telegram channel | **`NFO_DAILY_DATA`.** The only peer the downloader will read. See **O1** — the name implies the F&O segment, which may not be the segment this engine analyses. |
| D10 | Initial scope | **First 3 months (~60 sessions).** Enough to build and prove the pipeline; see §11.5 for what 60 sessions can and cannot support statistically. |

**O1 — BLOCKING for the archive work:** does `NFO_DAILY_DATA` carry NSE **cash
equity** ticks, or only **F&O** (futures and options)? See §6.2. It does not block
Phase 1.

Also open: Feather version, tick schema, per-file size (§6.3).

---

## 1. Executive summary

The audit changes the shape of the problem in three ways, and each one makes the
work smaller than the brief assumes.

**1. The live path is not tick-driven.** It polls *closed one-minute candles*
every three minutes, stores them, and evaluates. `streamTicks` exists in
`packages/fyers/src/stream.ts` and is wired through
`packages/providers-fyers/src/adapter.ts:187`, but **nothing in `apps/worker` or
`apps/web` calls it** — the only consumers are its own tests. The engine's atomic
unit is a closed 1m bar (`packages/core/src/types.ts`, `Bar`), never a tick. So
"replay historical tick data through the signal pipeline" is really "produce 1m
bars from tick files and hand them to the function that already exists".

**2. A working backtester already exists.** Two of them:

- `scripts/backtest-intraday.ts` — in-memory replay of the real
  `evaluateIntraday` and `resolvePaperTrade` over stored candles, with expectancy
  by score band, strategy, regime and exit, plus a rejection census.
- `scripts/replay-session.ts` — the same session driven through the **database
  path**: the real `runIntradayCycle` and `recordPaperTrades`.

Together with `pnpm backfill:minutes --days N` and `pnpm data:coverage`, the
"wait for tomorrow's market" problem is already solved for any date whose 1m bars
are in `minute_candles`. Changing a threshold and re-measuring is a
sub-two-minute loop **today**.

**3. The real gaps are narrower and different from the brief.** They are:

| # | Gap | Evidence |
|---|---|---|
| G1 | The in-memory backtester **skips the lifecycle state machine**. It records a paper trade off a raw `candidate.triggered`; the live path runs `transition()` first, which adds confirmation bars, cooldowns, dedup against recently-ended setups and per-symbol caps. The two therefore measure different systems. | `scripts/backtest-intraday.ts:~350` vs `apps/worker/src/jobs/intraday-signals.ts` (`transition(...)`) |
| G2 | The in-memory backtester runs with an **empty market context** — `benchmarkMinuteBars: []`, `benchmarkDailyBars: []`, no VIX, no bank index. `marketContext` carries weight 0.15 of the confluence score. Backtested scores are systematically not live scores. | `scripts/backtest-intraday.ts` `buildMarketContext({benchmarkMinuteBars: [], …})` |
| G3 | `replay-session.ts` **writes into the live tables**. A replay of 2026-08-21 inserts real `intraday_signals` and `paper_trades` rows for that trading date, which then appear on `/signals/performance` beside genuinely live results. There is no isolation and no way to tell them apart afterwards. | `apps/worker/src/jobs/intraday-signals.ts` → `createIntradaySignal` |
| G4 | **No backtest is reproducible.** Results are console output. Nothing records the config hash, the data source, the window, the universe, or the code revision. | no `backtest_*` table exists |
| G5 | **History depth is bounded by the provider.** `backfill:minutes` is the only source of 1m bars, and it is rate-limited and reaches back only as far as Fyers serves. This is exactly what the Telegram archive fixes. | `apps/worker/src/jobs/ingest-intraday.ts` |
| G6 | **No UI.** | `apps/web/src/lib/navigation.ts` has no backtest entry |
| G7 | **Survivorship bias is live.** The universe is read from `config/indices.yaml` — today's NIFTY 50 — and applied to every historical date. | `apps/worker/src/universe.ts` |
| G8 | **No trading calendar.** Every offline path treats an exchange holiday as a session with missing data. Already recorded in `docs/pending-features.md` §2.3. | `packages/shared/src/time.ts` |

The proposal therefore is **not** "build a backtesting engine". It is: close G1–G4
first (a week of work, no new data source, no new dependency), then build the
Telegram archive as a *second bar source* behind one interface so it deepens
history without touching the live path.

---

## 2. Two things in the brief that conflict with the product's rules

Both need your decision before Phase 1. I have designed around them; say the word
and I will design differently.

### 2.1 Money, quantity, capital and positions

Brief §6 and §7 ask the execution simulator for quantity, capital/equity, P&L,
maximum concurrent positions, and return percentage. `CLAUDE.md` forbids all of
them, in three separate places, and the existing code holds the line — every
figure in `paper_trades` is **per share, in paise**, and results are published in
**R multiples**, not rupees:

> NO money, quantity or position is represented anywhere — that is still forbidden.

There is a real reason behind the rule and it is not squeamishness: the moment the
system knows a capital base, its output stops being "this setup has 1.4R of net
edge" and starts being "you would have made ₹18,400", which is a different product
with a different regulatory character and a different failure mode.

**What I propose instead**, which answers every question you actually asked
without representing money:

| You asked for | Equivalent that keeps the rule |
|---|---|
| Total P&L | Total R, and total net paise per share |
| Average profit / loss | `averageWinR` / `averageLossR` — already computed in `summarisePaperTrades` |
| Profit factor | already computed |
| Maximum drawdown | **max drawdown in R**, over the equity curve of 1R-risk-per-trade units |
| Return percentage | expectancy in R per trade, and R per session |
| Capital utilisation | **concurrency**: max simultaneous open setups, and time-weighted average |
| Max concurrent positions | a **signal-selection filter** (top-N by score per instant), which is a property of the feed, not of a portfolio |
| Quantity | omitted; every figure is per share |

That table gives you the same decisions with none of the forbidden state.

> **Decided (D1).** R-multiples and per-share paise. `CLAUDE.md` stands as
> written. Max drawdown in R, concurrency, and top-N-by-score are the three new
> figures to build; quantity, capital and rupee P&L are not built.

### 2.2 Storing ticks

Brief §8 says do not blindly load everything into memory, and §19 says do not put
raw ticks in the relational database. Agreed, and the constraint is sharper than
that here: **timescaledb compression is unavailable on Neon** (`CLAUDE.md`), and
Neon scales to zero. One session of NSE tick data for 50 symbols is on the order
of 10^6–10^7 rows. A year is 10^9. That does not belong in this Postgres.

The design below keeps **ticks on disk, forever immutable**, and puts only
**derived 1m bars** and **file metadata** anywhere near the database.

---

## 3. Current system overview

### 3.1 Component map

```text
                          +------------------------------------------+
                          |  Fyers REST + WebSocket  (rate-limited)  |
                          +---------------------+--------------------+
                                                |
                    packages/fyers  ->  packages/providers-fyers/adapter.ts
                                                |
                          +---------------------v--------------------+
                          |  packages/market-data                    |
                          |  MarketDataProvider . Bar . InstrumentRef|
                          |  <- the broker-independence seam         |
                          +---------------------+--------------------+
                                                |
   +--------------------------------------------v-------------------------------+
   |  apps/worker   -- the ONLY writer                                          |
   |  scheduler.ts (croner, IST)                                                |
   |    |- ingest-intraday.ts   1m candles -> minute_candles  (closed bars only)|
   |    |- intraday-signals.ts  runIntradayCycle             every 3 minutes    |
   |    |- paper-trades.ts      resolvePaperTrade -> paper_trades               |
   |    |- ingest-daily.ts / compute-indicators.ts           16:15 / 16:45      |
   |    `- refresh-credential.ts                             08:30              |
   +-------+------------------------------------------------+-------------------+
           | calls (pure)                                    | reads / writes
   +-------v-------------------------------+      +----------v-------------------+
   | packages/core   -- PURE (hard rule 1) |      | Neon Postgres + timescaledb  |
   |  indicators/    ema sma rsi macd atr  |      |  minute_candles  (hypertable)|
   |                 adx roc vwap          |      |  daily_candles    append-only|
   |  intraday/bars.ts    1m -> 3m/5m/15m  |      |  intraday_signals            |
   |  intraday/frame.ts   EvaluationFrame  |      |   + factors/reasons/events   |
   |                      + cutoff         |      |  intraday_runs               |
   |  intraday/strategies/  five strategies|      |  paper_trades                |
   |  intraday/scoring.ts   confluence     |      |  strategy_versions  immutable|
   |  intraday/lifecycle.ts transition()   |      +----------+-------------------+
   |  intraday/paper.ts     resolvePaper.. |                 | reads only
   |  intraday/costs.ts     NSE schedule   |      +----------v-------------------+
   +---------------------------------------+      | apps/web  -- READS ONLY      |
                                                  |  /api/intraday-signals       |
   scripts/                                       |  /signals                    |
     backtest-intraday.ts  --+                    |  /signals/performance        |
     replay-session.ts     --+--> core + db       +------------------------------+
     backfill-minutes.ts   --+
     coverage.ts           --+
```

### 3.2 Current Trade Signals flow

Every three minutes between 09:00 and 15:59 IST (`*/3 9-15 * * 1-5`,
`apps/worker/src/index.ts`):

```text
  croner (IST, */3 9-15 * * 1-5)
      |
      |--> refreshProviderCredential            cheap; self-healing
      |--> sessionRegime(now)                   return at once if closed / pre-open
      |
      |--> ingestIntradayCandles(50 equities + 3 index refs)
      |        |- latestMinuteBarPerInstrument       the incremental cursor
      |        |- provider.fetchBars('1m')           concurrency 4, rate-limited
      |        |- drop bars whose minute has NOT closed        <- hard rule 2
      |        `- insertMinuteCandles ON CONFLICT DO NOTHING   <- idempotent
      |
      |--> startIntradayRun(tradingDate, regime)
      |--> batched reads: today's 1m . prior 1m (cached/day) . daily (cached/day)
      |--> buildVolumeProfile . breadth . sector means . buildMarketContext
      |
      |--> FOR EACH SYMBOL
      |        evaluateIntraday({symbol, bars, context, at})          PURE
      |              `--> candidates . rejections . indicator snapshot
      |        transition({existing, evaluation, recentlyEnded, at})  PURE
      |              `--> created . updated . events
      |        createIntradaySignal / updateIntradaySignal
      |              (+ factors  + reasons  + events)
      |
      |--> finishIntradayRun
      `--> recordPaperTrades          same cycle, immediately after
               `- resolvePaperTrade -> paper_trades  (upsert, unique on signal_id)
```

Three properties matter for what follows:

- **The engine is already replay-safe.** `buildFrame` computes a `cutoff` at the
  end of the last closed trigger bar and reads nothing after it, so evaluating at
  09:33:40 and 09:34:10 gives byte-identical output. That is the property that
  makes a backtest able to reproduce a live signal exactly.
- **The engine is already deterministic and pure** — no clock, no I/O, no module
  state. Everything the harness supplies is explicit.
- **Only `apps/worker` writes.** `apps/web` never runs the engine and never asks
  the provider for bars, because two writers would race the partial unique index
  `intraday_signals_live_idx`.

### 3.3 Current Paper Trading flow

Runs inside the same cycle, immediately after signals are written
(`apps/worker/src/jobs/paper-trades.ts`):

1. `settledSignalIds(tradingDate)` — already-final outcomes are skipped.
2. `getTriggeredSignals(tradingDate, exclude)`.
3. One batched read of today's 1m bars for the affected instruments (`raw: true` —
   no corporate action can have an ex-date in today's future).
4. `resolvePaperTrade` per signal, from `@equitywise/core`.
5. `recordPaperTrade` upsert, unique on `signal_id`.

`resolvePaperTrade` is deliberately pessimistic and this is the single most
important piece of existing code for the whole backtesting effort:

- the fill is the **next bar's open** after the trigger — never the entry zone;
- a bar containing both the stop and the target counts as a **stop**;
- a fill at or beyond the invalidation is **not a trade at all**;
- a fill that has already spent more than half the risk budget is **not a trade**;
- costs are charged on every trade including losers, slippage on both legs;
- an outcome with no force-exit reached is `unresolved` and excluded from stats.

It is already shared verbatim by the live recorder and by
`scripts/backtest-intraday.ts`. **The execution simulator you asked for exists,
is tested (`packages/core/src/intraday/paper.test.ts`), and must not be
rewritten.**

### 3.4 What is already reusable, unchanged

| Component | Path | Reuse for backtest |
|---|---|---|
| Indicators | `packages/core/src/indicators/*` | verbatim |
| Timeframe derivation | `packages/core/src/intraday/bars.ts` | verbatim |
| Frame construction + cutoff | `intraday/frame.ts` | verbatim |
| Five strategies | `intraday/strategies/*` | verbatim |
| Confluence scoring | `intraday/scoring.ts` | verbatim |
| Lifecycle state machine | `intraday/lifecycle.ts` | verbatim — **currently unused by the backtester (G1)** |
| Level geometry, cost model | `intraday/levels.ts`, `costs.ts` | verbatim |
| Paper trade resolver + stats | `intraday/paper.ts` | verbatim |
| Session regime / gating | `intraday/session.ts` | verbatim |
| Market context | `intraday/context.ts` | verbatim — **currently fed empty by the backtester (G2)** |
| Config loader + validation | `apps/worker/src/intraday-config.ts` | verbatim |
| Strategy version registration | `registerStrategy` | verbatim |
| Bar repositories | `packages/db/src/repositories/candles.ts` | verbatim |
| Report formatting | `scripts/backtest-intraday.ts` reporting half | lift into a module |

---

## 4. Goals and non-goals

**Goals**

1. Change a threshold and get a graded, costed, statistically-labelled answer over
   *many* stored sessions without waiting for the market.
2. One definition of a cycle, shared by live and backtest — divergence must be a
   compile error or a failing parity test, not a silent drift.
3. Reproducibility: a run records config hash, data source and version, universe,
   window, cycle interval, and code revision.
4. History depth from the Telegram archive, without touching the live path.
5. Backtest results physically separate from live results.

**Non-goals**

- Order execution of any kind. Unchanged.
- Money, quantity, capital, portfolio state (see §2.1).
- Tick-level *live* trading. The live path stays candle-polled.
- A queue, a broker, a container orchestrator, Redis, Python (`CLAUDE.md`).
- Multi-user anything.
- Storing ticks in Postgres.

---

## 5. Target architecture

### 5.1 The unified picture

The seam already exists: `FrameInput = { symbol, bars: SymbolBars, context, at }`.
Everything upstream of it is data plumbing; everything downstream is pure. The
proposal makes the *harness* — the loop that assembles `FrameInput`, applies
`transition`, and grades — shared too, which today it is not.

```text
  BAR SOURCES  -- one of only TWO things that differ
  +------------------------+ +------------------------+ +------------------------+
  | ProviderBarSource      | | StoredBarSource        | | ArchiveBarSource       |
  | Fyers -> minute_candles| | minute_candles         | | Telegram archive ->    |
  | LIVE . exists today    | | replay of recent dates | | 1m bar files      NEW  |
  +-----------+------------+ +-----------+------------+ +-----------+------------+
              +--------------------------+--------------------------+
                                         |
                                         v
                        +------------------------------------+
                        |  BarSource interface               |
                        |  sessionBars(date, ids) -> Bar[]   |
                        +------------------+-----------------+
                                           |
                                           v
             +-------------------------------------------------------+
             |  packages/core/src/intraday/harness.ts   NEW . PURE   |
             |  runCycle(state, sessionData, at, config)             |
             +---------------------------+---------------------------+
                                         |
                                         v
             +-------------------------------------------------------+
             |  packages/core -- UNCHANGED, exactly ONE implementation|
             |  evaluateIntraday -> transition -> resolvePaperTrade   |
             +---------------------------+---------------------------+
                                         |
                                         v
  SINKS  -- the other thing that differs
  +------------------------+ +------------------------+ +------------------------+
  | DbSignalSink           | | BacktestSink           | | MemorySink             |
  | intraday_signals       | | backtest_signals       | | scripts . parity tests |
  | paper_trades      LIVE | | backtest_trades   NEW  | |                        |
  +------------------------+ +------------------------+ +------------------------+

  Indicators, analysis, entry/exit conditions, risk geometry and signal rules
  have exactly ONE implementation.  Only the source and the sink change.
```

Read that as: **the data source and the sink are the only variables.** Indicators,
analysis, entry/exit conditions, risk geometry and signal rules have exactly one
implementation, in `packages/core`, and both paths call it.

### 5.2 Full target component architecture

```text
  TELEGRAM   (one configured peer, never the account at large)
      |
      v
  +-------------------------------------------------------------------+
  | packages/historical                                          NEW  |
  |   telegram/downloader.ts   MTProto . resumable . checksummed      |
  |   archive/validate.ts      zip integrity . Arrow schema           |
  |   archive/extract.ts       streaming unzip                        |
  |   archive/feather.ts       Arrow IPC reader, streaming            |
  |   archive/compile.ts       ticks -> 1m OHLCV, IST origin 09:15    |
  |   archive/crossvalidate.ts against minute_candles                 |
  +-------+-------------------------------------------+---------------+
          | writes files                              | writes metadata only
          v                                           v
  +------------------------------+     +-------------------------------------+
  | DISK -- immutable            |     | NEON POSTGRES -- index + results     |
  |                              |     |                                      |
  | data/archive/raw/<ds>/<d>.zip|     |  historical_datasets                 |
  |   as downloaded, never       |     |  historical_files                    |
  |   rewritten           COLD   |     |  historical_sessions                 |
  |                              |     |  -------------------------------     |
  | data/archive/bars/<ds>/<d>   |     |  backtest_runs                       |
  |   .arrow   derived 1m bars   |     |  backtest_signals                    |
  |   regenerable cache   WARM   |     |  backtest_trades                     |
  |                              |     |  -------------------------------     |
  | NO TICKS EVER LEAVE DISK     |     |  minute_candles      UNTOUCHED       |
  +--------------+---------------+     |  intraday_signals    UNTOUCHED       |
                 |                     |  paper_trades        UNTOUCHED       |
                 |                     +------------------+-------------------+
                 |                                        |
                 +--------------------+-------------------+
                                      |
                                      v
          +----------------------------------------------+
          | apps/worker                             NEW  |
          |   jobs/archive-sync.ts                       |
          |   jobs/backtest-runner.ts    claims a queued |
          |                              run; one txn    |
          |                              per session     |
          +----------------------+-----------------------+
                                 | calls
                                 v
                    packages/core   (engine + harness)
                                 |
                                 v
          +----------------------------------------------+
          | apps/web                                NEW  |
          |   GET  /api/historical/coverage              |
          |   GET  /api/backtests . /:id . /trades       |
          |   POST /api/backtests        <- enqueue only |
          |   /backtests   .   /backtests/:id            |
          +----------------------------------------------+
```

### 5.3 Component responsibilities

| Component | Path | Responsibility | Explicitly not |
|---|---|---|---|
| **Harness** | `packages/core/src/intraday/harness.ts` (new) | One cycle: evaluate → transition → grade. Pure; takes fully-loaded session data. | No DB, no clock, no file I/O |
| **BarSource** | `packages/backtest/src/sources/*` (new) | Answer "give me session `D`'s bars for these instruments" | No analysis |
| **Sink** | `packages/backtest/src/sinks/*` (new) | Persist signals/trades for a run | No decisions |
| **Backtest runner** | `apps/worker/src/jobs/backtest-runner.ts` (new) | Drive the date loop, update progress, handle failure/resume | No indicator math |
| **Telegram downloader** | `packages/historical/src/telegram/*` (new) | Enumerate messages, download missing files, checksum, record | No parsing |
| **Archive compiler** | `packages/historical/src/archive/compile.ts` (new) | Ticks → validated 1m bars, streaming | No signal logic |
| **Archive index** | `historical_files` / `historical_sessions` | "Do I already have this day?" in one indexed read | No tick storage |
| **Backtest API** | `apps/web/src/app/api/backtests/*` (new) | Enqueue a run, read status and results | Never runs the engine |
| **Backtest UI** | `apps/web/src/app/backtests/*` (new) | Availability, progress, results | Never computes a statistic the DTO did not supply |

---

## 6. Historical data: storage strategy

### 6.0 Where the data actually lives — the short answer

Three places, and **only one of them is the database**.

| What | Where it lives | Size for 60 sessions (D10) | In Postgres? |
|---|---|---|---|
| **The zip files from Telegram** | A folder on the Mac: `data/archive/raw/<dataset>/<YYYY-MM-DD>.zip` | 60 × per-file size. At ~100 MB/day ≈ **6 GB** | **No** |
| **The tick rows inside them** | Nowhere. Read as a stream, folded into 1m bars, then discarded | 0 | **No — never** |
| **The 1-minute bars I build from the ticks** | A folder on the Mac: `data/archive/bars/<dataset>/<YYYY-MM-DD>.arrow` | ~1.1 M rows ≈ **under 100 MB** | **No** |
| **A catalogue: which files I have, their fingerprint, whether they passed checks** | Neon Postgres | ~120 rows ≈ **well under 1 MB** | **Yes** |
| **Backtest results: runs, signals, trades** | Neon Postgres | a few thousand rows ≈ **under 10 MB** | **Yes** |

Read the ratio in that table: the **bars are roughly a hundredth the size of the
ticks**, and the database rows are a rounding error beside both. That asymmetry is
the entire storage design.

Why the ticks never enter Postgres:

- **Neon cannot compress them.** timescaledb compression is unavailable on Neon
  (`CLAUDE.md`), so a hypertable of ticks would be stored raw and billed raw.
- **Nothing reads ticks.** The engine consumes 1m bars, in live and in backtest
  alike. Ticks are an input to a conversion step, not to the product.
- **A file is a better fit than a table.** A backtest asks for "one whole trading
  day", which is one sequential file read — not a million-row indexed query
  against a database that scales to zero and has to cold-start first.

Why the database holds the catalogue anyway: answering *"do I already have this
day?"* has to be fast and reliable, and it is a question about **metadata**, not
about ticks. One indexed lookup on `(dataset_id, trading_date)` returns the file
path, its fingerprint, its symbol count and its verdict. Disk is then opened by a
path the database handed over — never scanned or guessed at.

The `data/` folder is gitignored, exactly like `.env`.

### 6.1 The three tiers

Answering brief §8's nine questions directly.

**1. Where should historical data live?** Three tiers, by mutability.

| Tier | Location | Contents | Mutability |
|---|---|---|---|
| Cold | `data/archive/raw/<dataset>/<YYYY-MM-DD>.zip` | the file exactly as Telegram delivered it | write-once, never rewritten |
| Warm | `data/archive/bars/<dataset>/<YYYY-MM-DD>.arrow` | derived 1m OHLCV, all symbols, one Arrow IPC file | regenerable cache; delete freely |
| Index | Neon Postgres | file metadata, per-session coverage, checksums, validation status | mutable rows |

`data/` is gitignored. Cold tier is the source of truth; warm tier is a
*derivation* and can be rebuilt from cold at any time, which is what makes a
compiler bug recoverable rather than catastrophic.

**2. How should Telegram be integrated?** See §7.

**3. Compressed or extracted?** **Keep the zip; never persist the extracted
ticks.** Extraction happens streaming, into the compiler, and the tick rows are
discarded after the 1m bars are emitted. Extracted tick files are the largest
artefact in the system and the least useful — every consumer wants bars.

**4. Is Feather enough, or is a different internal format better?** Feather is
fine as an *interchange* format and wrong as the *query* format. It is
per-symbol-per-day-shaped and has no index across dates. Two notes:

- Feather **v2 is Arrow IPC** and is readable in pure Node via the `apache-arrow`
  package — no Python, satisfying `CLAUDE.md`. **Feather v1 is not supported by
  the JS implementation.** Before Phase 5 we must check which version your files
  are; if they are v1, options are a one-time conversion pass or a small Rust/WASM
  reader. *This is an open question and I have not assumed an answer.*
- The internal warm format should be **Arrow IPC too**, but reorganised: one file
  per trading date containing every symbol's 375 bars, sorted by
  `(instrument, ts)`. That layout is exactly the access pattern a backtest has
  (`give me date D for 50 symbols`) and reads as one sequential file read.

**5. How does the app find a trading day quickly?** It does not scan the disk. It
queries `historical_sessions` on `(dataset_id, trading_date)` — a unique index —
which returns the file path, the checksum, the symbol count and the validation
verdict. Disk access is one open of a path the database handed over.

**6. How to avoid re-downloading?** `historical_files` is keyed on
`(dataset_id, telegram_message_id)` with a `sha256` and a `download_status`. The
sync job lists remote messages, subtracts what is already `verified`, and
downloads only the difference. A partial download is `downloading` with a byte
offset and resumes.

**7. Corrupted or incomplete files?** Three checks, each recorded:
`sha256` over the downloaded bytes; zip central-directory integrity; Arrow schema
+ row-count validation on each member. A failure marks the row `corrupt` with the
reason and leaves the file on disk for inspection — never silently retried in a
loop, because a file that is corrupt at the source will fail forever.

**8. Duplicates?** Content-addressed: `sha256` is unique per dataset. A second
message carrying identical bytes is linked to the existing file, not stored twice.
Two *different* files claiming the same trading date is a real conflict and is
surfaced, not auto-resolved — the later message wins only if you say so.

**9. Validation before backtesting?** A session is only `usable` when all of:
per-symbol bar counts within tolerance of 375; no bar failing `isCoherent`
(reusing `packages/core/src/intraday/bars.ts`); timestamps strictly ascending and
IST-aligned; first bar at or after 09:15 and last before 15:30; and — where the
date overlaps `minute_candles` — **bar-for-bar agreement with the provider's own
data** (§11.1). The backtest runner refuses a date that is not `usable` and says
why, rather than producing a confident number from a session with a hole in it.

### 6.2 O1 — which market segment is in the archive?

**This is the largest open risk in the plan, and it was created by the channel's
own name.** `NFO` is NSE's **Futures & Options** segment. This engine analyses
**cash equities** — `config/intraday.yaml` sets `universe: nifty50` and the
liquidity gates, previous-day levels, gap calculation and daily bars all read
`daily_candles`, which holds cash prices from the provider.

Four possibilities, with very different consequences:

| What the channel actually holds | Usable? | Consequence |
|---|---|---|
| **Cash equity ticks** (despite the name), or cash *and* F&O bundled together | **Yes, fully** | The plan proceeds exactly as written. Cross-validation against `minute_candles` should agree to the paise. |
| **Stock futures** for NIFTY 50 names | **Partly** | Futures track the underlying but not exactly: there is a basis (typically a few tenths of a percent, widening toward expiry) and the contract **rolls monthly**, so the series has a seam every month. Cross-validation against cash would show a *systematic, non-zero* divergence — which destroys the clean pass/fail test in §11.1 and replaces it with a judgement call. Workable, but it needs a continuous-contract construction and a documented basis tolerance. |
| **Index futures** (NIFTY, BANKNIFTY) | **Useful, narrow** | Not a substitute for per-stock bars, but a good intraday series for `MarketContext` — the benchmark trend and benchmark VWAP the backtester currently passes empty (G2). |
| **Options only** | **No** | Options chains cannot feed an equity trend/breakout engine. The archive would be irrelevant to this work, and deep history would have to come from the provider instead. |

**What settles it:** step 2 of the diagnostic commands. The file listing inside one
zip shows the instrument names. `RELIANCE` means cash. `RELIANCE25SEPFUT` means
stock futures. `NIFTY25SEP24000CE` means options.

If the answer is F&O-only, the honest outcome is that **Phases 5–8 change target
or get dropped**, while Phases 0–4 — which is where the actual value of this plan
sits — are entirely unaffected. That is a good reason to have sequenced them
first (D2).

### 6.3 Raw-tier disk sizing — a consequence of D6

**D10 defers this problem rather than solving it.** Three months is ~60 sessions,
which is small enough that "keep every file" is almost certainly fine — the
retention policy below only becomes a real decision when the window extends
toward the full 3+ years of D6. It is documented now so the storage layer is
built with the switch already in it, not retrofitted later.

Three years is roughly 750 sessions, and that changes the cold-tier calculus.

The compiled 1m bars are **two to three orders of magnitude smaller** than the
ticks they came from. A 50-symbol session is 375 bars × 50 = 18,750 rows; in Arrow
that is well under a megabyte, so 750 sessions of bars is a few hundred megabytes
even for a wide universe. The raw ticks behind them are not: a single session of
NSE tick data is commonly 50–150 MB compressed for a narrow universe and
substantially more for a wide one, which puts 750 sessions somewhere between
**40 GB and several hundred GB** on a laptop.

So "keep the cold tier forever, immutably" — correct at small scale — needs a
policy at this scale. Three options, to be chosen once the measured per-file size
is known:

| Policy | Disk | Recoverability |
|---|---|---|
| **Keep everything** | worst case hundreds of GB | a compiler bug is fully recoverable offline |
| **Keep a rolling window** (e.g. newest 60 sessions) plus every file that ever failed validation | bounded | recent dates recoverable offline; older dates need a re-download from Telegram |
| **Delete raw after verification** | minimal | every recompile is a re-download |

The middle option is the likely answer: it keeps the fast recompile loop for the
data being actively worked on, keeps every suspicious file for inspection, and
treats Telegram itself as the archive of record for everything older. **The
decision needs one measured number** — the size of a typical daily file — which
the schema-discovery commands produce.

Whatever is chosen, `historical_files` records the `sha256` of every file it ever
saw, so a re-downloaded file can be proved identical to the one that produced a
past result. Reproducibility survives deletion of the bytes.

### 6.4 Why derived bars do not go into `minute_candles`

Two hard blockers, both in existing code:

1. `minute_candles`' primary key is `(instrumentId, ts)` — **there is no source
   discriminator**. `insertMinuteCandles` uses `ON CONFLICT DO NOTHING`, so an
   archive-derived bar and a Fyers bar for the same minute silently resolve to
   whichever was written first, with no way to tell afterwards which one a
   backtest used. That destroys reproducibility (goal 3).
2. `packages/db/drizzle/0002_guards.sql` installs a `BEFORE UPDATE` trigger
   rejecting all mutation of `minute_candles` (hard rule 5). A compiler bug could
   only be fixed by a wholesale `DELETE` of the affected range — which would also
   delete the genuine live bars interleaved with it.

Keeping archive bars in their own on-disk store sidesteps both, keeps Neon small,
and makes "which data produced this result" a recorded fact rather than an
inference.

---

## 7. Telegram ingestion architecture

```text
  archive-sync   (or `pnpm archive:sync`)
      |
      v
  list messages on the configured peer, within the date range
      |
      v
  +-- already `verified` in historical_files? --> YES --> skip
  |
  NO
  v
  download to <name>.part              resumable, byte offset recorded
      |
      v
  sha256 over the downloaded bytes
      |
      v
  +-- hash already present in this dataset? --> YES --> link as duplicate,
  |                                                     discard the bytes
  NO
  v
  rename .part -> final                            status = downloaded
      |
      v
  zip central-directory integrity + member listing
      |                          `--> FAIL --> status = corrupt + reason
      |                                        file KEPT for inspection,
      |                                        NEVER retried in a loop
      v
  stream each member -> Arrow reader
      |                          `--> FAIL --> status = corrupt + reason
      v
  compile: ticks -> 1m OHLCV
      bucket origin 09:15 IST . integer paise . incremental volume
      a minute with no ticks produces NO bar
      |
      v
  validate the session
      counts near 375 . isCoherent . strictly ascending . inside 09:15-15:30
      |
      v
  write data/archive/bars/<dataset>/<date>.arrow      + its own sha256
      |
      v
  upsert historical_sessions
      symbols . bar rows . first/last ts . verdict . issues
      |
      v
  +-- date also present in minute_candles? --> NO --> done
  |
  YES
  v
  CROSS-VALIDATE bar-for-bar against the provider's own data
  record provider_overlap_bars and provider_max_divergence
  a date becomes `usable` ONLY if it agrees
```

### 7.1 Telegram access — practical constraints

These are real limits worth knowing before Phase 4 rather than after:

- The **Bot API cannot do this.** Bots cannot read arbitrary chat history and
  cannot download files above 20 MB. The archive needs **MTProto** as a *user*
  client (`telegram`/GramJS is the mature Node option).
- That requires `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` (from my.telegram.org) and
  a **session string** produced by an interactive login with your phone number and
  2FA. **You must perform that login yourself** — I will not enter credentials on
  your behalf. The intended shape is `pnpm telegram:login`, which prints a session
  string you place in `.env` (gitignored, like every other secret here).
- The session string is a **full-account credential**, strictly more sensitive
  than the Fyers token. See §13.
- Downloads are chunked and rate-limited by Telegram; expect `FLOOD_WAIT_x`
  responses. The downloader must honour them with backoff — the same discipline
  `packages/fyers` already applies, and for the same reason.
- Archives are *your* messages. The downloader reads a **single configured peer**
  (`TELEGRAM_ARCHIVE_PEER`), never the account at large.

### 7.2 Dataset descriptor

`config/historical.yaml` (versioned YAML, per convention — not a table, not an
admin CRUD screen):

```yaml
datasets:
  - id: nse-ticks-v1
    peer: "@my_saved_archive"        # or a numeric chat id
    filePattern: "^(\\d{4}-\\d{2}-\\d{2})\\.zip$"
    dateFrom: capture-group-1
    format: feather-v2
    timezone: Asia/Kolkata           # tick timestamps as stored
    priceUnit: rupees                # converted to paise on compile (hard rule 3)
    symbolMap: config/symbol-map.yaml
    columns:
      timestamp: ts
      symbol: tradingsymbol
      price: ltp
      volume: last_traded_qty
      bid: bid_price                  # optional
      ask: ask_price                  # optional
```

The `symbolMap` matters: the archive's ticker vocabulary is almost certainly not
`instruments.symbol`. Mapping is explicit and versioned, and an unmapped symbol is
**reported, not dropped silently** — a quietly-dropped symbol is a hole that the
engine's data-quality gate cannot see because it never knew the symbol existed.

### 7.3 Ticks → 1m bars: the compile rules

Non-negotiable, all inherited from existing invariants:

1. **Bucket origin is the 09:15 IST open**, reusing `bucketStart` semantics from
   `packages/core/src/intraday/bars.ts` — never midnight UTC (hard rule 4).
2. **A bar's `timestamp` is the instant it opens**, matching `minute_candles`.
3. **Prices convert to integer paise at the boundary** (hard rule 3). Rupee floats
   never leave the reader.
4. **Volume is incremental per minute.** Many tick feeds carry *cumulative* day
   volume; if so it is differenced. Getting this backwards inflates relative
   volume by orders of magnitude and every volume factor in `scoring.ts` with it.
   Cross-validation against provider bars (§11.1) catches exactly this.
5. **A minute with no ticks produces no bar.** `bucketBars` already treats gaps as
   gaps and refuses to fabricate a flat candle; the compiler must match.
6. Pre-open (09:00–09:15) and post-close ticks are **excluded**.
7. Memory is `O(symbols)`, not `O(ticks)`: fold ticks into per-symbol
   accumulators as the stream advances, flush a bar when the minute rolls.

### 7.4 The bonus ticks buy you

Ticks let you answer a question 1m bars structurally cannot:
`resolvePaperTrade` decision 2 — *"a bar containing both stop and target counts as
a stop"* — is a deliberate pessimism precisely because a bar hides intrabar order.
With ticks the true sequence is known.

The right way to use that is **not** to relax the grader. Keep
`resolvePaperTrade` as the conservative baseline, and add an optional
`resolveWithTicks` that reports the *same* trade under true sequencing. The gap
between the two is a directly useful number: it tells you how much of your
measured expectancy is being suppressed by the pessimistic assumption. If it is
small, the assumption is free; if it is large, you have learned something real
about your setups. Phase 12; not on the critical path.

---

## 8. Data model changes

All additive. **No existing table is altered.**

### 8.1 Archive index

```
historical_datasets
  id              text PK              -- 'nse-ticks-v1'
  peer            text NOT NULL
  format          text NOT NULL
  config          jsonb NOT NULL       -- the resolved descriptor, verbatim
  config_hash     text NOT NULL        -- reproducibility
  created_at      timestamptz

historical_files
  id                  bigint PK
  dataset_id          text FK
  telegram_message_id bigint NOT NULL
  file_name           text NOT NULL
  trading_date        date               -- parsed from the name; null if unknown
  size_bytes          bigint
  sha256              text
  status              text NOT NULL      -- pending|downloading|downloaded|verified|corrupt|duplicate
  status_reason       text
  local_path          text
  downloaded_at       timestamptz
  verified_at         timestamptz
  UNIQUE (dataset_id, telegram_message_id)
  UNIQUE (dataset_id, sha256) WHERE sha256 IS NOT NULL
  INDEX (dataset_id, trading_date)

historical_sessions              -- one row per (dataset, trading date)
  id               bigint PK
  dataset_id       text FK
  trading_date     date NOT NULL
  source_file_id   bigint FK
  bars_path        text NOT NULL      -- data/archive/bars/<dataset>/<date>.arrow
  bars_sha256      text NOT NULL      -- the warm cache is verifiable too
  symbols          integer NOT NULL
  bar_rows         integer NOT NULL
  tick_rows        bigint
  first_ts         timestamptz NOT NULL
  last_ts          timestamptz NOT NULL
  status           text NOT NULL      -- usable|incomplete|invalid
  issues           jsonb NOT NULL DEFAULT '[]'
  -- cross-validation against minute_candles, null when no overlap
  provider_overlap_bars     integer
  provider_max_divergence   integer   -- paise
  compiled_at      timestamptz
  UNIQUE (dataset_id, trading_date)
```

### 8.2 Backtest results — physically separate from live

```
backtest_runs
  id                  bigint PK
  label               text
  status              text NOT NULL     -- queued|running|succeeded|failed|cancelled
  -- reproducibility, all five required
  strategy_version_id integer FK strategy_versions   -- the immutable config (rule 7)
  bar_source          text NOT NULL     -- 'stored' | 'archive'
  dataset_id          text              -- non-null when bar_source='archive'
  git_revision        text NOT NULL     -- code the engine ran at
  universe            jsonb NOT NULL    -- the resolved symbol list, per date if dated
  from_date           date NOT NULL
  to_date             date NOT NULL
  cycle_minutes       integer NOT NULL
  overrides           jsonb NOT NULL DEFAULT '{}'   -- min-score, stop/target ATR, …
  -- progress
  sessions_total      integer NOT NULL DEFAULT 0
  sessions_done       integer NOT NULL DEFAULT 0
  symbols_evaluated   bigint  NOT NULL DEFAULT 0
  evaluations         bigint  NOT NULL DEFAULT 0
  signals_generated   integer NOT NULL DEFAULT 0
  trades_recorded     integer NOT NULL DEFAULT 0
  -- outcome, denormalised so the list page needs no aggregate scan
  summary             jsonb NOT NULL DEFAULT '{}'
  error               text
  queued_at, started_at, finished_at  timestamptz
  INDEX (status, queued_at)

backtest_signals            -- mirrors intraday_signals' meaningful columns
  id, run_id FK, instrument_id FK, trading_date, setup_key, kind, direction,
  strategy, state, regime, score, quality, scoring jsonb,
  entry_low, entry_high, invalidation_level, target1, target2,
  risk_paise, reward_paise, risk_reward, cost_paise, net_reward_paise,
  net_risk_paise, net_risk_reward, reference_price,
  trigger_minutes, setup_minutes, trend_minutes,
  indicator_snapshot jsonb, factors jsonb, reasons jsonb, events jsonb,
  detected_at, triggered_at, ended_at, end_reason
  INDEX (run_id, trading_date), INDEX (run_id, score DESC)

backtest_trades             -- mirrors paper_trades
  id, run_id FK, signal_id FK backtest_signals, instrument_id FK, trading_date,
  kind, strategy, direction, regime, score, quality,
  entry_at, entry_price, exit_at, exit_price, exit_reason,
  gross_paise, cost_paise, net_paise, r_multiple,
  max_favourable, max_adverse, bars_held, reached_target2
  UNIQUE (signal_id), INDEX (run_id), INDEX (run_id, score)
```

Two deliberate divergences from the live schema:

- **Factors, reasons and events are `jsonb` columns, not child tables.** A live
  signal has a "why?" page that queries them; a backtest signal is read in bulk.
  Four tables per run would be 4× the write volume for no read benefit — and hard
  rule 8 is still satisfied, because the breakdown *is* stored and *is* rendered
  from storage.
- **No partial unique index on live setups.** A backtest run has no concept of
  "currently live", and reusing `intraday_signals_live_idx` is precisely what
  would make a backtest collide with the live feed.

**Retention.** `backtest_signals`/`backtest_trades` are the only tables that grow
per experiment. A 250-session, 50-symbol run at ~2 trades/session is ~500 trades
and a few thousand signals — trivial. Twenty runs a week for a year is not. A
`pnpm backtest:prune --keep 50` (mirroring the existing `pruneIntradaySignals`)
deletes all but the newest N runs, cascading. Summary rows are kept forever.

---

## 9. Backtesting engine design

### 9.1 The harness (new, pure, in `packages/core`)

The single fix for G1/G2 and the anti-divergence mechanism. It contains the loop
that today exists twice — once in `apps/worker/src/jobs/intraday-signals.ts` and
once, differently, in `scripts/backtest-intraday.ts`.

```ts
// packages/core/src/intraday/harness.ts   — PURE (hard rule 1)

/** Everything one symbol needs at one instant. No I/O to obtain it. */
export interface SymbolSessionData {
  readonly symbol: string;
  readonly sector: string | null;
  readonly minute: readonly Bar[];      // today, full session
  readonly history: readonly Bar[];     // prior sessions, warm-up
  readonly daily: readonly Bar[];
  readonly volumeProfile: readonly number[];
  readonly previousClose: number | null;
}

export interface CycleInput {
  readonly at: Date;
  readonly symbols: readonly SymbolSessionData[];
  readonly benchmark: BenchmarkSessionData | null;   // fixes G2
  readonly live: readonly LiveSignal[];              // fixes G1
  readonly recentlyEnded: readonly EndedSetup[];
}

export interface CycleOutput {
  readonly evaluations: readonly IntradayEvaluation[];
  readonly created: readonly SignalCreation[];
  readonly updated: readonly SignalUpdate[];
  readonly events: readonly SignalEvent[];
  readonly rejections: ReadonlyMap<string, number>;
}

export function runCycle(input: CycleInput, config: IntradayConfig): CycleOutput;
```

`runCycle` does exactly what `execute()` in the worker does between loading and
persisting: truncate each series at `at`, compute breadth and sector means from
the *same* symbols being evaluated, build the market context, call
`evaluateIntraday`, call `transition`. Nothing else.

Then:

- `apps/worker/src/jobs/intraday-signals.ts` becomes **load → `runCycle` → persist**.
  It loses roughly 120 lines of analysis-adjacent code and gains nothing.
- The backtest runner is **load the whole session once → `runCycle` per cycle
  stamp, carrying `live` in memory → grade → persist to backtest tables**.

The live-signal state that the worker reads from Postgres each cycle is held in a
plain `Map` by the backtester. That is the whole difference.

### 9.2 The bar source

```ts
// packages/backtest/src/sources/index.ts
export interface BarSource {
  readonly id: 'stored' | 'archive';
  readonly datasetId: string | null;
  /** Trading dates with usable data in [from, to]. */
  availableSessions(from: Date, to: Date): Promise<readonly string[]>;
  /** One session for these instruments. Full session, not truncated. */
  sessionBars(date: string, instrumentIds: readonly number[]): Promise<Map<number, Bar[]>>;
  /** Warm-up: prior N sessions ending before `date`. */
  priorBars(date: string, instrumentIds: readonly number[], sessions: number): Promise<Map<number, Bar[]>>;
  dailyBars(date: string, instrumentIds: readonly number[], limit: number): Promise<Map<number, Bar[]>>;
}
```

`StoredBarSource` wraps `getMinuteBarsForInstruments` / `getDailyBarsForInstruments`
verbatim. `ArchiveBarSource` opens one `.arrow` file per date. Both return the
same `Bar`, so nothing downstream can tell them apart — which is the point, and
which is what makes §11.1's cross-validation meaningful.

### 9.3 Execution lifecycle of one run

```text
                         POST /api/backtests
                         or `pnpm backtest:run`
                                  |
                                  v
                             +---------+
                             | queued  |<----------------+
                             +----+----+                 |
        worker claims it          |                      | worker restarted
        SELECT .. FOR UPDATE      v                      | mid-run: resume
        SKIP LOCKED          +---------+                 | from sessions_done
                             | running |-----------------+
                             +----+----+
              per session:        |
              load . replay ------+   one transaction per session:
              grade . persist     |   results + sessions_done bump together
              bump progress ------+
                                  |
             +--------------------+--------------------+
             v                    v                    v
       +-----------+        +----------+        +-----------+
       | succeeded |        |  failed  |        | cancelled |
       | summary   |        | error    |        | partial   |
       | written   |        | recorded |        | kept and  |
       +-----------+        +----------+        | labelled  |
                                                +-----------+

  There is NO queue infrastructure. The backtest_runs table IS the queue.
  Resume is free because progress and results commit in the same transaction.
```

Resume is per-session and free: a session's results are written in one
transaction, `sessions_done` is bumped in the same transaction, and a restart
re-reads `sessions_done` and continues. There is **no queue infrastructure** —
the `backtest_runs` table is the queue, which is the whole reason not to add
Redis (`CLAUDE.md`).

### 9.4 Per-session algorithm

```
load  session bars (all symbols, full day)      1 read
      prior-session bars (warm-up + profile)    1 read, cached across dates
      daily bars                                 1 read, cached
      benchmark + banking + volatility           1 read
build volume profiles                            pure
live  = empty Map
for stamp = open+warmup … close-noNewSignals step cycleMinutes:
    truncate every series to bars closed at `stamp`   (binary search, then slice)
    out = runCycle({at: stamp, symbols, benchmark, live, recentlyEnded}, config)
    apply out.created / out.updated to `live`
    for each signal that just entered a triggered state:
        trade = resolvePaperTrade({..., bars: fullSessionMinutes, forceExitAt})
        if trade !== null: record
persist signals + trades + rejection census in ONE transaction
```

Two details that are easy to get wrong and are already right in the existing
scripts, so they must be preserved:

- `resolvePaperTrade` is given the **full session's** bars, not the truncated
  ones. That is correct and is not lookahead: the trade is *resolved* forward from
  a trigger that was decided on truncated data. The decision and the outcome use
  different windows on purpose.
- Truncation is `bar.timestamp + 60_000 <= stamp` — the minute must have *closed*.
  `upTo()` in `scripts/backtest-intraday.ts` already does this with a binary
  search; lift it, don't re-derive it.

---

## 10. Performance and scalability

### 10.1 Measured, not guessed

I benchmarked `evaluateIntraday` on this machine at full depth — 5 warm-up
sessions of 1m history (1,875 bars), a full 375-bar session, 40 daily bars, a real
volume profile, all five strategies reached, scoring reached (rejections were
cost-floor rejections, i.e. the deep path ran).

```
555 evaluations · 1,298 ms · 2.34 ms per evaluation · heap 15 MB
```

**Assumptions behind every number below:** this laptop, single-threaded Node 22,
50-symbol universe, 3-minute cycles → 111 cycles per session, synthetic bars
whose data-quality gates all pass (a real session with gated symbols is *faster*,
since gates return before the strategies run). Your VPS may differ by ±2×.

| Scope | CPU | Plus I/O | Practical |
|---|---|---|---|
| 1 symbol, 1 session | 111 × 2.34 ms ≈ **0.26 s** | — | instant |
| 50 symbols, 1 session | ≈ **13 s** | 4 batched Neon reads, ~1–3 s cold | **~15–20 s** |
| 50 symbols, 20 sessions | ≈ 4.3 min | prior/daily cached across dates | **~5 min** |
| 50 symbols, 250 sessions (1 yr) | ≈ 54 min | | **~60–75 min**, single-threaded |

**So: one session in ~15 seconds, a month in ~5 minutes, a year in about an
hour.** The brief's goal — "test a new algorithm within minutes rather than
waiting for the market" — is met at the *month* scale today and at the *year*
scale after Phase 12.

### 10.2 The answers to §15

- **Sync or background?** Background, in `apps/worker`. A 15-second request is
  tolerable; a 5-minute one is not, and Netlify's function timeout would kill it
  regardless. `apps/web` writes a `queued` row and polls.
- **Results in the database?** Yes — trades and signals are small and the value is
  entirely in comparing runs later.
- **Raw ticks in the database?** No. §2.2, §6.1.
- **RAM?** One session, 50 symbols: today's bars 18.7k + warm-up ~94k + daily 2k
  ≈ 115k `Bar` objects. At JS object overhead that is roughly 15–25 MB of live
  data, and measured heap for a single symbol's full working set was 15 MB. Budget
  **256–512 MB** per backtest process. Tick compilation is `O(symbols)` by
  construction (§7.3) and is bounded by the Arrow reader's batch size, not by file
  size — a 2 GB tick file does not need 2 GB of RAM.
- **CPU?** One core saturated per run. Sessions are embarrassingly parallel by
  date; Phase 12 shards them across `node:worker_threads` (cores − 1). Do not
  parallelise *within* a session — the live-signal state is sequential.
- **Concurrent backtests?** One at a time by default (`SELECT … FOR UPDATE SKIP
  LOCKED` with a concurrency cap of 1), because the worker also runs the live
  cycle every 3 minutes and starving it is the one unacceptable outcome. During
  market hours the runner should yield: check `sessionRegime` and pause while the
  market is open, or run with an explicit `--during-market` override.
- **Monitoring?** `backtest_runs.sessions_done / sessions_total`, updated per
  session, is the progress bar. Same logger as every other job
  (`apps/worker/src/log.ts`).
- **Failure/resume?** §9.3. Per-session transactions make resume free.

### 10.3 Where the time actually goes, and what to do first

The 2.34 ms is dominated by `buildFrame` — bucketing three timeframes and running
eight indicators over ~2,000 warm-up bars, **repeated from scratch every cycle**.
111 cycles per symbol per session re-derive nearly identical series 111 times.
That is the single largest available speed-up (an incremental frame, or a cached
warm-up prefix), and it is worth roughly an order of magnitude. **It is
deliberately not in Phase 1**: it is an optimisation of pure code with exact
expected output, so it can be introduced later behind a byte-equality test against
the current implementation. Correctness of the harness first, speed second.

---

## 11. Validation strategy

This is the section that decides whether any of the rest is worth running.

### 11.1 Archive vs provider — proves the ingestion pipeline

For every trading date present in **both** `minute_candles` and the archive,
compare bar-for-bar: `open/high/low/close` must match exactly in paise, `volume`
within a stated tolerance (feeds differ on auction prints). Report per-date max
divergence into `historical_sessions.provider_max_divergence`.

This single test catches nearly every compile bug there is: wrong timezone (bars
shift by a fixed offset), wrong bucket origin (every bar shifts by a fraction of a
period), cumulative-vs-incremental volume (volume off by orders of magnitude),
rupees-vs-paise (100×), off-by-one on bar-open-vs-bar-close timestamps. **It
requires no judgement and no market knowledge.** Ingestion is not "done" until it
passes on every overlapping date.

### 11.2 Live vs replay parity — proves the harness

For a trading date the live worker actually ran, replay it into the backtest
tables and diff against `intraday_signals`:

- same set of `(instrument, setup_key)`;
- same `score` for each, within 0;
- same `triggered_at` to the cycle;
- same resulting `paper_trades` `r_multiple`.

Today this diff would **fail**, and the failures are exactly G1 and G2. That is
the value of writing it first: it turns "the backtester might be measuring
something different" into a named, reproducible, fixable difference. After the
harness lands it must pass, and it becomes a CI-able regression test against
future divergence.

Note one legitimate source of difference that must be allowed for: the live path
evaluates at wall-clock cycle boundaries with whatever bars had been ingested;
the replay evaluates at exact 3-minute stamps. Because `buildFrame` truncates to
the last *closed* trigger bar, these agree whenever ingestion was not lagging —
and where they disagree, that is a real ingestion-lag finding worth surfacing.

### 11.3 Determinism

Run the same backtest twice; results must be byte-identical. The engine is pure,
so a difference means hidden state has crept in — a `Date.now()`, a shared mutable
buffer, an iteration-order dependence. Cheap test, catches a whole class of bug.

### 11.4 Lookahead audits

The existing defence is `frame.ts`'s `cutoff`, plus `bucketBars` refusing to emit
an unfinished bucket, plus `resolvePaperTrade` filling at the next open. Add an
active test rather than trusting the comments:

- **Poisoned-future test.** Take a session, append a bar after the cutoff with an
  absurd price, re-evaluate, assert **byte-identical** output. Repeat at several
  cycle stamps. Any difference is a lookahead leak, named and located.
- **Truncation test.** Assert `max(bar.timestamp) + timeframe <= cutoff` for
  every series the frame exposes.
- **Fill test.** Assert `trade.entryAt > signal.triggeredAt` for every recorded
  trade in every run — a cheap invariant that would have caught a whole family of
  bugs.

### 11.5 What 60 sessions can and cannot tell you

D10 starts with ~60 sessions. That is the right scope for **building and proving
the pipeline** and the wrong scope for **trusting a tuning decision**, and the
difference matters.

A 50-symbol universe over 60 sessions, at the current filters, plausibly produces
somewhere in the low hundreds of trades. The existing report already prints the
consequence: at 100 trades the hit rate carries a margin of error of roughly
**±10 percentage points**, which is wider than most of the differences between
strategy buckets it displays.

So over this window:

| Question | Answerable at 60 sessions? |
|---|---|
| Does the archive agree with the provider, bar for bar? | **Yes** — it is exact, not statistical |
| Does a replay reproduce a live session exactly? | **Yes** — exact |
| Is the pipeline deterministic and free of lookahead? | **Yes** — exact |
| Is overall expectancy positive or negative? | **Roughly.** Direction, not magnitude |
| Is strategy A better than strategy B? | **No.** The gap will be inside the error bar |
| Should I change a threshold from 70 to 75? | **No.** This is exactly the tuning the house rule forbids |

The first three are what Phases 5–8 exist to establish, and they need no sample
size at all. Deepening toward the full 3+ years (D6) is what turns the last three
from "no" into "maybe" — and it is worth doing only once the pipeline has passed
the exact tests.

### 11.6 Bias inventory

| Bias | Present today? | Mitigation |
|---|---|---|
| Look-ahead | Defended in `frame.ts`, `bars.ts`, `paper.ts` | §11.4 makes the defence testable |
| Future data leakage via context | Defended: breadth/sector computed at each instant in the backtester, not day-end | keep in `runCycle`; assert in parity test |
| **Survivorship** | **Yes (G7), and not fixable** — no dated constituent list is available (D7), and the archive spans 3+ years (D6), which is long enough for membership to have changed materially | Cannot be removed, so it is **labelled**: every run stamps `universe: undated`, the UI shows the caveat beside the headline expectancy, and long-window results are never presented without it. Phase 4 builds the dated path so it can be closed later if a source appears. |
| **Holidays as missing data** | **Yes (G8)** | `isTradingDay()` in `packages/shared` from a `config/holidays.yaml`; `availableSessions()` consults it |
| Incorrect candle construction | Guarded by `isCoherent`, bucket origin, check constraints | §11.1 |
| Timestamp handling | TIMESTAMPTZ UTC everywhere; IST only at boundaries | §11.1 catches offsets |
| Unrealistic fills | Already pessimistic in `paper.ts` (next open, stop wins ties, slip guard) | do not relax; §7.4 measures the cost of the pessimism separately |
| Ignoring slippage / charges | Already modelled in `costs.ts` on both legs, both sides | keep every published R:R net |
| Duplicate signals | `dropWeakerDuplicates` + `transition` cooldowns | fixing G1 makes the backtest inherit them |
| Overfitting to a small sample | Report already prints margin of error | keep enforcing "do not tune on a difference smaller than the MoE" |

---

## 12. API, worker and UI

### 12.1 API

Following `apps/web/src/app/api/*` conventions — Zod at the boundary, delegate to
`apps/web/src/server/*`, never call the provider, never run the engine.

| Route | Method | Purpose |
|---|---|---|
| `/api/historical/coverage` | GET | sessions available per source, with validation verdicts — powers the availability panel |
| `/api/backtests` | GET | list runs, newest first, with summary |
| `/api/backtests` | POST | enqueue: `{from, to, universe?, barSource, datasetId?, cycleMinutes?, overrides?, label?}` → inserts `queued` |
| `/api/backtests/:id` | GET | run row + progress + summary |
| `/api/backtests/:id/trades` | GET | paginated trades, filterable by strategy/score/regime/symbol/exit |
| `/api/backtests/:id/signals` | GET | signals, including the ones that never traded |
| `/api/backtests/:id/analysis` | GET | pre-bucketed by score band / strategy / regime / direction / exit / session / symbol, each with margin of error |
| `/api/backtests/:id/cancel` | POST | sets `cancelled` |

`POST /api/backtests` is the only write `apps/web` gains. It writes a *job
request*, never a signal — the "web only reads" rule is about the signal tables
and is preserved exactly.

### 12.2 Worker

Two new jobs in `apps/worker`, alongside the existing five:

| Job | Schedule | Notes |
|---|---|---|
| `backtest-runner` | `*/1 * * * *`, `protect: true` | claims one `queued` run, executes it, yields while the market is open unless overridden |
| `archive-sync` | manual / `0 20 * * *` | downloads and compiles new archive files |

Both go through `createScheduler`, so overlap protection, error swallowing and
drain-on-shutdown come for free.

### 12.3 UI

```text
  /backtests
     run history . status . headline expectancy
        |
        v
  [ New run ]
        |
        v
  source: stored | archive        date range . universe . cycle minutes
                                  score floor . stop/target ATR overrides
        |
        v
  availability panel      per date:   [ok] usable   [!] incomplete   [x] missing
        |
        +-- gaps? --> [ Fetch missing ] --> backfill:minutes  |  archive-sync
        |
        v
  [ Run backtest ]
        |
        v
  progress        sessions done / total . evaluations . signals . trades
        |
        v
  /backtests/:id
     |- summary       trades . hit rate +/- margin of error . expectancy R
     |                profit factor . max drawdown R . breakeven hit rate
     |- buckets       score band . strategy . regime . direction . exit
     |                session . symbol        (each with its own MoE)
     |- trade list    sortable, filterable
     |- rejection census   why setups did NOT become trades  <- most used panel
     |- signal detail factors . reasons . timeline . chart with levels
     `- compare       against another run
```

Reuse, not new components: `PerformanceView`, `PaperBucket`, `MetricCard`,
`DataTable`, `SignalCard`, `SignalDetail`, `SignalTimeline`, `SignalChart` all
exist and already render exactly these shapes. The backtest DTO should be *shaped
like* `PaperResultsDto` (`apps/web/src/server/paper-trades.ts`) so the same
components serve both, with a run-selector on top.

Vocabulary stays technical throughout, per `CLAUDE.md`: "Technical entry zone",
"Invalidation level", "Bullish setup". BUY/SELL labels a direction and nothing
else. No order-shaped affordance appears anywhere on these pages.

The rejection census deserves emphasis: it is the most useful panel in the
existing report and has no equivalent in the live UI. "Why did this change produce
fewer signals" is the question you will ask most often, and only this panel
answers it.

---

## 13. Security, error handling, logging

**Security.** The Telegram session string is a full-account credential — strictly
more powerful than the Fyers token, which is scoped and expires daily. It lives in
`.env` (gitignored), is never logged, never sent to the browser, and never reaches
`apps/web`. Archive sync runs only in `apps/worker`. The downloader reads exactly
one configured peer. Archive files are treated as **untrusted input**: paths from
zip members are sanitised against traversal (`../`), member counts and expanded
sizes are capped, and a member that fails validation aborts that file rather than
the run. Backtest routes sit behind the existing Clerk middleware like every other
route. Netlify's secret scanner already covers `.env` values; `TELEGRAM_*` must
never be added to `SECRETS_SCAN_OMIT_KEYS`.

**Error handling.** Follows what the repo already does: one bad symbol never costs
the other forty-nine (`ingest-intraday.ts`'s per-symbol try/catch); one bad session
fails that session and records the reason without failing the run; an
unrecoverable error writes `backtest_runs.error` and sets `failed` — never a
silent partial success. Archive files that fail validation are marked `corrupt`
and **not retried in a loop**.

**Logging.** `apps/worker/src/log.ts`, `log.child('backtest')` /
`log.child('archive')`. Per session: date, symbols, evaluations, signals, trades,
duration. Per file: name, size, hash prefix, verdict. The counters that matter
live in `backtest_runs` as columns so the UI reads them rather than scraping logs.

---

## 14. Phased plan

Each phase is independently valuable and independently shippable. **Phases 1–3
require no Telegram, no new dependency, and no new data**, and they deliver most
of the brief's actual goal.

---

### Phase 0 — decisions (no code)

**Objective.** Settle the three things that change the design.

1. ~~§2.1 — money/quantity/positions.~~ **DECIDED (D1):** R-multiples and
   per-share paise; `CLAUDE.md` unchanged.
2. Feather version — inspect one file's magic bytes. `ARROW1` ⇒ v2, readable in
   Node. Otherwise Phase 6 needs a conversion step. **OPEN.**
3. Archive provenance — which peer, what file naming, what tick schema, what
   symbol vocabulary, whether volume is cumulative or incremental. **OPEN.**

Also decided: **D2** start with Phases 0-3; **D3** the archive lives on this Mac;
**D4** `telegram`, `apache-arrow` and `yauzl` are approved.

**Output.** Answers recorded in this document. **Risk of skipping:** Phases 4–5
get designed against a guess.

---

### Phase 1 — isolate and correct the existing backtester ⭐ *highest value*

**Objective.** Make the backtest measure the same system the live path runs, and
stop replays contaminating live results.

**Affected.** `scripts/backtest-intraday.ts`, `scripts/replay-session.ts`.
**New.** `packages/db/src/schema/backtest.ts`,
`packages/db/src/repositories/backtest.ts`, migration `0010_*`.
**Database.** `backtest_runs`, `backtest_signals`, `backtest_trades` (§8.2).

**Work — DONE, pending migration.**
- ~~Add the three tables.~~ `packages/db/src/schema/backtest.ts`,
  `repositories/backtest.ts`, migration `0010_watery_hedge_knight.sql`.
- ~~Route `backtest-intraday.ts` output into them~~ with a `backtest_runs` row
  recording strategy version, git revision, universe, window, source, overrides,
  and `universe_dated = false`.
- ~~Fix **G1**~~ — `transition()` now runs in the backtester with live-signal
  state held in an in-memory map, exactly as the worker holds it in Postgres.
- ~~Fix **G2**~~ — benchmark, banking-index and VIX series are loaded and
  sliced per cycle, so `buildMarketContext` receives what the live path receives.

**Deviation from the original plan, deliberate.** `replay-session.ts` was to get
an `--isolated` mode writing to the backtest tables. Truly isolating it requires
the sink abstraction, which is Phase 2/3 work — routing it through the backtest
tables in Phase 1 would have meant changing `runIntradayCycle`, i.e. touching the
live path, which is exactly what Phase 1 exists to avoid. Instead it now
**refuses to run without `--write-live`**, naming the contamination it would
cause and pointing at `pnpm backtest:intraday` for the isolated equivalent. The
destructive default is gone; the isolated *database-path* replay arrives with the
sink.

**Depends on.** Nothing. **Risks.** G1 will change measured expectancy — the
lifecycle suppresses setups the previous backtest counted. That is a *correction*,
not a regression, but historical numbers will move; label the change in the run
record. **Tests.** Determinism (§11.3); poisoned-future (§11.4); backtest tables
never receive a live `tradingDate` collision. **Output.** A backtest that is
reproducible and measures the live system, with results that cannot pollute
`/signals/performance`.

---

### Phase 2 — extract the shared harness

**Objective.** One definition of a cycle; make divergence structurally impossible.

**New.** `packages/core/src/intraday/harness.ts` (§9.1),
`packages/core/src/intraday/harness.test.ts`.
**Modified.** `apps/worker/src/jobs/intraday-signals.ts` (becomes load →
`runCycle` → persist); `scripts/backtest-intraday.ts` (calls `runCycle`).
**Database.** None. **Depends on.** Phase 1.

**Risks.** This touches the live signal path — the one thing the brief says not to
break. Mitigation: the parity harness (§11.2) is written **before** the refactor,
recording the current live output for a stored date as a golden fixture; the
refactor must reproduce it byte-for-byte. **Tests.** Golden-fixture parity; the
existing 502 tests; a full `replay:session` diff before and after.
**Output.** Live and backtest provably share one cycle definition.

---

### Phase 3 — the backtest runner as a worker job, plus API and UI

**Objective.** Run a backtest without a terminal, and read the result in the app.

**New.** `apps/worker/src/jobs/backtest-runner.ts`;
`apps/web/src/server/backtests.ts`; `apps/web/src/app/api/backtests/**`;
`apps/web/src/app/backtests/**`; `apps/web/src/components/backtests/*`.
**Modified.** `apps/worker/src/index.ts` (register the job);
`apps/web/src/lib/navigation.ts` (add the entry).
**Database.** None beyond Phase 1. **Depends on.** Phase 2 for the runner; the READ side depends on nothing and
shipped first.

**Status — read side DONE, runner still to come.**
- ~~`apps/web/src/server/backtests.ts`~~ — shapes results as `PaperResultsDto`,
  the exact DTO `/signals/performance` renders, so both pages are summarised by
  the same `summarisePaperTrades` and cannot disagree about what a number means.
- ~~`GET /api/backtests`, `GET /api/backtests/:id`~~
- ~~`/backtests` and `/backtests/:id`~~ — run list as a lab notebook (conditions
  beside every result), and a detail page with headline metrics, bucket tables,
  the rejection census and the full trade list.
- ~~Nav entry.~~
- **Not yet:** `POST /api/backtests` (enqueue), `apps/worker/src/jobs/backtest-runner.ts`,
  cancel, live progress. Runs are still started from the terminal, which is why
  `POST` is deliberately absent rather than stubbed.

Two honesty rules are enforced in the UI, both load-bearing: a bucket under
`MIN_TRADES_PER_BUCKET` renders dimmed and badged "too few to read" and is never
ranked, and an undated universe raises a warning banner on the run rather than a
footnote.

**Risks.** The runner starving the live cycle — mitigated by the market-hours
yield (§10.2). **Tests.** Run lifecycle including resume after a kill mid-run;
API contract tests; the UI renders no statistic it computed itself.
**Output.** `/backtests`: read expectancy by bucket with margins of error. **At
this point the brief's core goal is met for every date the provider can supply.**

---

### Phase 4 — prerequisites for deep history

**Objective.** Make multi-month backtests honest before there is multi-month data.

**New.** `config/holidays.yaml`; `isTradingDay()` in `packages/shared/src/time.ts`;
dated constituent lists in `config/indices.yaml`;
`apps/worker/src/universe.ts` gains `constituentsAsOf(date)`.
**Database.** None. **Depends on.** Phase 3 (or parallel).

**Risks.** Historical NIFTY 50 membership needs a source; if unavailable,
`backtest_runs.universe` must at minimum record that the universe was
*undated*, so the survivorship caveat travels with the result rather than being
forgotten. **Output.** G7 and G8 closed, or explicitly labelled on every run.

---

### Phase 5 — Telegram downloader

**Objective.** Files on disk, catalogued, never downloaded twice.

**New.** `packages/historical/` (package scaffold);
`src/telegram/{client,downloader,login}.ts`; `scripts/telegram-login.ts`;
`scripts/archive-sync.ts`; `packages/db/src/schema/historical.ts`; migration `0011_*`.
**Database.** `historical_datasets`, `historical_files`.
**Dependencies.** `telegram` (GramJS) — **a new dependency needing your approval**
under the architecture guardrails.
**Depends on.** Phase 0 decision 3.

**Risks.** MTProto flood-waits; session expiry; a 2 GB file mid-download. All
handled by resumable chunked downloads with backoff. **Tests.** Downloader against
a fake transport (the pattern `packages/fyers/src/__tests__/stream.test.ts`
already uses); hash-duplicate detection; resume from a `.part`.
**Output.** `pnpm archive:sync` fetches only what is missing.

---

### Phase 6 — zip/feather readers and the tick→1m compiler

**Objective.** Ticks become validated 1m bars on disk.

**New.** `packages/historical/src/archive/{validate,extract,feather,compile,index}.ts`;
`scripts/archive-compile.ts`.
**Database.** `historical_sessions`.
**Dependencies.** `apache-arrow`, `yauzl` (streaming unzip) — **approval needed**.
**Depends on.** Phase 5.

**Risks.** Feather v1 (Phase 0); cumulative-vs-incremental volume; symbol mapping
gaps; timezone. Every one of them is caught by Phase 7. **Tests.** Compiler
fixtures — a hand-written tick sequence with a known 1m result, including a minute
with no ticks, a minute with one tick, and a session boundary; paise conversion;
IST bucket origin. **Output.** `data/archive/bars/<dataset>/<date>.arrow` plus a
`historical_sessions` row per date.

---

### Phase 7 — cross-validation ⭐ *the phase that makes the archive trustworthy*

**Objective.** Prove archive bars equal provider bars where both exist.

**New.** `scripts/archive-verify.ts`;
`packages/historical/src/archive/crossvalidate.ts`.
**Database.** writes `provider_overlap_bars`, `provider_max_divergence`.
**Depends on.** Phase 6.

**Risks.** None — this phase only reports. **Its absence** is the risk: without
it, every archive-based backtest result is unfalsifiable. **Tests.** The
divergence report itself, run over every overlapping date; a deliberate off-by-one
injected into a fixture must be detected. **Output.** A per-date agreement report.
No archive date is `usable` until it passes.

---

### Phase 8 — `ArchiveBarSource`

**Objective.** Backtest from archive bars.

**New.** `packages/backtest/src/sources/{stored,archive}.ts` and the `BarSource`
interface (§9.2).
**Modified.** `backtest-runner.ts` selects a source; `backtest_runs.bar_source` /
`dataset_id` recorded; the API and UI gain the source selector and the archive
availability panel.
**Depends on.** Phases 3 and 7.

**Risks.** A subtle source difference producing different results — which is
precisely what Phase 7 exists to exclude, and what `bar_source` on the run row
makes visible after the fact. **Tests.** For an overlapping date, a backtest from
`stored` and one from `archive` must produce **identical** signals and trades.
That is the strongest end-to-end test in the whole plan. **Output.** Years of
history, same engine, same grader, same tables.

---

### Phase 9 — comparison and analysis

**Objective.** Answer "did this change help?" rather than "what happened?"

**New.** run-comparison view; per-symbol and per-day buckets; equity curve in R;
max drawdown in R; concurrency profile; a **parameter sweep** runner that enqueues
N runs across a grid.
**Depends on.** Phase 8.

**Risks.** Sweeps are how overfitting happens. Mitigation is already the house
style: every figure carries its margin of error, and the sweep view must refuse to
rank runs whose difference is inside it. **Output.** Tuning with a statistical
guard rail.

---

### Phase 10 — performance

**Objective.** A year in minutes, not an hour.

**Work.** Incremental frame construction / cached warm-up prefix (§10.3, worth
~10×) behind a byte-equality test; `node:worker_threads` sharded by date; an Arrow
bar cache for `stored` sessions too.
**Depends on.** Phases 8 and 11 (a full regression suite must exist first).
**Risks.** Optimising pure code is safe *only* against exact-output tests. Do not
start without them. **Output.** Same numbers, far faster.

---

### Phase 11 — the standing regression suite

**Objective.** Divergence and lookahead cannot come back.

Runs continuously from Phase 2 onward, not at the end: parity (§11.2),
determinism (§11.3), poisoned-future (§11.4), fill invariants, archive-vs-stored
equality (Phase 8), archive-vs-provider divergence (Phase 7).

---

### Phase 12 — tick-aware grading *(optional)*

`resolveWithTicks` alongside `resolvePaperTrade`, reporting both so the cost of
the pessimistic assumption is measured rather than assumed (§7.4). Never replaces
the conservative baseline.

---

## 15. Rollout, risks, and what could go wrong

**Rollout.** Phases 1–4 touch no live behaviour except the Phase 2 refactor, which
is gated on golden-fixture parity. The worker jobs are additive and disabled until
registered. `minute_candles` and the live signal tables are never written by any
new code path. Roll back by not registering the jobs — no data migration to
reverse.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Phase 2 refactor breaks the live cycle | Medium | High | Golden-fixture parity written first; `replay:session` diff before/after; the refactor moves code without changing it |
| Archive bars are subtly wrong | **High** — this is the default outcome for tick compilation | High | Phase 7 is mandatory and blocking; `usable` is earned, not assumed |
| Feather v1 files | Medium | Medium | Phase 0 check; conversion pass if needed |
| Telegram session/flood limits | Medium | Low | Resumable chunked downloads, backoff, single peer |
| Fixing G1 changes historical numbers | **Certain** | Medium | Expected; recorded in the run row; the *old* numbers were the wrong ones |
| Survivorship bias in long backtests | High | High | Phase 4; failing that, the caveat is stamped on every run |
| Overfitting to sweeps | High | High | Margin of error on every figure; sweep view refuses to rank inside it |
| Backtest starves the live cycle | Low | High | Market-hours yield; concurrency cap 1 |
| Scope creep toward a trading system | Medium | High | §2.1; no quantity, no capital, no orders, ever |

---

## 16. Future enhancements

Walk-forward / out-of-sample splitting; regime-conditional parameter sets;
Monte-Carlo resampling of the trade sequence for drawdown confidence intervals;
per-symbol suitability scoring; a "missed opportunity" scan (large clean moves
with no signal, which is the mirror of the rejection census); an archive-fed
*daily* backtest for the swing engine, which currently has no equivalent tooling
at all.

---

## Appendix A — what is reused, modified, created, untouched

**REUSE VERBATIM.** All of `packages/core/src/indicators`; all of
`packages/core/src/intraday` except the new harness; `packages/shared`;
`packages/market-data`; `packages/db` candle repositories; `registerStrategy`;
`apps/worker/src/{scheduler,log,context,intraday-config,universe}.ts`;
`apps/web/src/components/{signals,data-display,ui}/*`; the reporting half of
`scripts/backtest-intraday.ts`.

**MODIFY.** `apps/worker/src/jobs/intraday-signals.ts` — analysis loop moves into
the harness; loading and persistence stay (Phase 2). `scripts/backtest-intraday.ts`
— call the harness, write to the backtest tables (Phases 1–2).
`scripts/replay-session.ts` — isolated by default (Phase 1).
`apps/worker/src/index.ts` — register two jobs. `apps/web/src/lib/navigation.ts` —
one entry. `packages/shared/src/time.ts` — `isTradingDay()` (Phase 4).
`apps/worker/src/universe.ts` — dated constituents (Phase 4).

**NEW.** `packages/core/src/intraday/harness.ts`; `packages/backtest/`;
`packages/historical/`; `packages/db/src/schema/{backtest,historical}.ts` and
their repositories; `apps/worker/src/jobs/{backtest-runner,archive-sync}.ts`;
`apps/web/src/server/backtests.ts`; `apps/web/src/app/api/backtests/**`;
`apps/web/src/app/backtests/**`; `config/{historical,holidays}.yaml`; migrations
`0010`–`0011`; scripts `telegram-login`, `archive-sync`, `archive-compile`,
`archive-verify`, `backtest-run`.

**DO NOT CHANGE.** `packages/fyers`, `packages/providers-fyers`; the
`MarketDataProvider` interface; `apps/worker/src/jobs/{ingest-intraday,ingest-daily,
compute-indicators,refresh-credential}.ts`; `apps/worker/src/jobs/paper-trades.ts`;
`packages/core/src/intraday/paper.ts` and `costs.ts`; `minute_candles`,
`daily_candles`, `intraday_signals` and children, `paper_trades`,
`strategy_versions`; `/signals`, `/signals/performance`,
`/api/intraday-signals`; the croner schedule for the live cycle.

## Appendix B — open questions for you

**Answered — see the decisions table at the top.** D1 R-multiples · D2 correctness
first · D3 this Mac · D4 three dependencies approved · D5 a channel/group ·
D6 3+ years · D7 no dated index list · D8 operator-run diagnostics.

**Still open. None of these block Phase 1.**

1. **The channel's `@name` or invite link.** Goes in `config/historical.yaml`.
   It is also the fence: the downloader reads that peer and nothing else.
2. **Feather version.** `ARROW1` in the first six bytes means v2 and pure-Node
   reading works. Anything else means Phase 6 needs a conversion step.
3. **Archive tick schema.** Column names; timezone of the timestamps; whether
   volume is cumulative-for-the-day or per-tick; ticker vocabulary (`RELIANCE`
   vs `NSE:RELIANCE-EQ` vs a numeric token); one file per trading day or one per
   day-and-symbol; symbol coverage; date range.
4. **Typical daily file size**, which decides the raw-tier retention policy in
   §6.2 — keep everything, keep a rolling window, or delete after verification.
