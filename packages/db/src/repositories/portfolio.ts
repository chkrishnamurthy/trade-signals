import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { corporateActions, holdingEntries, instruments, portfolioUsage } from '../schema/index.js';

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

export async function listHoldingEntries(
  db: Database,
  ownerId: number,
): Promise<HoldingEntryRow[]> {
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
  return rows.map((r) => ({
    ...r,
    kind: r.kind as HoldingEntryKind,
    source: r.source as 'manual' | 'file',
  }));
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
  return db
    .transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${ownerId}::int, 105)`);

      let replaced = 0;
      const replaceIds = input.replaceInstrumentIds ?? [];
      if (replaceIds.length > 0) {
        const removed = await tx
          .delete(holdingEntries)
          .where(
            and(
              eq(holdingEntries.ownerId, ownerId),
              inArray(holdingEntries.instrumentId, [...replaceIds]),
            ),
          )
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
      return {
        ok: true as const,
        value: { inserted, skippedDuplicates: input.rows.length - inserted, replaced },
      };
    })
    .catch((error: unknown) => {
      if (error instanceof RejectedWrite)
        return { ok: false as const, reason: 'rejected' as const, message: error.message };
      if (error instanceof Error && error.name === 'TransactionRollbackError')
        return { ok: false as const, reason: 'limit_reached' as const };
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
  return rows.map((r) => ({
    ...r,
    kind: r.kind as HoldingEntryKind,
    source: r.source as 'manual' | 'file',
  }));
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
      if (error instanceof RejectedWrite)
        return { ok: false as const, reason: 'rejected' as const, message: error.message };
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
export async function listShareChanges(
  db: Database,
  instrumentIds: readonly number[],
): Promise<ShareChangeRow[]> {
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

export interface LatestCloses {
  readonly closePaise: number;
  readonly previousClosePaise: number | null;
  /** The session the newest close belongs to. */
  readonly at: Date;
}

/**
 * Newest and previous daily close for some instruments, from stored candles.
 * The fallback price for a holding the live-quote cache has not reached yet
 * (a stock added outside market hours, or one outside the refresh list).
 */
export async function latestDailyCloses(
  db: Database,
  instrumentIds: readonly number[],
): Promise<Map<number, LatestCloses>> {
  if (instrumentIds.length === 0) return new Map();
  const result = await db.execute<{
    instrument_id: number;
    ts: Date;
    close: number;
    rn: number;
  }>(sql`
    select instrument_id, ts, close, rn from (
      select instrument_id, ts, close,
             (row_number() over (partition by instrument_id order by ts desc))::int as rn
      from daily_candles
      where instrument_id in (${sql.join(
        instrumentIds.map((id) => sql`${id}`),
        sql`, `,
      )})
        and ts > now() - interval '45 days'
    ) t where rn <= 2`);
  const out = new Map<
    number,
    { closePaise: number; previousClosePaise: number | null; at: Date }
  >();
  for (const row of result.rows) {
    if (row.rn === 1)
      out.set(row.instrument_id, {
        closePaise: row.close,
        previousClosePaise: null,
        at: new Date(row.ts),
      });
  }
  for (const row of result.rows) {
    const cur = out.get(row.instrument_id);
    if (row.rn === 2 && cur !== undefined) cur.previousClosePaise = row.close;
  }
  return out;
}

/**
 * Corrects one of the owner's entries: shares, date and total amount. The kind and
 * the stock stay as they were; to change those, delete and add again. `validate`
 * sees the ledger AFTER the change and may veto it.
 */
export async function updateHoldingEntry(
  db: Database,
  ownerId: number,
  id: number,
  patch: { readonly tradeDate: string; readonly shares: number; readonly amountPaise: number },
  validate?: (ledger: readonly HoldingEntryRow[]) => string | null,
): Promise<WriteResult<boolean>> {
  return db
    .transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${ownerId}::int, 105)`);
      const updated = await tx
        .update(holdingEntries)
        .set({ tradeDate: patch.tradeDate, shares: patch.shares, amountPaise: patch.amountPaise })
        .where(and(eq(holdingEntries.ownerId, ownerId), eq(holdingEntries.id, id)))
        .returning({ id: holdingEntries.id });
      if (updated.length === 0) return { ok: true as const, value: false };
      if (validate !== undefined) {
        const problem = validate(await listHoldingEntriesTx(tx, ownerId));
        if (problem !== null) throw new RejectedWrite(problem);
      }
      return { ok: true as const, value: true };
    })
    .catch((error: unknown) => {
      if (error instanceof RejectedWrite)
        return { ok: false as const, reason: 'rejected' as const, message: error.message };
      throw error;
    });
}

export type PortfolioUsageEvent = 'view' | 'import' | 'add';

/**
 * Counts one use of the portfolio page. Counts and dates only; nothing about what
 * the user holds. A new UTC day adds one to `active_days`.
 */
export async function recordPortfolioUsage(
  db: Database,
  ownerId: number,
  event: PortfolioUsageEvent,
): Promise<void> {
  const views = event === 'view' ? 1 : 0;
  const imports = event === 'import' ? 1 : 0;
  const added = event === 'add' ? 1 : 0;
  await db
    .insert(portfolioUsage)
    .values({ ownerId, views, imports, entriesAdded: added })
    .onConflictDoUpdate({
      target: portfolioUsage.ownerId,
      set: {
        views: sql`${portfolioUsage.views} + ${views}`,
        imports: sql`${portfolioUsage.imports} + ${imports}`,
        entriesAdded: sql`${portfolioUsage.entriesAdded} + ${added}`,
        activeDays: sql`${portfolioUsage.activeDays} + case when (${portfolioUsage.lastSeenAt} at time zone 'UTC')::date < (now() at time zone 'UTC')::date then 1 else 0 end`,
        lastSeenAt: sql`now()`,
      },
    });
}

export interface PortfolioUsageSummary {
  /** Users who opened the page at least once. */
  readonly users: number;
  /** Users who have at least one entry right now. */
  readonly usersWithEntries: number;
  readonly usersWhoImported: number;
  /** Users active in the last 7 days. */
  readonly activeLast7Days: number;
  /** Of users who first came 30+ days ago, how many were seen again 30+ days later. */
  readonly eligibleFor30DayReturn: number;
  readonly returnedAfter30Days: number;
}

/** Totals across all users, for the admin page. No row identifies a person or a holding. */
export async function portfolioUsageSummary(db: Database): Promise<PortfolioUsageSummary> {
  const result = await db.execute<{
    users: number;
    imported: number;
    active7: number;
    eligible: number;
    returned: number;
    with_entries: number;
  }>(sql`
    select
      count(*)::int as users,
      count(*) filter (where imports > 0)::int as imported,
      count(*) filter (where last_seen_at > now() - interval '7 days')::int as active7,
      count(*) filter (where first_seen_at <= now() - interval '30 days')::int as eligible,
      count(*) filter (where first_seen_at <= now() - interval '30 days'
                         and last_seen_at >= first_seen_at + interval '30 days')::int as returned,
      (select count(distinct owner_id)::int from holding_entries) as with_entries
    from portfolio_usage`);
  const row = result.rows[0];
  return {
    users: row?.users ?? 0,
    usersWithEntries: row?.with_entries ?? 0,
    usersWhoImported: row?.imported ?? 0,
    activeLast7Days: row?.active7 ?? 0,
    eligibleFor30DayReturn: row?.eligible ?? 0,
    returnedAfter30Days: row?.returned ?? 0,
  };
}
