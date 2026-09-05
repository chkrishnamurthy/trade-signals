---
title: Trading calendar
type: issue
status: backlog
priority: medium
tier: "2.3"
source: docs/planning/pending-features.md
---

`packages/shared/src/time.ts` is explicit that its session helpers are
"holiday-unaware, so this is the earliest instant trading *could* start, not a
guarantee," and points at a trading calendar that does not exist. Live status is
fine — `getMarketStatus` asks the provider — but everything offline is not:
backtests, `replay:session`, `backfill:minutes` and coverage reporting all treat
an exchange holiday as a session with missing data.

**Done when.** A holiday list in `config/` (versioned YAML, per convention) and
an `isTradingDay()` in `packages/shared` that every offline path consults.

---