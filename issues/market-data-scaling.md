---
id: EW-033
title: Market-data scaling — polled reads behind the worker
type: plan-phase
stage: next
priority: high
area: [worker, web]
plan: market-data-scaling-plan
phase: 1
created: 2026-09-06
updated: 2026-09-14
stage_since: 2026-09-14
source: docs/planning/market-data-scaling-plan.md
---

Phase 1 (live-price fan-out over SSE) is done. Remaining: move `/api/watchlists/:id` detail reads behind the worker so live load scales with symbols, not users. Gates public traffic.
