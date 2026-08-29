---
name: paper-trading
description: The paper-trading grader's pessimistic assumptions, the cost model, R-multiple/margin-of-error reporting, and the live-vs-backtest identity. Use when touching packages/core/src/intraday/paper.ts, costs.ts, apps/worker/src/jobs/paper-trades.ts, scripts/backtest-intraday.ts, scripts/replay-session.ts, or /signals/performance.
---

# paper-trading

`resolvePaperTrade` is the single grader used by both the live recorder and the
backtester — verified: `apps/worker/src/jobs/paper-trades.ts` and
`scripts/backtest-intraday.ts` both import the identical function from
`@equitywise/core`, which has exactly one implementation
(`packages/core/src/intraday/paper.ts`). There are not two similar graders to keep in
sync; there is one, called from two places.

## The four pessimistic assumptions — all real, all tested

Each one exists specifically because the honest version of the number is worse than the
naive one, and each has a dedicated test in `paper.test.ts` proving it, not just
incidental exercise:

1. **Fill is the next bar's OPEN**, never the entry zone or the trigger bar's close.
2. **A bar spanning both stop and target resolves as a STOP.** The stop check runs and
   returns before the target check — ambiguity resolves against the trade. Directly
   tested: a bar covering both levels asserts `exitReason === 'stop'`.
3. **A fill past the invalidation level is no trade at all** — the premise can die between
   trigger and fill; without this guard the case would score a fictitious loss on a setup
   that was never actually valid at fill time.
4. **A fill that already spent more than half the risk budget is no trade either**
   (`maxEntrySlipFraction`, default 0.5, tunable) — a real incident (a BAJFINANCE fill 207
   paise beyond entry, consuming 50 paise of a 257-paise budget) motivated this.

A change to `resolvePaperTrade` that weakens any of these needs its own test proving the
weakening is intentional — these four are exactly the assumptions that make the grader
"deliberately pessimistic" per CLAUDE.md, and a regression here silently inflates every
downstream expectancy number.

## The cost model is config-driven, not hardcoded

`costs.ts`'s `roundTripCost` models brokerage, STT (sell leg only), exchange fee, SEBI
fee, stamp duty (buy leg only), GST (levied only on brokerage+exchange+SEBI — not on
STT/stamp/slippage), and slippage — all as percent-of-turnover, not flat fees. Both the
live and backtest paths pass `costs: config.costs` (from `config/intraday.yaml`) into
`resolvePaperTrade`, not the package's `DEFAULT_COST_MODEL` fallback — that default exists
for tests and as the type's reference shape, not as what actually runs. Changing a rate
means editing `config/intraday.yaml`, and the YAML's own comment says it plainly: "these
decide which setups survive the filters above."

## R-multiple and margin of error

`server/paper-trades.ts` computes `marginOfErrorPoints` as `100 / √trades` — a normal
approximation to a binomial proportion's confidence interval, deliberately using the
worst-case variance (p=0.5, so SE = 0.5/√n) and doubling it for a rough 95% interval,
rather than the tighter Wilson interval or the sample's own observed variance. This is a
conscious choice to understate confidence rather than overstate it. `winRateStatus`
treats any edge over breakeven smaller than this margin as "too close to call" — don't
report a win-rate improvement as real without checking it clears this margin.

## Open trades are excluded from every rate, at the data level

Not a display choice: `server/paper-trades.ts` filters unresolved trades out of the array
*before* passing it to `summarisePaperTrades`, and `summarisePaperTrades` itself repeats
the same filter internally (`exitReason !== 'unresolved'`) — the exclusion happens twice,
by design. `hitRate`, `expectancyR`, `profitFactor`, every `by*` bucket — none of them
ever see an open trade. The open count is surfaced separately as "N still running, not
counted." A new performance metric must apply the same filter before computing anything,
not just before rendering.

## `backtest:intraday` vs `replay:session` — a real distinction, not just naming

- **`pnpm backtest:intraday`** (`scripts/backtest-intraday.ts`) calls the engine
  (`evaluateIntraday`, `resolvePaperTrade`, etc.) **directly in memory** against candles
  read straight from `@equitywise/db` — writes nothing to the database, reads only.
- **`pnpm replay:session`** (`scripts/replay-session.ts`) instead dynamically imports and
  calls the **actual worker job functions** (`runIntradayCycle`, `recordPaperTrades`) — the
  same functions the scheduler calls — so it exercises the real database write path,
  producing real signals, real factor breakdowns, real lifecycle events for the replayed
  date.

Use `backtest:intraday` for fast iteration over strategy changes across many sessions;
use `replay:session` when you need to verify the actual worker code path (including its
DB writes) reproduces the same result for one specific date. They are not interchangeable
— a bug that only exists in the worker's DB-writing glue, not in the pure engine, will
show up in `replay:session` and never in `backtest:intraday`.
