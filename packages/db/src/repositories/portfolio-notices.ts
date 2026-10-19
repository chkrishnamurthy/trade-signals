import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { holdingEntries, holdingNoticeSettings, holdingNotices } from '../schema/index.js';

/**
 * In-app notices about a user's own holdings (portfolio phase 6.2), and which
 * of them the user gets. Every read and write is scoped by owner (rule 9);
 * nothing here is logged.
 */

export interface NoticeSettingsRow {
  readonly events: boolean;
  readonly shareChanges: boolean;
  readonly stockMoves: boolean;
  readonly stockMovePercent: number;
  readonly portfolioMoves: boolean;
  readonly portfolioMovePercent: number;
  readonly longTerm: boolean;
  readonly longTermDays: number;
}

export const DEFAULT_NOTICE_SETTINGS_ROW: NoticeSettingsRow = {
  events: true,
  shareChanges: true,
  stockMoves: true,
  stockMovePercent: 5,
  portfolioMoves: true,
  portfolioMovePercent: 3,
  longTerm: true,
  longTermDays: 7,
};

export async function getNoticeSettings(db: Database, ownerId: number): Promise<NoticeSettingsRow> {
  const [row] = await db
    .select({
      events: holdingNoticeSettings.events,
      shareChanges: holdingNoticeSettings.shareChanges,
      stockMoves: holdingNoticeSettings.stockMoves,
      stockMovePercent: holdingNoticeSettings.stockMovePercent,
      portfolioMoves: holdingNoticeSettings.portfolioMoves,
      portfolioMovePercent: holdingNoticeSettings.portfolioMovePercent,
      longTerm: holdingNoticeSettings.longTerm,
      longTermDays: holdingNoticeSettings.longTermDays,
    })
    .from(holdingNoticeSettings)
    .where(eq(holdingNoticeSettings.ownerId, ownerId));
  return row ?? DEFAULT_NOTICE_SETTINGS_ROW;
}

export async function saveNoticeSettings(
  db: Database,
  ownerId: number,
  settings: NoticeSettingsRow,
): Promise<void> {
  await db
    .insert(holdingNoticeSettings)
    .values({ ownerId, ...settings })
    .onConflictDoUpdate({
      target: holdingNoticeSettings.ownerId,
      set: { ...settings, updatedAt: sql`now()` },
    });
}

/** Settings for many owners at once (the worker); a missing row means the defaults. */
export async function noticeSettingsFor(
  db: Database,
  ownerIds: readonly number[],
): Promise<Map<number, NoticeSettingsRow>> {
  const out = new Map<number, NoticeSettingsRow>();
  for (const id of ownerIds) out.set(id, DEFAULT_NOTICE_SETTINGS_ROW);
  if (ownerIds.length === 0) return out;
  const rows = await db
    .select()
    .from(holdingNoticeSettings)
    .where(inArray(holdingNoticeSettings.ownerId, [...ownerIds]));
  for (const r of rows)
    out.set(r.ownerId, {
      events: r.events,
      shareChanges: r.shareChanges,
      stockMoves: r.stockMoves,
      stockMovePercent: r.stockMovePercent,
      portfolioMoves: r.portfolioMoves,
      portfolioMovePercent: r.portfolioMovePercent,
      longTerm: r.longTerm,
      longTermDays: r.longTermDays,
    });
  return out;
}

export interface NoticeInsert {
  readonly ownerId: number;
  readonly kind: string;
  readonly instrumentId: number | null;
  readonly dedupeKey: string;
  readonly noticeDate: string;
  readonly data: Record<string, unknown>;
}

/** Writes new notices; one already written (same owner, kind and key) is skipped. */
export async function insertNotices(db: Database, rows: readonly NoticeInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await db
    .insert(holdingNotices)
    .values(rows.map((r) => ({ ...r })))
    .onConflictDoNothing({
      target: [holdingNotices.ownerId, holdingNotices.kind, holdingNotices.dedupeKey],
    })
    .returning({ id: holdingNotices.id });
  return result.length;
}

export interface NoticeRow {
  readonly id: number;
  readonly kind: string;
  readonly noticeDate: string;
  readonly data: Record<string, unknown>;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}

export async function listNotices(
  db: Database,
  ownerId: number,
  limit = 100,
): Promise<NoticeRow[]> {
  return db
    .select({
      id: holdingNotices.id,
      kind: holdingNotices.kind,
      noticeDate: holdingNotices.noticeDate,
      data: holdingNotices.data,
      createdAt: holdingNotices.createdAt,
      readAt: holdingNotices.readAt,
    })
    .from(holdingNotices)
    .where(eq(holdingNotices.ownerId, ownerId))
    .orderBy(desc(holdingNotices.createdAt), desc(holdingNotices.id))
    .limit(limit);
}

export async function unreadNoticeCount(db: Database, ownerId: number): Promise<number> {
  const result = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(holdingNotices)
    .where(and(eq(holdingNotices.ownerId, ownerId), isNull(holdingNotices.readAt)));
  return result[0]?.n ?? 0;
}

/** Marks the owner's notices read: the ones given, or all when none are given. */
export async function markNoticesRead(
  db: Database,
  ownerId: number,
  ids?: readonly number[],
): Promise<number> {
  const conditions = [eq(holdingNotices.ownerId, ownerId), isNull(holdingNotices.readAt)];
  if (ids !== undefined) {
    if (ids.length === 0) return 0;
    conditions.push(inArray(holdingNotices.id, [...ids]));
  }
  const result = await db
    .update(holdingNotices)
    .set({ readAt: sql`now()` })
    .where(and(...conditions))
    .returning({ id: holdingNotices.id });
  return result.length;
}

/** Owners with any portfolio entry: whose holdings the worker looks at. */
export async function ownersWithHoldingEntries(db: Database): Promise<number[]> {
  const rows = await db
    .selectDistinct({ ownerId: holdingEntries.ownerId })
    .from(holdingEntries)
    .orderBy(holdingEntries.ownerId);
  return rows.map((r) => r.ownerId);
}

/** Drops notices older than `before` (they have served their day). */
export async function pruneNotices(db: Database, before: Date): Promise<number> {
  const result = await db
    .delete(holdingNotices)
    .where(lt(holdingNotices.createdAt, before))
    .returning({ id: holdingNotices.id });
  return result.length;
}
