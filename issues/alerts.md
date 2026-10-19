---
id: EW-104
title: Alerts
type: feature
stage: review
priority: high
area: [worker, web]
created: 2026-08-24
updated: 2026-10-05
stage_since: 2026-10-05
tier: "1.4"
source: docs/planning/pending-features.md
---

**Status 2026-10-05 — v1 built, uncommitted.** The tables this note described were
dropped in migration 0011, so v1 started from a new per-user schema.

Built: pure evaluator (`packages/core/src/alerts`) — crossings of closing price or RSI-14 on
closed sessions; `alerts` + `alert_events` (migration `0036_alerts.sql`, 25 per user);
worker job `evaluate-alerts` (after the daily indicator pass; once per rule per session;
email via Resend plus an in-app event); `/api/alerts`; `/alerts` page.

Not verified: the migration and repository against Postgres; the page in a browser.
Deploy gate: add the `0035_latest_quotes` journal entry first (see the tracker in
`docs/planning/product-review-2026-10.md`).

**v2 ideas.** Intraday price-level alerts (needs the worker quote cache, EW-033), an RSI/MA
rule library, push or SMS, a per-stock "alert me" shortcut on the stock page.
Vocabulary constraint stays: an alert says a condition was met, never what to do.
