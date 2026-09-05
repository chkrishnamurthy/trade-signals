import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { instruments } from './instruments.js';

/**
 * Personal watchlists.
 *
 * Single-user tool: there is no owner column and no tenancy (CLAUDE.md). These
 * tables exist so a watchlist survives clearing browser storage.
 *
 * Should that rule ever be lifted, the change is one `owner_id` column here,
 * on `watchlist_views`, and in the four unique indexes below — every read and
 * write already funnels through `repositories/watchlists.ts`, so no route
 * handler or component would need to know.
 */

export const watchlists = pgTable(
  'watchlists',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    /** Manual ordering in the sidebar. */
    position: integer().notNull().default(0),
    /**
     * The list that opens when no other is named.
     *
     * At most one row may hold this — enforced by a partial unique index rather
     * than by application code, because "two defaults" is a state the UI has no
     * sensible way to render and every writer would otherwise have to remember.
     */
    isDefault: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('watchlists_name_idx').on(table.name),
    uniqueIndex('watchlists_single_default_idx').on(table.isDefault).where(sql`${table.isDefault}`),
  ],
);

/**
 * The working table layout for one watchlist: columns, sort, filters.
 *
 * One row per watchlist, rewritten in place — this is UI state, not history,
 * and nothing downstream reads a previous version of it. Separate from
 * `watchlists` so that loading the sidebar does not drag a column list per row
 * across the wire.
 *
 * `columns` is an ORDERED array of column ids. Order and visibility are the
 * same fact: a column not in the array is hidden, and its position in the array
 * is its position in the table. Storing them as two fields is how they drift.
 *
 * Ids that no longer exist in the registry are ignored on read rather than
 * rejected, so removing a column in code does not strand a saved layout.
 */
export const watchlistLayouts = pgTable('watchlist_layouts', {
  watchlistId: integer()
    .primaryKey()
    .references(() => watchlists.id, { onDelete: 'cascade' }),
  /** Ordered, visible-only column ids. Empty means "the registry default". */
  columns: text().array().notNull().default(sql`ARRAY[]::text[]`),
  /** `{ columnId, direction }[]` — an array because sorting is multi-column. */
  sort: jsonb().notNull().default(sql`'[]'::jsonb`),
  /** The filter state, validated by a Zod schema at the API boundary. */
  filters: jsonb().notNull().default(sql`'{}'::jsonb`),
  /** Id of the quick view last applied, for showing it as active. Nullable. */
  quickView: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * A named, reusable table configuration the user saved.
 *
 * Distinct from `watchlist_layouts`, which is the single working state. A view
 * is a thing you deliberately named and can re-apply later, and applying one
 * overwrites the layout — that is the whole point of it.
 *
 * `watchlistId` is nullable: a null one is available on every watchlist, which
 * is what makes "my valuation columns" reusable across lists.
 */
export const watchlistViews = pgTable(
  'watchlist_views',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** Null = available on every watchlist. */
    watchlistId: integer().references(() => watchlists.id, { onDelete: 'cascade' }),
    /**
     * The scope a name must be unique within: the watchlist, or 0 for global.
     *
     * A stored generated column rather than an expression index, because both
     * things have to work:
     *
     *   - Postgres treats NULLs as DISTINCT in a unique index, so a plain
     *     `(watchlist_id, name)` index would let two GLOBAL views share a name
     *     — the one scope that most needs the guarantee would be the only one
     *     without it.
     *   - `ON CONFLICT (col, col)` can only infer an arbiter from real columns.
     *     Against a `COALESCE(...)` expression index it fails outright with
     *     42P10, which takes the upsert in `saveWatchlistView` with it.
     *
     * A generated column satisfies both: it is a column for inference, and it
     * folds NULL to a value the index can compare. Identity ids start at 1, so
     * 0 is a scope no real watchlist can occupy.
     */
    scopeId: integer().generatedAlwaysAs(sql`COALESCE(watchlist_id, 0)`),
    name: text().notNull(),
    columns: text().array().notNull().default(sql`ARRAY[]::text[]`),
    sort: jsonb().notNull().default(sql`'[]'::jsonb`),
    filters: jsonb().notNull().default(sql`'{}'::jsonb`),
    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('watchlist_views_scope_name_idx').on(table.scopeId, table.name),
    index('watchlist_views_watchlist_idx').on(table.watchlistId, table.position),
  ],
);

export const watchlistItems = pgTable(
  'watchlist_items',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    watchlistId: integer()
      .notNull()
      .references(() => watchlists.id, { onDelete: 'cascade' }),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    position: integer().notNull().default(0),
    /** Free-text reason for watching. The user's own thesis, not generated. */
    note: text(),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('watchlist_items_unique_idx').on(table.watchlistId, table.instrumentId),
    index('watchlist_items_watchlist_idx').on(table.watchlistId, table.position),
  ],
);
