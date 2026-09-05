# Issues

Issues, bugs, and tasks live here as Markdown files, one per item, each with
YAML frontmatter the Kanban board reads:

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
```

The tracker discovers these files automatically. Generate them from the Issues
tab rather than writing them by hand.
