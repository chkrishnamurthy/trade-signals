# Issues — the board's cards

Every card on the tracker's board is one Markdown file here. Ideas, bugs,
features, chores and plan phases all use the same shape; the `stage` field is
the card's position on the board.

```yaml
---
id: EW-090                    # stable id, assigned by the tracker (never reused)
title: Paper trading — phase 1 (core + ledger)
type: plan-phase              # idea | bug | feature | chore | plan-phase
stage: now                    # inbox | ideas | next | now | review | done | dropped
priority: urgent              # urgent | high | medium | low
area: [core, db]              # provider | worker | web | core | db | mobile | ops | docs
plan: paper-trading-plan      # docs/planning/<slug>.md this card belongs to (optional)
phase: 1                      # which phase of that plan (optional)
created: 2026-09-17
updated: 2026-09-18
stage_since: 2026-09-17       # when it entered the current stage — drives the age counters
done_at: 2026-09-18           # set when stage becomes done
blocked_by: [EW-088]          # card ids
superseded_by: EW-075         # set when dropped in favour of another card
why: one sentence — why it was accepted, merged or declined
source: where it came from (doc §, PR, "inbox capture", "journal 2026-09-18")
refs:
  - packages/core/src/paper
---
Body markdown — the "why", a checklist, links.
```

Rules the tracker enforces:

- **Now holds at most 3 cards.** Dragging a fourth in is refused.
- A card in Now for 7+ days turns amber; the weekly review asks "kill or keep?".
- Dropped cards are never deleted — they keep `superseded_by` / `why` so the
  reasoning survives.

Capture new cards from the box at the top of the Board (one line, Enter), or
from a journal entry's "Parked" lines. Open a card to set its type, area and stage. Writing a file by hand also works; the tracker
discovers it on the next load.
