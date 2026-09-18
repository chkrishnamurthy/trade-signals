---
id: EW-105
title: Ingestion run tracking
type: chore
stage: next
priority: high
area: [worker, db]
created: 2026-08-24
updated: 2026-09-06
stage_since: 2026-09-06
tier: "1.5"
source: docs/planning/pending-features.md
---

**What exists.** The `ingestion_runs` table, whose comment states the reason
plainly: without it "a worker outage leaves a hole that indicators compute
straight across, producing a plausible and wrong number rather than an error."

**What is missing.** Zero writers, zero readers. The failure mode the table was
designed to prevent is currently live.

**Done when.** `ingest-daily`, `ingest-intraday` and `compute-indicators` open
and close a run row; `compute-indicators` refuses to compute across a session
with no `ok` run; `pnpm data:coverage` reports gaps from it.

---