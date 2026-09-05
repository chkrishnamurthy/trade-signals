---
title: The authoritative design docs do not exist
type: task
status: backlog
priority: low
tier: "4.1"
source: docs/planning/pending-features.md
---

[CLAUDE.md](../CLAUDE.md) opens by naming two documents as authoritative:

- `docs/nse-signals-technical-plan.md` — "§1, §3, §5–§8 authoritative"
- `docs/nse-signals-prompt-pack-v2.md` — "§2–§3 authoritative for stack and schema"

Neither is in the repository, and `docs/` did not exist before this file. Nothing
is gitignored that would hide them — they were never committed.

This is the highest-leverage documentation gap, because CLAUDE.md defers to them
on exactly the questions this backlog keeps running into: what the daily signal
product is meant to be, and which schema decisions are settled. `apps/web/src/lib/watchlist.ts`
cites their absence directly as the reason it chose `localStorage`.

**Done when.** The documents are either restored from wherever they were drafted,
or CLAUDE.md's reference to them is replaced with the parts that are actually
load-bearing. Leaving a dangling reference to an authoritative document is worse
than having no reference.