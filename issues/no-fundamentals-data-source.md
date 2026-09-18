---
id: EW-109
title: No fundamentals data source
type: idea
stage: ideas
priority: low
area: [provider]
created: 2026-08-24
updated: 2026-09-06
stage_since: 2026-09-06
tier: 3B.1
source: docs/planning/pending-features.md
---

Surfaced by the watchlist build rather than discovered in review: **market cap,
P/E, P/B, EPS and dividend yield have no source anywhere in this system.** The
provider serves quotes and OHLCV history; nothing serves fundamentals.

They used to be declared in `apps/web/src/lib/watchlist-columns.ts` with
`source: null` (visible-but-disabled in the column picker, with two disabled
quick views). As of 2026-09-14 those declarations are removed: nearly half the
picker was greyed out, which reads as an unfinished product rather than an
honest gap. The registry now only declares columns that have a source, and
migration `0019` stripped the dead ids from stored layouts and saved views.

**Done when.** A fundamentals source exists. Re-add the columns (a `valuation`
and `fundamentals` group, with accessors over the new source) and the
"High dividend" / "Valuation" quick views at that point — the git history at
`7f302a2^` has the previous declarations to start from.

---