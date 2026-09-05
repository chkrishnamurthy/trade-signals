---
title: Serve daily signals from the database
type: task
status: todo
priority: high
tier: "1.1"
source: docs/planning/pending-features.md
---

**What exists.** `apps/worker/src/jobs/compute-indicators.ts:104` already runs the
daily engine over stored candles and calls `saveSignal`, writing `signals` and
`signal_factors` with a registered `strategy_versions` row. The read side exists
too: `getSignalsForDate` and `getSignalFactors`
(`packages/db/src/repositories/signals.ts:173,207`).

**What is missing.** Neither read function has a single caller. The web app
instead **recomputes** the daily engine in-process on every cache miss —
`apps/web/src/server/signals.ts` pulls 400 days of history per symbol from the
provider, runs `evaluateSignals` and `scanSwing`, and serves factors out of a
module-level `Map`.

**Why it matters.** Three separate costs:

- It is the expensive half of the dashboard by the file's own admission — a
  50-stock index costs 50 provider requests, roughly a quarter of the per-minute
  budget, for a number the worker already computed for free.
- It sits in tension with **hard rule 8**: the factor breakdown the UI renders is
  recomputed in the web process rather than read from `signal_factors`.
- It contradicts the intraday doctrine ("`apps/web` only READS") for no reason
  other than that the daily path was built first.

**Done when.** `apps/web/src/server/signals.ts` reads `getSignalsForDate` /
`getSignalFactors`, the provider fetch is deleted, and a stale-data state is
rendered when the worker has not run rather than silently recomputing.