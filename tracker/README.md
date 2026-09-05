# EquityWise Tracker

A standalone documentation-and-work tracker for EquityWise. It lives entirely in
this folder, is **not** part of the pnpm workspace, and is never imported by the
app. It cannot affect the product's build, deploy, or dependency tree.

**The Markdown files in the repo are the single source of truth.** The tracker
discovers everything dynamically — there is no list or database to maintain.

| Tab | Source | Behaviour |
| --- | --- | --- |
| **Docs** | `docs/**/*.md` (+ root `CLAUDE.md`, `README.md`) | Hierarchical tree by folder; reader with table of contents |
| **Features** | `features/**/*.md` | List of feature files; empty state until files exist |
| **Issues** | `issues/**/*.md` | Kanban board grouped by frontmatter `status`; empty state with **Generate Issues** |

Add, move, edit, or delete a `.md` file anywhere under those folders and the
tracker reflects it on the next load. Nothing is hardcoded in the app.

## Run it

```bash
cd tracker
pnpm install --ignore-workspace   # standalone install; own node_modules
pnpm dev                          # http://localhost:4321
```

`pnpm dev` starts Vite, which also serves the read/write API — so this one
command is the only process, and the only thing that can write to the repo.

## Issues as Markdown

Each issue is one file under `issues/` with YAML frontmatter the board reads:

```yaml
---
title: Serve daily signals from the database
type: issue        # issue | bug | task
status: todo       # backlog | todo | in-progress | done
priority: high     # high | medium | low
tier: "1.1"
refs:
  - apps/web/src/server/signals.ts
---
Body markdown — the "why", the plan, checklist items.
```

- **Drag a card** between columns → the board rewrites that file's `status`
  (the body is preserved). Files stay the source of truth.
- **Generate Issues** (Issues tab, empty state) → reads
  `docs/planning/pending-features.md` and writes one issue file per backlog item.
  A projection of real project data, never invented.
- **Implement with Claude** (open a card) → copies a ready prompt built from the
  issue file to paste into Claude Code.

## Keeping it current

Ask Claude Code, in the repo, to *"scan for new issues and add cards"* and it
will write new `issues/*.md` files. To add a doc or feature, just drop a Markdown
file under `docs/` or `features/` — it appears automatically.
