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
 * Every read and write of watchlist data goes through this module, and every one
 * is scoped to the owning user (`ownerId`) — that is what isolates one user's
 * watchlists from another's. Items and layouts have no owner column of their own;
 * they are reached only through a watchlist the owner is proven to hold.
 *
 * Ordering is explicit everywhere. A watchlist is a list the user arranged; a
 * database that returns it in physical order has silently reordered their work.
 */

/** True when `watchlistId` belongs to `ownerId` — the ownership gate for items/layouts. */
async function ownsWatchlist(db: Database, ownerId: number, watchlistId: number): Promise<boolean> {
  const rows = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(and(eq(watchlists.id, watchlistId), eq(watchlists.ownerId, ownerId)))
    .limit(1);
  return rows.length > 0;
}

export interface WatchlistRow {
  readonly id: number;
  readonly name: string;
  readonly position: number;
  readonly isDefault: boolean;
  readonly count: number;
  readonly updatedAt: Date;
}

/**
 * Every watchlist owned by the user, with its member count, in the user's order.
 *
 * LEFT JOIN and GROUP BY, not a correlated subquery in the select list. The
 * subquery version is the obvious way to write this and it silently returns the
 * WRONG NUMBER (see git history). COUNT over the joined nullable id — not COUNT(*)
 * — so an empty watchlist reports 0, not 1.
 */
export async function listWatchlists(db: Database, ownerId: number): Promise<WatchlistRow[]> {
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
    .where(eq(watchlists.ownerId, ownerId))
    .groupBy(watchlists.id)
    .orderBy(asc(watchlists.position), asc(watchlists.id));

  return rows.map((row) => ({ ...row, count: Number(row.count) }));
}

export async function createWatchlist(
  db: Database,
  ownerId: number,
  input: { name: string; isDefault?: boolean },
): Promise<WatchlistRow> {
  return db.transaction(async (tx) => {
    const [{ next } = { next: 0 }] = await tx
      .select({ next: sql<number>`COALESCE(MAX(${watchlists.position}), -1) + 1` })
      .from(watchlists)
      .where(eq(watchlists.ownerId, ownerId));

    // The user's first watchlist becomes their default. Without this the product
    // has a default-less state that every reader has to handle.
    const [{ total } = { total: 0 }] = await tx
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(watchlists)
      .where(eq(watchlists.ownerId, ownerId));
    const shouldDefault = input.isDefault === true || Number(total) === 0;

    if (shouldDefault) {
      await tx
        .update(watchlists)
        .set({ isDefault: false })
        .where(and(eq(watchlists.ownerId, ownerId), eq(watchlists.isDefault, true)));
    }

    const [created] = await tx
      .insert(watchlists)
      .values({ ownerId, name: input.name, position: Number(next), isDefault: shouldDefault })
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

export async function renameWatchlist(
  db: Database,
  ownerId: number,
  id: number,
  name: string,
): Promise<boolean> {
  const rows = await db
    .update(watchlists)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(watchlists.id, id), eq(watchlists.ownerId, ownerId)))
    .returning({ id: watchlists.id });
  return rows.length > 0;
}

/**
 * Deletes one of the user's watchlists, promoting a new default when it held that
 * flag. The first-position survivor (of the same owner) becomes the new default.
 */
export async function deleteWatchlist(db: Database, ownerId: number, id: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(watchlists)
      .where(and(eq(watchlists.id, id), eq(watchlists.ownerId, ownerId)))
      .returning({ id: watchlists.id, wasDefault: watchlists.isDefault });

    if (removed === undefined) return false;
    if (!removed.wasDefault) return true;

    const [survivor] = await tx
      .select({ id: watchlists.id })
      .from(watchlists)
      .where(eq(watchlists.ownerId, ownerId))
      .orderBy(asc(watchlists.position), asc(watchlists.id))
      .limit(1);

    if (survivor !== undefined) {
      await tx.update(watchlists).set({ isDefault: true }).where(eq(watchlists.id, survivor.id));
    }
    return true;
  });
}

export async function setDefaultWatchlist(
  db: Database,
  ownerId: number,
  id: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const exists = await tx
      .select({ id: watchlists.id })
      .from(watchlists)
      .where(and(eq(watchlists.id, id), eq(watchlists.ownerId, ownerId)));
    if (exists.length === 0) return false;

    // Clear first, then set: the partial unique index refuses two defaults per
    // owner, so the reverse order deadlocks against itself.
    await tx
      .update(watchlists)
      .set({ isDefault: false })
      .where(and(eq(watchlists.ownerId, ownerId), eq(watchlists.isDefault, true)));
    await tx.update(watchlists).set({ isDefault: true }).where(eq(watchlists.id, id));
    return true;
  });
}

/** Rewrites the user's sidebar order from a complete list of ids, first to last. */
export async function reorderWatchlists(
  db: Database,
  ownerId: number,
  ids: readonly number[],
): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) {
      await tx
        .update(watchlists)
        .set({ position })
        .where(and(eq(watchlists.id, id), eq(watchlists.ownerId, ownerId)));
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

/** Members of one of the user's watchlists. The join on `ownerId` scopes it. */
export async function getWatchlistMembers(
  db: Database,
  ownerId: number,
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
    .innerJoin(
      watchlists,
      and(eq(watchlists.id, watchlistItems.watchlistId), eq(watchlists.ownerId, ownerId)),
    )
    .where(eq(watchlistItems.watchlistId, watchlistId))
    .orderBy(asc(watchlistItems.position), asc(watchlistItems.id));
}

/**
 * Adds instruments to one of the user's watchlists, skipping any already present.
 * Returns the instrument ids actually inserted (empty if the watchlist is not the
 * user's). `ON CONFLICT DO NOTHING` handles the double-click race.
 */
export async function addWatchlistItems(
  db: Database,
  ownerId: number,
  watchlistId: number,
  instrumentIds: readonly number[],
): Promise<number[]> {
  if (instrumentIds.length === 0) return [];

  return db.transaction(async (tx) => {
    if (!(await ownsWatchlist(tx, ownerId, watchlistId))) return [];

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
  ownerId: number,
  watchlistId: number,
  instrumentIds: readonly number[],
): Promise<number> {
  if (instrumentIds.length === 0) return 0;
  if (!(await ownsWatchlist(db, ownerId, watchlistId))) return 0;
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

/** Rewrites member order within one of the user's watchlists. */
export async function reorderWatchlistItems(
  db: Database,
  ownerId: number,
  watchlistId: number,
  instrumentIds: readonly number[],
): Promise<void> {
  if (instrumentIds.length === 0) return;
  await db.transaction(async (tx) => {
    if (!(await ownsWatchlist(tx, ownerId, watchlistId))) return;
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
  ownerId: number,
  watchlistId: number,
): Promise<StoredLayout | null> {
  const [row] = await db
    .select({
      columns: watchlistLayouts.columns,
      sort: watchlistLayouts.sort,
      filters: watchlistLayouts.filters,
      quickView: watchlistLayouts.quickView,
    })
    .from(watchlistLayouts)
    .innerJoin(
      watchlists,
      and(eq(watchlists.id, watchlistLayouts.watchlistId), eq(watchlists.ownerId, ownerId)),
    )
    .where(eq(watchlistLayouts.watchlistId, watchlistId));
  if (row === undefined) return null;
  return { columns: row.columns, sort: row.sort, filters: row.filters, quickView: row.quickView };
}

export async function saveWatchlistLayout(
  db: Database,
  ownerId: number,
  watchlistId: number,
  layout: StoredLayout,
): Promise<void> {
  if (!(await ownsWatchlist(db, ownerId, watchlistId))) return;
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

/** The user's views scoped to this watchlist, plus their global ones. */
export async function listWatchlistViews(
  db: Database,
  ownerId: number,
  watchlistId: number,
): Promise<StoredView[]> {
  return db
    .select()
    .from(watchlistViews)
    .where(
      and(
        eq(watchlistViews.ownerId, ownerId),
        sql`${watchlistViews.watchlistId} IS NULL OR ${watchlistViews.watchlistId} = ${watchlistId}`,
      ),
    )
    .orderBy(asc(watchlistViews.position), asc(watchlistViews.id));
}

export async function listGlobalWatchlistViews(
  db: Database,
  ownerId: number,
): Promise<StoredView[]> {
  return db
    .select()
    .from(watchlistViews)
    .where(and(eq(watchlistViews.ownerId, ownerId), isNull(watchlistViews.watchlistId)))
    .orderBy(asc(watchlistViews.position), asc(watchlistViews.id));
}

export async function saveWatchlistView(
  db: Database,
  ownerId: number,
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
      ownerId,
      watchlistId: input.watchlistId,
      name: input.name,
      columns: [...input.columns],
      sort: input.sort,
      filters: input.filters,
    })
    .onConflictDoUpdate({
      target: [watchlistViews.ownerId, watchlistViews.scopeId, watchlistViews.name],
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

export async function deleteWatchlistView(
  db: Database,
  ownerId: number,
  id: number,
): Promise<boolean> {
  const rows = await db
    .delete(watchlistViews)
    .where(and(eq(watchlistViews.id, id), eq(watchlistViews.ownerId, ownerId)))
    .returning({ id: watchlistViews.id });
  return rows.length > 0;
}
