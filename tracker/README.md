# EquityWise Tracker

A standalone work tracker for EquityWise. It lives entirely in this folder, is
**not** part of the pnpm workspace, and is never imported by the app. It cannot
affect the product's build, deploy, or dependency tree.

**The Markdown files in the repo are the single source of truth.** The tracker
discovers everything on every request — there is no database to maintain. Every
view is a projection of three folders:

| Folder | What lives there | Views that read it |
| --- | --- | --- |
| `issues/` | one file per board card (idea, bug, feature, chore, plan phase) — see [`issues/README.md`](../issues/README.md) | Board, Heatmap |
| `docs/planning/` | plan docs; a frontmatter block carries lifecycle status, horizon, phases, blockers | Roadmap, Dependencies, Plan registry, Plan detail |
| `docs/journal/` | one file per day: Shipped / Decided / Parked / Tomorrow | Journal |
| `docs/**` | everything else | Docs reader |

## Run it

```bash
cd tracker
pnpm install --ignore-workspace   # standalone install; own node_modules
pnpm dev                          # http://localhost:4321
```

`pnpm dev` starts Vite, which also serves the read/write API — one process, and
the only thing that writes to the repo. It writes only under the three folders
above, only `.md` files, and only frontmatter or whole new files; it never
touches code.

## The views

| # | View | Answers | Key rule |
| --- | --- | --- | --- |
| 1 | **Board** | What am I doing right now? | Capture box feeds Inbox; Now is capped at 3; 7+ days in Now turns amber |
| 2 | **Journal** | What did I do — build or plan? | Five lines a day, pre-filled from git; Parked lines become Inbox cards |
| 3 | **Registry** | What state is every plan in? | Edit on a row changes status / horizon / phases in the doc's frontmatter; health is computed |
| 4 | **Roadmap** | Where is this going? | Now / Next / Later — horizons, not dates |
| 5 | **Dependencies** | What's blocked on what? | Generated from `blocked_by:`; hub counts say what to unblock first |
| 6 | **Plan detail** | How far along is this plan? | Phase stepper + reader + file history |
| 7 | **Heatmap** | Where does the pain cluster? | Area × type; insights are generated sentences |
| 8 | **Docs** | Read anything under `docs/` | The original reader |

Keyboard: `1`–`8` jump between views, `[` toggles the sidebar.
`D` pick a verb, `⌘⏎` saves.

## Plan frontmatter

The block at the top of every `docs/planning/*.md` drives the registry, roadmap
lane, dependency graph and phase bars. There is nothing else to maintain.

```yaml
---
status: in-progress        # draft | approved | in-progress | done | superseded | dropped | reference
horizon: now               # now | next | later | none
created: 2026-09-17
updated: 2026-09-18
owner: krishna
board: EW-090              # the card that is this plan's handle on the board
phases_total: 7
phases_done: 1
phase_names: [Audit + Dhan PoC, Core + ledger, Dhan ingestion, ...]
area: [core, db]
blocked_by: [intraday-strategy-dhan-plan, dhan-provider-plan]   # plan slugs
supersedes: []
superseded_by: dhan-provider-plan   # when status is superseded
confidence: 3              # 0–3: how sure you are this is the right thing
summary: one sentence shown on cards and in the registry
---
```

## Working with Claude Code

- **Implement with Claude** (open a card) copies a ready prompt built from the
  card file.
- Ask Claude, in the repo, to *"record today's journal"* — it writes the file;
  the tracker shows it on reload.
- When a plan doc is written, ask for the frontmatter block above; when a plan
  is agreed, ask for its handle card in `issues/`.

## Previous version

The first tracker (Docs / Features / Issues tabs, four-column board generated
from `pending-features.md`) was replaced on 2026-09-18. Its twelve generated
cards were migrated to the new schema (`status` → `stage`, ids `EW-101`…`EW-111`)
and the empty `features/` root was removed. 
