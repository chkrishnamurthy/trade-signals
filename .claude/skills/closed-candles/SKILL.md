---
name: closed-candles
description: Guard against lookahead when writing or reviewing an indicator, a screener metric, an end-of-day pass, or any bar fetch. Use when the work touches BarsRequest, includeForming, bar indexing, or anything that stores a value for session i.
---

# Closed candles

Hard rule 2, and the one whose violation is hardest to see: an indicator or screener
metric stored for a session may only read **closed** bars from that session and before.

Lookahead does not throw. It produces a value that looks plausible and is wrong — an RSI,
a breakout flag or a 52-week extreme for a session that already "knew" a later price.

(The signal engine, backtests and paper fills that this skill once guarded were removed
on 2026-10-17; the rule still holds for every calculation that remains.)

## The two ways it gets in

1. **The forming bar reaches a calculation.** `BarsRequest.includeForming` defaults to
   false and `now` is injected so "is the last bar still finished" stays testable
   (`packages/market-data/src/provider.ts`). A chart may pass `includeForming: true`.
   The end-of-day passes (`compute-indicators`, `stock-analysis`) never do. Trace the
   actual call site rather than trusting the default.
2. **An index reaches past `i` while computing for `i`.** The value for bar `i` may read
   closes at or before `i`, never a price at `i+1`, and never a "confirmation" from a
   later bar.

## Checks before the work is done

Answer each in a sentence, with a `file.ts:line`:

- Which bar is the last element the calculation sees, and what proves it is closed?
- Does any array access exceed the index of the session being stored?
- With fewer bars than the calculation needs, what comes out? The honest answer is
  `null` (warm-up), not a confident number off too little data.
- Same input bars, computed twice: identical value? Purity (rule 1) is what makes this
  true, so any clock or randomness reaching `packages/core` breaks it.

## Tests that would actually catch it

Feed the calculation a series, then the same series truncated one bar earlier, and assert
the value for the earlier bar is unchanged. If appending a future bar changes a past value,
the code is reading forward. Write that test alongside any change to the path.

## On finding a violation

Report it with the line and the sequence that produces the wrong number, and stop. State
which stored or displayed values the affected path produced, because those are now suspect
too. The author decides the fix.

Invariant context: call the Skill tool with "signal-invariants".
