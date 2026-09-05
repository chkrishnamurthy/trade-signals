---
title: No fundamentals data source
type: task
status: backlog
priority: low
tier: 3B.1
source: docs/planning/pending-features.md
---

Surfaced by the watchlist build rather than discovered in review: **market cap,
P/E, P/B, EPS and dividend yield have no source anywhere in this system.** The
provider serves quotes and OHLCV history; nothing serves fundamentals.

They are declared in `apps/web/src/lib/watchlist-columns.ts` with `source: null`,
which makes them visible-but-disabled in the column picker with the reason
attached, and automatically disables the two quick views that need them
("High dividend", "Valuation"). Their accessors return `null` and a test asserts
they never return anything else — an invented P/E is worse than a visible gap.

**Done when.** A fundamentals source exists and each accessor is filled in. The
column definitions, the filter ranges, the quick views and the UI states are all
already in place and will light up on their own.

---