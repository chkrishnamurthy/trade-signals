---
name: signal-invariants
description: The load-bearing invariants of this NSE market-data repo and the mechanism enforcing each — integer paise, closed candles, provider boundary, UTC timestamps, pure core, immutable candle history, private portfolio data — plus the no-signals product rule. Read before writing or reviewing anything that touches a price, a timestamp, a candle, an indicator, or a provider call.
---

# Invariants

`CLAUDE.md` states these rules. This is the operational half: what enforces each one,
what it looks like when it breaks, and what to do when a task seems to require breaking it.

An **invariant** here is load-bearing in a specific sense: the code is built assuming it
holds, so a violation does not produce an error, it produces a plausible wrong number.
That is the whole danger. Treat a violation as a correctness defect, never as style.

## The seven

| # | Invariant | Enforced by | What a violation produces |
|---|---|---|---|
| 1 | `packages/core` is pure: data plus config in, result out | Convention only. Nothing fails the build. | A calculation that cannot be tested against a fixed fixture, and silently differs between runs. |
| 2 | Indicators and screener metrics read CLOSED candles only | `BarsRequest.includeForming` defaults false, `now` is injected. Beyond the fetch, convention. | A stored value for a session that used a price from after it closed. |
| 3 | Prices are integer paise below the presentation layer | `assertPaise` in code; integer columns plus positivity and range-coherence CHECKs in `0002_guards.sql` | Sub-paise drift that compounds silently across a series. |
| 4 | Persist 1m and 1d only; derive the rest via `time_bucket` at 09:15 IST | Schema shape: `minute_candles` and `daily_candles` are the only candle tables, both hypertables | A persisted 5m table that disagrees with the derived one after any backfill. |
| 5 | Candle history is append-only; corporate actions apply on read | **Trigger.** `daily_candles_no_update` and `minute_candles_no_update` raise on UPDATE. DELETE stays allowed so a bad ingestion run can be rolled back wholesale. | Yesterday's chart changes shape. No way to reproduce a past indicator. |
| 6 | Timestamps are TIMESTAMPTZ UTC; IST only at presentation | Column types. Every timestamp column in `0000_modern_hulk.sql` is `with time zone`. | A candle filed to the wrong session. Off-by-5:30 on every boundary comparison. |
| 7 | Portfolio data is private and owner-scoped | Every repository query takes `owner_id`; account deletion cascades | One user's holdings on another user's screen, or in a log line. |

Rules 5 and 6 have real teeth, and rule 3 is half-covered. **Rules 1, 2 and 7 rest on
convention alone**, and they are the ones whose violation is hardest to see from the outside:
an impure core, a forming candle reaching a calculation, and an unscoped query all produce
plausible output. Check those by reading, every time.

(The former rules 7 and 8 — versioned strategy config and persisted signal factor
breakdowns — went with the signal engine on 2026-10-17.)

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

The app describes data; it does not recommend. **No signals, setups, BUY / SELL labels,
"setup strength" rankings, entry/target/stop levels or paper trading** — all removed on
2026-10-17 (`docs/planning/signals-and-paper-removal-plan.md`), and bringing any back is a
product decision (SEBI Research Analyst rules), not a feature task. Name facts: "Above its
50-day average", "52-week high", "Volume 2.4× its 20-day average". Users screen on
conditions they choose. Keep displayed numbers explainable.

## When a task appears to require breaking one

Report the conflict and stop. Name the invariant, the line that would violate it, and the
change to the design that would satisfy both. The author decides. An invariant relaxed
quietly during an unrelated task is how every convention-only rule will eventually go.
