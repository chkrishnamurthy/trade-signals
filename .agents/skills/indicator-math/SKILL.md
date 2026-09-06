---
name: indicator-math
description: Verification discipline for the hand-written indicators in packages/core — warm-up indices, Wilder versus EMA smoothing, null propagation, and fixture provenance. Use when writing, changing, reviewing, or testing RSI, EMA, SMA, MACD, ATR, or any indicator.
---

# Indicator math

These indicators are hand-written for auditability, so nothing external cross-checks them.
Their own doc comments state the formulas and the reasoning; read the module before
changing it. This skill covers what the code cannot state about itself: how to establish
that a value is *right*.

## Fixture provenance is the whole game

A test whose expected values came from running the implementation tests stability, not
correctness. It passes just as happily on a wrong formula, and it locks the wrong answer in.

Every indicator fixture is **hand-computed or taken from an independent source**, and the
test says which, in a comment, with the arithmetic or the source named. When reviewing a
test, establishing where its numbers came from is the first question, not the last.

Independent sources that count: arithmetic worked by hand on a short series, a published
worked example (Wilder's original tables for RSI and ATR), or a value read off a charting
platform for a stated symbol, date, and period. What does not count: this function's output,
another npm package's output, or a value someone remembers.

## Warm-up is where the bugs are

Off-by-one in the first emitted index is the most common indicator defect, and it shifts
every downstream comparison without ever looking wrong.

For each indicator, state the first index carrying a non-null value and justify it:

- `sma(period)` first emits at `period - 1`.
- `ema(period)` seeds with the SMA of the first `period` values, so it also first emits at
  `period - 1`. Seeding with `values[0]` instead drifts visibly for hundreds of bars.
- `rsi(period)` offsets by one, because the first change lives at index 1. First value lands
  at `period`.
- MACD's signal line cannot begin before the MACD line itself has `signalPeriod` real values.
  Compute that index and check it, rather than assuming the EMA helper handles it.
- ATR's first bar has no previous close, so True Range is undefined there.

## Smoothing: two different constants

RSI and ATR use **Wilder's** smoothing, `1/period`. EMA and MACD use `2/(period+1)`.
`wilderSmooth` and `ema` in `packages/core/src/indicators/moving-average.ts` are deliberately
separate functions for this reason. Substituting one for the other produces values that look
reasonable and match no charting platform, and the divergence grows with series length.

When a value disagrees with a chart, separate the two explanations before calling it a bug:
a convention difference (seeding, smoothing choice, session boundaries) diverges by a
consistent shape; an arithmetic error diverges erratically. Reproduce by hand on ten bars.

## Nulls and gaps

A `null` in a price series propagates. Treating it as `0` inserts a crash to zero and a
recovery, which every momentum indicator reads as a real event. Skipping it silently shifts
every later index. Decide explicitly, and cover the decision with a test that puts a gap in
the middle of a series.

## Before calling indicator work done

- The first non-null index is asserted in a test, not just the values.
- Every new expected value states its provenance in a comment.
- One value is cross-checked by hand and the arithmetic appears in the test or the report.
- A mid-series `null` has a test.
- Money in, money out stays integer paise; ratios (`rsi`, `relativeVolume`, `changePercent`)
  stay floats. Call the Skill tool with "signal-invariants" for the boundary.

## On finding a wrong formula

Report the defect, the correct formula, and what it means for values already computed and
stored, then stop. A math change invalidates persisted indicator rows and any signal derived
from them; say so explicitly. The author decides.
