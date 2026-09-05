---
title: Watchlists on the database
type: task
status: done
priority: low
tier: "1.3"
source: docs/planning/pending-features.md
---

Built as a full workspace at `/watchlists`, not just CRUD: multiple lists with a
single enforced default, search-and-add, a configurable column set over nine
groups, multi-column sort, range and flag filters, quick views, user-saved views,
and a performance summary.

- Schema: `is_default` on `watchlists`, plus `watchlist_layouts` (the working
  table state per list) and `watchlist_views` (named, reusable configurations).
  Migration `0009_simple_fat_cobra.sql`.
- The model — column registry, filters, sorting, summary — is pure and lives in
  `apps/web/src/lib/watchlist-*.ts`, tested in `watchlist-model.test.ts`.
- `packages/db/src/__tests__/watchlists-schema.test.ts` asserts the three
  database-enforced invariants against a throwaway Neon branch.
- `apps/web/src/lib/watchlist.ts` now reads and writes the default watchlist
  through the API, migrating any `localStorage` key on first load. The star
  toggles on the dashboard and in the stock drawer went with it.

**Still open from this area:** members cannot be dragged into a custom order from
the table itself (the API and repository support it; only the UI affordance is
missing), and `watchlist_items.note` is stored and displayed but has no editor.