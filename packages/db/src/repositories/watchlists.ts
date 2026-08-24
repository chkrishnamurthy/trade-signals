import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  instruments,
  watchlistItems,
  watchlistLayouts,
  watchlists,
  watchlistViews,
} from '../schema/index.js';

/**
 * Watchlists, their members, their table layout and their saved views.
 *
 * Every read and write of watchlist data goes through this module. That is what
 * makes the "no owner column" decision (CLAUDE.md: no multi-tenancy) reversible
 * at one layer rather than at forty call sites.
 *
 * Ordering is explicit everywhere. A watchlist is a list the user arranged; a
 * database that returns it in physical order has silently reordered their work.
 */

export interface WatchlistRow {
  readonly id: number;
  readonly name: string;
  readonly position: number;
  readonly isDefault: boolean;
  readonly count: number;
  readonly updatedAt: Date;
}

/**
 * Every watchlist with its member count, in the user's own order.
 *
 * LEFT JOIN and GROUP BY, not a correlated subquery in the select list. The
 * subquery version is the obvious way to write this and it silently returns
 * the WRONG NUMBER: drizzle interpolates `${table.column}` into a raw `sql`
 * template WITHOUT table qualification, so
 *
 *     WHERE ${watchlistItems.watchlistId} = ${watchlists.id}
 *
 * emits `WHERE "watchlist_id" = "id"`, and inside the subquery `"id"` resolves
 * against `watchlist_items` — which has its own `id` — rather than against the
 * outer `watchlists`. The result is valid SQL, a plausible small integer, and
 * no error anywhere. Do not reintroduce it.
 *
 * COUNT of the joined id rather than COUNT(*): a LEFT JOIN gives an empty
 * watchlist one all-null row, and COUNT(*) would report it as holding one
 * stock. COUNT over a nullable column skips nulls and correctly reports 0.
 *
 * Grouping by the primary key alone is enough — every other selected column is
 * functionally dependent on it, which Postgres recognises.
 */
export async function listWatchlists(db: Database): Promise<WatchlistRow[]> {
  const rows = await db
    .select({
      id: watchlists.id,
      name: watchlists.name,
      position: watchlists.position,
      isDefault: watchlists.isDefault,
      updatedAt: watchlists.updatedAt,
      count: sql<number>`COUNT(${watchlistItems.id})::int`,
    })
    .from(watchlists)
    .leftJoin(watchlistItems, eq(watchlistItems.watchlistId, watchlists.id))
    .groupBy(watchlists.id)
    .orderBy(asc(watchlists.position), asc(watchlists.id));

  return rows.map((row) => ({ ...row, count: Number(row.count) }));
}

export async function createWatchlist(
  db: Database,
  input: { name: string; isDefault?: boolean },
): Promise<WatchlistRow> {
  return db.transaction(async (tx) => {
    const [{ next } = { next: 0 }] = await tx
      .select({ next: sql<number>`COALESCE(MAX(${watchlists.position}), -1) + 1` })
      .from(watchlists);

    // The first watchlist ever created becomes the default. Without this the
    // product has a default-less state that every reader has to handle.
    const [{ total } = { total: 0 }] = await tx
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(watchlists);
    const shouldDefault = input.isDefault === true || Number(total) === 0;

    if (shouldDefault) {
      await tx.update(watchlists).set({ isDefault: false }).where(eq(watchlists.isDefault, true));
    }

    const [created] = await tx
      .insert(watchlists)
      .values({ name: input.name, position: Number(next), isDefault: shouldDefault })
      .returning();

    if (created === undefined) throw new Error('watchlist insert returned no row');
    return {
      id: created.id,
      name: created.name,
      position: created.position,
      isDefault: created.isDefault,
      count: 0,
      updatedAt: created.updatedAt,
    };
  });
}

export async function renameWatchlist(db: Database, id: number, name: string): Promise<boolean> {
  const rows = await db
    .update(watchlists)
    .set({ name, updatedAt: new Date() })
    .where(eq(watchlists.id, id))
    .returning({ id: watchlists.id });
  return rows.length > 0;
}

/**
 * Deletes a watchlist, promoting a new default when it held that flag.
 *
 * Leaving the product with no default is worse than picking one arbitrarily:
 * the first-position survivor is at least the list the user put at the top.
 */
export async function deleteWatchlist(db: Database, id: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(watchlists)
      .where(eq(watchlists.id, id))
      .returning({ id: watchlists.id, wasDefault: watchlists.isDefault });

    if (removed === undefined) return false;
    if (!removed.wasDefault) return true;

    const [survivor] = await tx
      .select({ id: watchlists.id })
      .from(watchlists)
      .orderBy(asc(watchlists.position), asc(watchlists.id))
      .limit(1);

    if (survivor !== undefined) {
      await tx.update(watchlists).set({ isDefault: true }).where(eq(watchlists.id, survivor.id));
    }
    return true;
  });
}

export async function setDefaultWatchlist(db: Database, id: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const exists = await tx
      .select({ id: watchlists.id })
      .from(watchlists)
      .where(eq(watchlists.id, id));
    if (exists.length === 0) return false;

    // Clear first, then set: the partial unique index refuses two defaults, so
    // the reverse order deadlocks against itself.
    await tx.update(watchlists).set({ isDefault: false }).where(eq(watchlists.isDefault, true));
    await tx.update(watchlists).set({ isDefault: true }).where(eq(watchlists.id, id));
    return true;
  });
}

/** Rewrites sidebar order from a complete list of ids, first to last. */
export async function reorderWatchlists(db: Database, ids: readonly number[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) {
      await tx.update(watchlists).set({ position }).where(eq(watchlists.id, id));
    }
  });
}

export interface WatchlistMember {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly exchange: string;
  readonly kind: string;
  readonly position: number;
  readonly note: string | null;
  readonly addedAt: Date;
}

export async function getWatchlistMembers(
  db: Database,
  watchlistId: number,
): Promise<WatchlistMember[]> {
  return db
    .select({
      instrumentId: watchlistItems.instrumentId,
      symbol: instruments.symbol,
      name: instruments.name,
      exchange: instruments.exchange,
      kind: instruments.kind,
      position: watchlistItems.position,
      note: watchlistItems.note,
      addedAt: watchlistItems.addedAt,
    })
    .from(watchlistItems)
    .innerJoin(instruments, eq(instruments.id, watchlistItems.instrumentId))
    .where(eq(watchlistItems.watchlistId, watchlistId))
    .orderBy(asc(watchlistItems.position), asc(watchlistItems.id));
}

/**
 * Adds instruments, skipping any already present.
 *
 * `ON CONFLICT DO NOTHING` against the unique index rather than a read-then-write:
 * the check-and-insert version has a race that surfaces to the user as a crash
 * when they double-click Add, and the index has to exist for correctness anyway.
 *
 * Returns the instrument ids actually inserted, so the caller can say "2 added,
 * 1 already there" instead of a vague success.
 */
export async function addWatchlistItems(
  db: Database,
  watchlistId: number,
  instrumentIds: readonly number[],
): Promise<number[]> {
  if (instrumentIds.length === 0) return [];

  return db.transaction(async (tx) => {
    const [{ next } = { next: 0 }] = await tx
      .select({ next: sql<number>`COALESCE(MAX(${watchlistItems.position}), -1) + 1` })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlistId));

    const base = Number(next);
    const inserted = await tx
      .insert(watchlistItems)
      .values(
        instrumentIds.map((instrumentId, offset) => ({
          watchlistId,
          instrumentId,
          position: base + offset,
        })),
      )
      .onConflictDoNothing({
        target: [watchlistItems.watchlistId, watchlistItems.instrumentId],
      })
      .returning({ instrumentId: watchlistItems.instrumentId });

    if (inserted.length > 0) {
      await tx
        .update(watchlists)
        .set({ updatedAt: new Date() })
        .where(eq(watchlists.id, watchlistId));
    }
    return inserted.map((row) => row.instrumentId);
  });
}

export async function removeWatchlistItems(
  db: Database,
  watchlistId: number,
  instrumentIds: readonly number[],
): Promise<number> {
  if (instrumentIds.length === 0) return 0;
  const removed = await db
    .delete(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        inArray(watchlistItems.instrumentId, [...instrumentIds]),
      ),
    )
    .returning({ id: watchlistItems.id });
  return removed.length;
}

/** Rewrites member order within one watchlist. */
export async function reorderWatchlistItems(
  db: Database,
  watchlistId: number,
  instrumentIds: readonly number[],
): Promise<void> {
  if (instrumentIds.length === 0) return;
  await db.transaction(async (tx) => {
    for (const [position, instrumentId] of instrumentIds.entries()) {
      await tx
        .update(watchlistItems)
        .set({ position })
        .where(
          and(
            eq(watchlistItems.watchlistId, watchlistId),
            eq(watchlistItems.instrumentId, instrumentId),
          ),
        );
    }
  });
}

export interface StoredLayout {
  readonly columns: readonly string[];
  readonly sort: unknown;
  readonly filters: unknown;
  readonly quickView: string | null;
}

export async function getWatchlistLayout(
  db: Database,
  watchlistId: number,
): Promise<StoredLayout | null> {
  const [row] = await db
    .select()
    .from(watchlistLayouts)
    .where(eq(watchlistLayouts.watchlistId, watchlistId));
  if (row === undefined) return null;
  return {
    columns: row.columns,
    sort: row.sort,
    filters: row.filters,
    quickView: row.quickView,
  };
}

export async function saveWatchlistLayout(
  db: Database,
  watchlistId: number,
  layout: StoredLayout,
): Promise<void> {
  await db
    .insert(watchlistLayouts)
    .values({
      watchlistId,
      columns: [...layout.columns],
      sort: layout.sort,
      filters: layout.filters,
      quickView: layout.quickView,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: watchlistLayouts.watchlistId,
      set: {
        columns: [...layout.columns],
        sort: layout.sort,
        filters: layout.filters,
        quickView: layout.quickView,
        updatedAt: new Date(),
      },
    });
}

export interface StoredView {
  readonly id: number;
  readonly watchlistId: number | null;
  readonly name: string;
  readonly columns: readonly string[];
  readonly sort: unknown;
  readonly filters: unknown;
  readonly position: number;
}

/** Views scoped to this watchlist, plus every global one. */
export async function listWatchlistViews(db: Database, watchlistId: number): Promise<StoredView[]> {
  return db
    .select()
    .from(watchlistViews)
    .where(
      sql`${watchlistViews.watchlistId} IS NULL OR ${watchlistViews.watchlistId} = ${watchlistId}`,
    )
    .orderBy(asc(watchlistViews.position), asc(watchlistViews.id));
}

export async function listGlobalWatchlistViews(db: Database): Promise<StoredView[]> {
  return db
    .select()
    .from(watchlistViews)
    .where(isNull(watchlistViews.watchlistId))
    .orderBy(asc(watchlistViews.position), asc(watchlistViews.id));
}

export async function saveWatchlistView(
  db: Database,
  input: {
    watchlistId: number | null;
    name: string;
    columns: readonly string[];
    sort: unknown;
    filters: unknown;
  },
): Promise<StoredView> {
  const [row] = await db
    .insert(watchlistViews)
    .values({
      watchlistId: input.watchlistId,
      name: input.name,
      columns: [...input.columns],
      sort: input.sort,
      filters: input.filters,
    })
    .onConflictDoUpdate({
      target: [watchlistViews.scopeId, watchlistViews.name],
      set: {
        columns: [...input.columns],
        sort: input.sort,
        filters: input.filters,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (row === undefined) throw new Error('watchlist view upsert returned no row');
  return row;
}

export async function deleteWatchlistView(db: Database, id: number): Promise<boolean> {
  const rows = await db
    .delete(watchlistViews)
    .where(eq(watchlistViews.id, id))
    .returning({ id: watchlistViews.id });
  return rows.length > 0;
}
