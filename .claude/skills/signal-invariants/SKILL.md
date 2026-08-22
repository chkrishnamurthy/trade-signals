---
name: signal-invariants
description: The eight load-bearing invariants of this NSE signal repo and the mechanism enforcing each — integer paise, closed candles, provider boundary, UTC timestamps, pure core, immutable candle history, versioned strategy config, persisted factor breakdowns. Read before writing or reviewing anything that touches a price, a timestamp, a candle, a strategy weight, or a provider call.
---

# Invariants

`CLAUDE.md` states these rules. This is the operational half: what enforces each one,
what it looks like when it breaks, and what to do when a task seems to require breaking it.

An **invariant** here is load-bearing in a specific sense: the code is built assuming it
holds, so a violation does not produce an error, it produces a plausible wrong number.
That is the whole danger. Treat a violation as a correctness defect, never as style.

## The eight

| # | Invariant | Enforced by | What a violation produces |
|---|---|---|---|
| 1 | `packages/core` is pure: data plus config in, result out | Convention only. Nothing fails the build. | Backtest and live path diverge. Every backtest result becomes unfalsifiable. |
| 2 | Signals read CLOSED candles; entry is the NEXT open | `BarsRequest.includeForming` defaults false, `now` is injected. Beyond the fetch, convention. | Lookahead bias. A backtest that prints profit the market never offered. |
| 3 | Prices are integer paise below the presentation layer | `assertPaise` in code; integer columns plus positivity and range-coherence CHECKs in `0002_guards.sql` | Sub-paise drift that compounds silently across a series. |
| 4 | Persist 1m and 1d only; derive the rest via `time_bucket` at 09:15 IST | Schema shape: `minute_candles` and `daily_candles` are the only candle tables, both hypertables | A persisted 5m table that disagrees with the derived one after any backfill. |
| 5 | Candle history is append-only; corporate actions apply on read | **Trigger.** `daily_candles_no_update` and `minute_candles_no_update` raise on UPDATE. DELETE stays allowed so a bad ingestion run can be rolled back wholesale. | Yesterday's chart changes shape. No way to reproduce a past signal. |
| 6 | Timestamps are TIMESTAMPTZ UTC; IST only at presentation | Column types. Every timestamp column in `0000_modern_hulk.sql` is `with time zone`. | A candle filed to the wrong session. Off-by-5:30 on every boundary comparison. |
| 7 | Strategy config is immutable and versioned | **Trigger.** `strategy_versions_no_update` raises on UPDATE. | A signal whose stated reasoning came from different weights than the ones stored. |
| 8 | Every signal persists its factor breakdown and indicator snapshot | `signal_factors` table; `SignalReport.factors` is required; score, strength, and bias ranges are CHECK-constrained | "Why this signal?" recomputes, and the explanation disagrees with the signal it explains. |

Rules 5, 6, and 7 have real teeth, and rule 3 is half-covered. **Rules 1, 2, and 8 rest on
convention alone**, and they are the three whose violation is hardest to see from the outside:
an impure core, a forming candle reaching the engine, and a UI that recomputes its own
explanation all produce plausible output. Check those three by reading, every time.

## Two guards worth knowing before you touch them

- **Broker independence** has a real guard: `packages/market-data/src/__tests__/boundary.test.ts`
  greps the tree for provider names on lines of code and fails on any file outside its
  `ALLOWED` list. When upstream code needs something only Fyers exposes, **widen
  `MarketDataProvider`**. Extending `ALLOWED` disables the guard for that path permanently.
  Details: call the Skill tool with "provider-boundary".
- **Money representation** has `assertPaise`, which throws on a non-integer. Reach for it
  wherever a number arrives from outside `packages/shared`.
- **The database guards** live in `packages/db/drizzle/0002_guards.sql`. A failing write
  there is the guard working. Resolve it by fixing the write, never by dropping the trigger
  or the constraint: both exist because the failure they prevent is silent.

## Where a float is legitimate

Integer paise governs *money*. Three things are ratios, not money, and stay floats:
`changePercent`, `rsi`, and `relativeVolume`. Indicator internals also accumulate in float
and round on output, because rounding at every step erases small moves through a long
smoothing factor. The invariant is that no fractional price leaves the module.

## Product vocabulary

This is decision support. The UI names technical observations: "Bullish setup",
"Breakout candidate", "Potential entry level", "Watch". `SignalDirection` already models
this correctly. Keep displayed numbers explainable: a strength value renders with the
factor breakdown that produced it.

## When a task appears to require breaking one

Report the conflict and stop. Name the invariant, the line that would violate it, and the
change to the design that would satisfy both. The author decides. An invariant relaxed
quietly during an unrelated task is how all six convention-only rules will eventually go.
