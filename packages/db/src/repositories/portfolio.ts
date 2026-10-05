import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { corporateActions, holdingEntries, instruments } from '../schema/index.js';

/**
 * A user's own typed or uploaded share entries (`schema/portfolio.ts`).
 *
 * PRIVATE (CLAUDE.md rule 9). Every function takes `ownerId` and scopes every
 * statement by it; none returns another owner's rows. Callers must not log what
 * comes back.
 */

/** A free user's ceiling. Stops abuse; a long-term investor's ledger is far smaller. */
export const MAX_PORTFOLIO_ENTRIES = 5_000;

export type HoldingEntryKind = 'opening' | 'add' | 'remove';

export interface HoldingEntryRow {
  readonly id: number;
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly kind: HoldingEntryKind;
  readonly tradeDate: string;
  readonly shares: number;
  readonly amountPaise: number;
  readonly source: 'manual' | 'file';
  readonly tradeId: string | null;
  readonly createdAt: Date;
}

export interface NewHoldingEntry {
  readonly instrumentId: number;
  readonly kind: HoldingEntryKind;
  readonly tradeDate: string;
  readonly shares: number;
  readonly amountPaise: number;
  readonly source: 'manual' | 'file';
  readonly tradeId?: string | null;
}

export async function listHoldingEntries(db: Database, ownerId: number): Promise<HoldingEntryRow[]> {
  const rows = await db
    .select({
      id: holdingEntries.id,
      instrumentId: holdingEntries.instrumentId,
      symbol: instruments.symbol,
      name: instruments.name,
      kind: holdingEntries.kind,
      tradeDate: holdingEntries.tradeDate,
      shares: holdingEntries.shares,
      amountPaise: holdingEntries.amountPaise,
      source: holdingEntries.source,
      tradeId: holdingEntries.tradeId,
      createdAt: holdingEntries.createdAt,
    })
    .from(holdingEntries)
    .innerJoin(instruments, eq(instruments.id, holdingEntries.instrumentId))
    .where(eq(holdingEntries.ownerId, ownerId))
    .orderBy(desc(holdingEntries.tradeDate), desc(holdingEntries.id));
  return rows.map((r) => ({ ...r, kind: r.kind as HoldingEntryKind, source: r.source as 'manual' | 'file' }));
}

export type WriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'limit_reached' }
  | { ok: false; reason: 'rejected'; message: string };

/**
 * Inside one owner-scoped transaction: take the owner's lock, optionally clear
 * some stocks, add the new rows, then let `validate` look at the resulting
 * ledger and veto the whole write (for example a removal of shares never held).
 * Two requests from the same owner cannot interleave between the check and the
 * insert.
 */
export async function writeHoldingEntries(
  db: Database,
  ownerId: number,
  input: {
    readonly rows: readonly NewHoldingEntry[];
    /** Delete every existing entry for these instruments first (a fresh holdings snapshot). */
    readonly replaceInstrumentIds?: readonly number[];
    readonly validate?: (ledger: readonly HoldingEntryRow[]) => string | null;
  },
): Promise<WriteResult<{ inserted: number; skippedDuplicates: number; replaced: number }>> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ownerId}::int, 105)`);

    let replaced = 0;
    const replaceIds = input.replaceInstrumentIds ?? [];
    if (replaceIds.length > 0) {
      const removed = await tx
        .delete(holdingEntries)
        .where(and(eq(holdingEntries.ownerId, ownerId), inArray(holdingEntries.instrumentId, [...replaceIds])))
        .returning({ id: holdingEntries.id });
      replaced = removed.length;
    }

    let inserted = 0;
    if (input.rows.length > 0) {
      const result = await tx
        .insert(holdingEntries)
        .values(
          input.rows.map((r) => ({
            ownerId,
            instrumentId: r.instrumentId,
            kind: r.kind,
            tradeDate: r.tradeDate,
            shares: r.shares,
            amountPaise: r.amountPaise,
            source: r.source,
            tradeId: r.tradeId ?? null,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: holdingEntries.id });
      inserted = result.length;
    }

    const [{ n } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(holdingEntries)
      .where(eq(holdingEntries.ownerId, ownerId));
    if (n > MAX_PORTFOLIO_ENTRIES) {
      tx.rollback();
    }

    if (input.validate !== undefined) {
      const ledger = await listHoldingEntriesTx(tx, ownerId);
      const problem = input.validate(ledger);
      if (problem !== null) {
        // Throwing rolls the transaction back; the sentinel carries the message out.
        throw new RejectedWrite(problem);
      }
    }
    return { ok: true as const, value: { inserted, skippedDuplicates: input.rows.length - inserted, replaced } };
  }).catch((error: unknown) => {
    if (error instanceof RejectedWrite) return { ok: false as const, reason: 'rejected' as const, message: error.message };
    if (error instanceof Error && error.name === 'TransactionRollbackError') return { ok: false as const, reason: 'limit_reached' as const };
    throw error;
  });
}

class RejectedWrite extends Error {}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

async function listHoldingEntriesTx(tx: Tx, ownerId: number): Promise<HoldingEntryRow[]> {
  const rows = await tx
    .select({
      id: holdingEntries.id,
      instrumentId: holdingEntries.instrumentId,
      symbol: instruments.symbol,
      name: instruments.name,
      kind: holdingEntries.kind,
      tradeDate: holdingEntries.tradeDate,
      shares: holdingEntries.shares,
      amountPaise: holdingEntries.amountPaise,
      source: holdingEntries.source,
      tradeId: holdingEntries.tradeId,
      createdAt: holdingEntries.createdAt,
    })
    .from(holdingEntries)
    .innerJoin(instruments, eq(instruments.id, holdingEntries.instrumentId))
    .where(eq(holdingEntries.ownerId, ownerId));
  return rows.map((r) => ({ ...r, kind: r.kind as HoldingEntryKind, source: r.source as 'manual' | 'file' }));
}

/** Deletes one of the owner's entries. `validate` may veto (removing an add can orphan a later removal). */
export async function deleteHoldingEntry(
  db: Database,
  ownerId: number,
  id: number,
  validate?: (ledger: readonly HoldingEntryRow[]) => string | null,
): Promise<WriteResult<boolean>> {
  return db
    .transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${ownerId}::int, 105)`);
      const removed = await tx
        .delete(holdingEntries)
        .where(and(eq(holdingEntries.ownerId, ownerId), eq(holdingEntries.id, id)))
        .returning({ id: holdingEntries.id });
      if (removed.length === 0) return { ok: true as const, value: false };
      if (validate !== undefined) {
        const problem = validate(await listHoldingEntriesTx(tx, ownerId));
        if (problem !== null) throw new RejectedWrite(problem);
      }
      return { ok: true as const, value: true };
    })
    .catch((error: unknown) => {
      if (error instanceof RejectedWrite) return { ok: false as const, reason: 'rejected' as const, message: error.message };
      throw error;
    });
}

/** Removes everything the owner has entered. Returns how many rows went. */
export async function deleteAllHoldingEntries(db: Database, ownerId: number): Promise<number> {
  const removed = await db
    .delete(holdingEntries)
    .where(eq(holdingEntries.ownerId, ownerId))
    .returning({ id: holdingEntries.id });
  return removed.length;
}

export interface ShareChangeRow {
  readonly instrumentId: number;
  readonly kind: string;
  readonly exDate: string;
  readonly ratio: number;
}

/** Splits, bonuses and consolidations for some instruments, to apply on read. */
export async function listShareChanges(db: Database, instrumentIds: readonly number[]): Promise<ShareChangeRow[]> {
  if (instrumentIds.length === 0) return [];
  const rows = await db
    .select({
      instrumentId: corporateActions.instrumentId,
      kind: corporateActions.kind,
      exDate: corporateActions.exDate,
      ratio: corporateActions.ratio,
    })
    .from(corporateActions)
    .where(
      and(
        inArray(corporateActions.instrumentId, [...instrumentIds]),
        inArray(corporateActions.kind, ['split', 'bonus', 'consolidation']),
      ),
    );
  return rows.map((r) => ({ ...r, ratio: Number(r.ratio) }));
}
