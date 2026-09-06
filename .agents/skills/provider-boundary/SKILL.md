---
name: provider-boundary
description: Keep the product broker-independent — Fyers types, symbol formats, resolution codes, and error classes stop at the adapter. Use when touching packages/fyers, packages/providers-fyers, packages/market-data, apps/web/src/server/provider.ts, or when upstream code needs something only the provider exposes.
---

# Provider boundary

The product consumes `MarketDataProvider` and nothing else. Fyers is a data source, not
the product, and the UI never presents itself as a broker client.

The **boundary** runs through `packages/providers-fyers/src/adapter.ts`. That file is the
only place in the repo permitted to hold a Fyers type and a product type in the same scope.
Everything provider-shaped stops there: symbol formats (`NSE:RELIANCE-EQ`), resolution
codes, error classes, `fyToken`s, field names.

## The guard, and the one way to defeat it

`packages/market-data/src/__tests__/boundary.test.ts` greps the tree for provider names on
lines of code and fails on any file outside its `ALLOWED` list.

When upstream code needs a capability only Fyers exposes, there are two moves and only one
is correct:

| Move | Effect |
|---|---|
| **Widen `MarketDataProvider`** with the capability, expressed in product vocabulary, and implement it in the adapter | The second provider implements it too, or declares it absent via `ProviderCapabilities`. Boundary intact. |
| Add the file to `ALLOWED` | The guard is off for that path permanently, and nothing will ever turn it back on. |

Adding to `ALLOWED` is a design decision for the author, not a test fix. Report the need and stop.

## The adapter's contract

Every implementation of `MarketDataProvider` honours these, and the adapter is where each
is actually established:

- Symbols crossing the boundary are **our** symbols (`RELIANCE`, `NIFTY50`). `toFyersSymbol`
  and `internalSymbolFor` translate; nothing upstream constructs a provider symbol.
- Prices crossing the boundary are **integer paise**. Fyers returns rupee floats, so
  `rupeesToPaise` runs in the mapping layer. A rupee float escaping the adapter is a defect.
- A missing field is `null`. Never `0`, never a guess, never a stale carry-over. A zero that
  means "unknown" renders as a real price and is indistinguishable from one.
- Failures throw `MarketDataProviderError`. A Fyers error class escaping is a leak in both
  directions: it couples upstream code to Fyers, and it can carry upstream response text
  containing credentials.
- `fetchBars` returns ascending, deduplicated, closed bars by default. Call the Skill tool
  with "closed-candles" before changing that path.

## Capabilities are checked, not assumed

`ProviderCapabilities` exists so the product degrades visibly rather than rendering an empty
chart as a flat market. New upstream code that depends on streaming, intraday history, a
resolution, or authoritative market status reads the capability first and has a stated
behaviour when it is false.

## Shared per-account state

`RateLimiter` and `PathCircuitBreaker` are shared across every request on purpose: Fyers
limits are per **account**, not per process or per call. Constructing either one per call
lets N concurrent callers each believe they own the whole budget. When adding a code path
that reaches Fyers, thread the existing instances through rather than making new ones, and
account for `apps/worker` and `apps/web` drawing on the same account budget at the same time.

## On finding a leak

Report the file and line, which vocabulary crossed which way, and the `MarketDataProvider`
change that would resolve it, then stop. The author decides.

Invariant context: call the Skill tool with "signal-invariants".
