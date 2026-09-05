---
title: Alerts
type: task
status: todo
priority: high
tier: "1.4"
source: docs/planning/pending-features.md
---

**What exists.** `alerts` and `alert_events` tables, fully designed —
typed `condition` JSON, denormalised `threshold` for cheap proximity queries,
`oneShot` to stop a crossed threshold re-firing every tick, `lastEvaluatedAt`,
and an audit trail carrying the observed value that fired it.

**What is missing.** Everything above the schema: the Zod predicate schema the
comment promises, the evaluator, the worker job, and the UI.

**Done when.** A pure evaluator in `packages/core` (rule 1 — it takes an
indicator snapshot plus the condition and returns a verdict), a worker job that
runs it on the intraday cycle, and an `/alerts` page. Note the vocabulary
constraint: an alert says a condition was met, never that anything should be done
about it.