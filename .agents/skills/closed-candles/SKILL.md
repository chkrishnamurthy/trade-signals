---
name: closed-candles
description: Guard against lookahead bias when writing or reviewing the signal engine, a backtest, or any bar fetch. Use when the work touches BarsRequest, includeForming, bar indexing, entry/fill prices, or anything that decides at bar i.
---

# Closed candles

Hard rule 2, and the one whose violation is hardest to see: a signal may only read
**closed** bars, and the tradeable entry is the **next** bar's open.

Lookahead does not throw. It produces a backtest that prints profit the market never
offered, and the number looks better than the honest one, so nobody questions it.

## The three ways it gets in

1. **The forming bar reaches the engine.** `BarsRequest.includeForming` defaults to false
   and `now` is injected so "is the last bar still finished" stays testable
   (`packages/market-data/src/provider.ts`). A chart may pass `includeForming: true`.
   The engine path never does. Trace the actual call site rather than trusting the default.
2. **An index reaches `i` while deciding at `i`.** The decision at bar `i` may read
   indicator values at `i` (those are computed from closes at or before `i`, which is
   legitimate) but never a price at `i+1`, and never a "confirmation" from a later bar.
3. **The fill price is `close[i]`.** A signal generated on bar `i` fills at `open[i+1]`.
   Using `close[i]` as the fill assumes you traded at a price you only learned by the bar
   ending. This is the most common backtest bug in existence.

## Checks before the work is done

Answer each in a sentence, with a `file.ts:line`:

- Which bar is the last element the engine sees, and what proves it is closed?
- Does any array access in the decision path exceed the decision index?
- What price does a backtest fill at, and is that price knowable at decision time?
- With fewer bars than the strategy needs, what comes out? `MIN_BARS` is 30 in
  `packages/core/src/signals/engine.ts`; `insufficientData` exists on `SignalReport`,
  so the honest answer is a flagged neutral verdict, not a confident one off warm-up values.
- Same input bars, evaluated twice: identical verdict? Purity (rule 1) is what makes this
  true, so any clock or randomness reaching the engine breaks it.

## Tests that would actually catch it

A test proving no lookahead feeds the engine a series, then feeds it the same series
truncated one bar earlier, and asserts the verdict for the earlier bar is unchanged. If
appending a future bar changes a past verdict, the engine is reading forward. Write that
test alongside any change to the decision path.

## On finding a violation

Report it with the line and the sequence that produces the wrong number, and stop. State
which published or displayed results were produced by the affected path, because those are
now suspect too. The author decides the fix.

Invariant context: call the Skill tool with "signal-invariants".
