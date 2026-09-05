---
title: Corporate action ingestion
type: issue
status: backlog
priority: medium
tier: "2.1"
source: docs/planning/pending-features.md
---

The read path is complete and correct: `applyAdjustments`
(`packages/db/src/repositories/candles.ts:159`) multiplies pre-ex-date prices by
the stored ratio, exactly as hard rule 5 requires, and `getDailyBars` applies it
on every read.

**Nothing ever writes a `corporate_actions` row.** The adjustment pipeline is
therefore inert: any split or bonus in the stored history produces a phantom gap
that the daily engine reads as a real move. `pnpm verify:adjustment` exists to
determine whether the provider back-adjusts history, which is the prerequisite
question — but its answer has not been turned into an ingestion job either way.

**Done when.** Either a job populates the table from a source, or — if
`verify:adjustment` shows the provider already back-adjusts — that finding is
recorded in this repo and the table is documented as reserved for the intraday
series, which is not back-adjusted.