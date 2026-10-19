import type { MarketEventType } from '@equitywise/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  amfiCategories,
  corporateActions,
  dividends,
  fairMarketValues2018,
  holdingEntries,
  indexMemberships,
  instrumentReference,
  instruments,
  marketEvents,
  portfolioUsage,
} from '../schema/index.js';
import { hasTakenEffect } from './candles.js';

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
  readonly acquiredOn: string | null;
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
  readonly acquiredOn?: string | null;
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
      acquiredOn: holdingEntries.acquiredOn,
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
 * Inside one owner-scoped transaction: take the owner's lock, add the new rows
 * (never deleting any: a holdings file reconciles, it does not replace), then let
 * `validate` look at the resulting
 * ledger and veto the whole write (for example a removal of shares never held).
 * Two requests from the same owner cannot interleave between the check and the
 * insert.
 */
export async function writeHoldingEntries(
  db: Database,
  ownerId: number,
  input: {
    readonly rows: readonly NewHoldingEntry[];
    readonly validate?: (ledger: readonly HoldingEntryRow[]) => string | null;
  },
): Promise<WriteResult<{ inserted: number; skippedDuplicates: number }>> {
  return db
    .transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${ownerId}::int, 105)`);

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
              acquiredOn: r.acquiredOn ?? null,
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
        value: { inserted, skippedDuplicates: input.rows.length - inserted },
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
      acquiredOn: holdingEntries.acquiredOn,
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
        // Announced ones are on record up to a month ahead; only those in effect restate shares.
        hasTakenEffect,
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
  patch: {
    readonly tradeDate: string;
    readonly shares: number;
    readonly amountPaise: number;
    readonly acquiredOn?: string | null;
  },
  validate?: (ledger: readonly HoldingEntryRow[]) => string | null,
): Promise<WriteResult<boolean>> {
  return db
    .transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${ownerId}::int, 105)`);
      const updated = await tx
        .update(holdingEntries)
        .set({
          tradeDate: patch.tradeDate,
          shares: patch.shares,
          amountPaise: patch.amountPaise,
          ...(patch.acquiredOn === undefined ? {} : { acquiredOn: patch.acquiredOn }),
        })
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

export type AmfiCategory = 'large' | 'mid' | 'small';

export interface HoldingReference {
  /** NSE index industry, or null when NSE has not classified the stock. */
  readonly industry: string | null;
  /** Current index memberships, e.g. `nifty100`. */
  readonly indexKeys: readonly string[];
  /** AMFI's Large / Mid / Small Cap category, or null when the stock is not on its list. */
  readonly amfiCategory: AmfiCategory | null;
}

/** Industry and current index memberships for some instruments. Unknown ids get an empty entry. */
export async function holdingReference(
  db: Database,
  instrumentIds: readonly number[],
): Promise<Map<number, HoldingReference>> {
  const out = new Map<
    number,
    { industry: string | null; indexKeys: string[]; amfiCategory: AmfiCategory | null }
  >();
  if (instrumentIds.length === 0) return out;
  for (const id of instrumentIds)
    out.set(id, { industry: null, indexKeys: [], amfiCategory: null });
  const [refs, memberships, categories] = await Promise.all([
    db
      .select({
        instrumentId: instrumentReference.instrumentId,
        industry: instrumentReference.industry,
      })
      .from(instrumentReference)
      .where(inArray(instrumentReference.instrumentId, [...instrumentIds])),
    db
      .select({ instrumentId: indexMemberships.instrumentId, indexKey: indexMemberships.indexKey })
      .from(indexMemberships)
      .where(
        and(
          inArray(indexMemberships.instrumentId, [...instrumentIds]),
          isNull(indexMemberships.effectiveTo),
        ),
      ),
    db
      .select({ instrumentId: instruments.id, category: amfiCategories.category })
      .from(instruments)
      .innerJoin(amfiCategories, eq(amfiCategories.isin, instruments.isin))
      .where(inArray(instruments.id, [...instrumentIds])),
  ]);
  for (const r of refs) {
    const cur = out.get(r.instrumentId);
    if (cur !== undefined) cur.industry = r.industry;
  }
  for (const m of memberships) out.get(m.instrumentId)?.indexKeys.push(m.indexKey);
  for (const c of categories) {
    const cur = out.get(c.instrumentId);
    if (
      cur !== undefined &&
      (c.category === 'large' || c.category === 'mid' || c.category === 'small')
    )
      cur.amfiCategory = c.category;
  }
  return out;
}

export interface UpcomingHoldingEvent {
  readonly instrumentId: number;
  readonly eventType: string;
  readonly eventDate: string;
  readonly title: string;
  /** Dividend a share in paise, when the dividend record has one for that ex-date. */
  readonly dividendPaise: number | null;
}

/**
 * Corporate events on the calendar for some instruments between two dates:
 * results and board meetings, dividends, bonuses, splits, rights issues and
 * buybacks. Dividend amounts come from the `dividends` table where known.
 */
export async function upcomingHoldingEvents(
  db: Database,
  instrumentIds: readonly number[],
  from: string,
  to: string,
): Promise<UpcomingHoldingEvent[]> {
  if (instrumentIds.length === 0) return [];
  const types: MarketEventType[] = [
    'result',
    'board_meeting',
    'dividend',
    'bonus',
    'stock_split',
    'rights_issue',
    'buyback',
  ];
  const [events, divs] = await Promise.all([
    db
      .select({
        instrumentId: marketEvents.instrumentId,
        eventType: marketEvents.eventType,
        eventDate: marketEvents.eventDate,
        title: marketEvents.title,
      })
      .from(marketEvents)
      .where(
        and(
          inArray(marketEvents.instrumentId, [...instrumentIds]),
          inArray(marketEvents.eventType, types),
          gte(marketEvents.eventDate, from),
          lte(marketEvents.eventDate, to),
        ),
      )
      .orderBy(asc(marketEvents.eventDate)),
    db
      .select({
        instrumentId: dividends.instrumentId,
        exDate: dividends.exDate,
        amountPaise: dividends.amountPaise,
      })
      .from(dividends)
      .where(
        and(
          inArray(dividends.instrumentId, [...instrumentIds]),
          gte(dividends.exDate, from),
          lte(dividends.exDate, to),
        ),
      ),
  ]);
  // Per-share amount per instrument and ex-date (interim and special on one day add up).
  const amount = new Map<string, { instrumentId: number; exDate: string; paise: number | null }>();
  for (const d of divs) {
    const key = `${d.instrumentId}|${d.exDate}`;
    const cur = amount.get(key) ?? { instrumentId: d.instrumentId, exDate: d.exDate, paise: null };
    if (d.amountPaise !== null) cur.paise = (cur.paise ?? 0) + d.amountPaise;
    amount.set(key, cur);
  }
  const dayGap = (x: string, y: string) => Math.abs(Date.parse(x) - Date.parse(y)) / 86_400_000;

  const seen = new Set<string>();
  const out: { -readonly [K in keyof UpcomingHoldingEvent]: UpcomingHoldingEvent[K] }[] = [];
  for (const e of events) {
    if (e.instrumentId === null) continue;
    const key = `${e.instrumentId}|${e.eventType}|${e.eventDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      instrumentId: e.instrumentId,
      eventType: e.eventType,
      eventDate: e.eventDate,
      title: e.title,
      dividendPaise: null,
    });
  }
  // NSE often lists a board meeting and the results it is for on the same day: keep the results.
  const results = new Set(
    out.filter((e) => e.eventType === 'result').map((e) => `${e.instrumentId}|${e.eventDate}`),
  );
  const withoutDuplicateMeetings = out.filter(
    (e) => !(e.eventType === 'board_meeting' && results.has(`${e.instrumentId}|${e.eventDate}`)),
  );
  // Match each dividend record to the calendar's dividend for that stock within three
  // days (the two sources sometimes disagree on the date); unmatched records still matter.
  for (const d of amount.values()) {
    const match = withoutDuplicateMeetings.find(
      (e) =>
        e.eventType === 'dividend' &&
        e.instrumentId === d.instrumentId &&
        dayGap(e.eventDate, d.exDate) <= 3,
    );
    if (match !== undefined) {
      if (match.dividendPaise === null) match.dividendPaise = d.paise;
      continue;
    }
    withoutDuplicateMeetings.push({
      instrumentId: d.instrumentId,
      eventType: 'dividend',
      eventDate: d.exDate,
      title: 'Dividend',
      dividendPaise: d.paise,
    });
  }
  const sorted = withoutDuplicateMeetings;
  return sorted.sort((a, b) =>
    a.eventDate < b.eventDate
      ? -1
      : a.eventDate > b.eventDate
        ? 1
        : a.instrumentId - b.instrumentId,
  );
}

export interface DailyClose {
  /** Session date, IST. */
  readonly date: string;
  readonly closePaise: number;
}

/**
 * Raw daily closes (as traded, never adjusted) for some instruments between two
 * IST dates, oldest first. One query for every held stock; returns and value
 * over time apply splits themselves, by date.
 */
export async function dailyClosesBetween(
  db: Database,
  instrumentIds: readonly number[],
  from: string,
  to: string,
): Promise<Map<number, DailyClose[]>> {
  const out = new Map<number, DailyClose[]>();
  if (instrumentIds.length === 0) return out;
  const result = await db.execute<{ instrument_id: number; day: string; close: number }>(sql`
    select distinct on (instrument_id, day) instrument_id, day, close from (
      select instrument_id,
             to_char(ts at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day,
             close, ts
      from daily_candles
      where instrument_id in (${sql.join(
        instrumentIds.map((id) => sql`${id}`),
        sql`, `,
      )})
        and ts >= (${from}::date - interval '1 day')
        and ts < (${to}::date + interval '1 day')
    ) t
    where day between ${from} and ${to}
    order by instrument_id, day, ts desc`);
  for (const row of result.rows) {
    const list = out.get(row.instrument_id) ?? [];
    list.push({ date: row.day, closePaise: Number(row.close) });
    out.set(row.instrument_id, list);
  }
  return out;
}

export interface DividendRecord {
  readonly instrumentId: number;
  readonly exDate: string;
  readonly kind: string;
  /** Per share, paise; null when the source did not state it. */
  readonly amountPaise: number | null;
}

/** Cash dividends with an ex-date in a range, for some instruments. */
export async function dividendsBetween(
  db: Database,
  instrumentIds: readonly number[],
  from: string,
  to: string,
): Promise<DividendRecord[]> {
  if (instrumentIds.length === 0) return [];
  return db
    .select({
      instrumentId: dividends.instrumentId,
      exDate: dividends.exDate,
      kind: dividends.kind,
      amountPaise: dividends.amountPaise,
    })
    .from(dividends)
    .where(
      and(
        inArray(dividends.instrumentId, [...instrumentIds]),
        gte(dividends.exDate, from),
        lte(dividends.exDate, to),
      ),
    )
    .orderBy(asc(dividends.exDate));
}

/** The worker checkpoint that records how far back corporate actions were loaded. */
export const CORPORATE_HISTORY_CHECKPOINT = 'corporate-actions-history';

/**
 * The earliest date from which splits, bonuses and dividends are on record: the
 * long history load if it has run, else the oldest recorded action. Null when
 * nothing is recorded.
 */
export async function corporateHistoryFrom(db: Database): Promise<string | null> {
  const result = await db.execute<{ from_date: string | null }>(sql`
    select coalesce(
      (select cursor->>'from' from worker_checkpoints where job = ${CORPORATE_HISTORY_CHECKPOINT} and (cursor->>'done')::boolean),
      (select to_char(min(ex_date), 'YYYY-MM-DD') from corporate_actions)
    ) as from_date`);
  return result.rows[0]?.from_date ?? null;
}

export interface FairMarketValue2018 {
  readonly isin: string;
  readonly symbol: string;
  readonly highPaise: number;
  readonly closePaise: number;
}

/** Records 31 Jan 2018 highs; a re-run replaces a row with the same ISIN. */
export async function upsertFairMarketValues2018(
  db: Database,
  rows: readonly FairMarketValue2018[],
  source: string,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += 1_000) {
    const chunk = rows.slice(i, i + 1_000);
    if (chunk.length === 0) continue;
    const result = await db
      .insert(fairMarketValues2018)
      .values(chunk.map((r) => ({ ...r, source })))
      .onConflictDoUpdate({
        target: fairMarketValues2018.isin,
        set: {
          symbol: sql`excluded.symbol`,
          highPaise: sql`excluded.high_paise`,
          closePaise: sql`excluded.close_paise`,
          source: sql`excluded.source`,
        },
      })
      .returning({ isin: fairMarketValues2018.isin });
    written += result.length;
  }
  return written;
}

/**
 * The 31 Jan 2018 high for some instruments, by instrument id: matched on ISIN
 * first (symbols change), then on the symbol.
 */
export async function fairMarketValuesFor(
  db: Database,
  instrumentIds: readonly number[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (instrumentIds.length === 0) return out;
  const result = await db.execute<{ id: number; high_paise: number }>(sql`
    select i.id, coalesce(by_isin.high_paise, by_symbol.high_paise) as high_paise
    from instruments i
    left join fair_market_values_2018 by_isin on by_isin.isin = i.isin
    left join lateral (
      select f.high_paise from fair_market_values_2018 f where f.symbol = i.symbol limit 1
    ) by_symbol on true
    where i.id in (${sql.join(
      instrumentIds.map((id) => sql`${id}`),
      sql`, `,
    )})`);
  for (const row of result.rows)
    if (row.high_paise !== null) out.set(row.id, Number(row.high_paise));
  return out;
}

/** Whether the 2018 values have been loaded at all (the tax view says so when not). */
export async function fairMarketValuesLoaded(db: Database): Promise<boolean> {
  const result = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from fair_market_values_2018`,
  );
  return (result.rows[0]?.n ?? 0) > 0;
}

/** Instrument ids of benchmark indices by symbol (e.g. NIFTY50, NIFTY500). */
export async function indexInstrumentIds(
  db: Database,
  symbols: readonly string[],
): Promise<Map<string, number>> {
  if (symbols.length === 0) return new Map();
  const rows = await db
    .select({ id: instruments.id, symbol: instruments.symbol })
    .from(instruments)
    .where(and(inArray(instruments.symbol, [...symbols]), eq(instruments.kind, 'index')));
  return new Map(rows.map((r) => [r.symbol, r.id]));
}

/** ISIN for some instruments, where known. */
export async function instrumentIsins(
  db: Database,
  instrumentIds: readonly number[],
): Promise<Map<number, string>> {
  if (instrumentIds.length === 0) return new Map();
  const rows = await db
    .select({ id: instruments.id, isin: instruments.isin })
    .from(instruments)
    .where(inArray(instruments.id, [...instrumentIds]));
  return new Map(rows.filter((r) => r.isin !== null).map((r) => [r.id, r.isin as string]));
}

/** NSE equity instruments by ISIN, for files that name a stock by ISIN (statements, contract notes). */
export async function instrumentsByIsin(
  db: Database,
  isins: readonly string[],
): Promise<Map<string, { id: number; symbol: string; name: string }>> {
  const wanted = [...new Set(isins.map((i) => i.trim().toUpperCase()).filter((i) => i !== ''))];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({
      id: instruments.id,
      symbol: instruments.symbol,
      name: instruments.name,
      isin: instruments.isin,
    })
    .from(instruments)
    .where(
      and(
        inArray(instruments.isin, wanted),
        eq(instruments.exchange, 'NSE'),
        eq(instruments.kind, 'equity'),
      ),
    );
  return new Map(
    rows.flatMap((r) =>
      r.isin === null ? [] : [[r.isin, { id: r.id, symbol: r.symbol, name: r.name }]],
    ),
  );
}

/**
 * For each wanted (instrument, date): that instrument's newest raw close on or
 * before the date (IST session day), if it has one. Only the rows asked for are
 * read, not a stock's whole history: used where a price is needed on a few known
 * days (an opening balance valued on its own date). Result per instrument,
 * oldest first, one entry per distinct close day.
 */
export async function closesOnOrBefore(
  db: Database,
  wanted: readonly { readonly instrumentId: number; readonly date: string }[],
): Promise<Map<number, DailyClose[]>> {
  const out = new Map<number, DailyClose[]>();
  const pairs = [...new Set(wanted.map((w) => `${w.instrumentId}|${w.date}`))].map((key) => {
    const [id, date] = key.split('|');
    return { id: Number(id), date: date ?? '' };
  });
  if (pairs.length === 0) return out;
  const result = await db.execute<{ instrument_id: number; day: string; close: number }>(sql`
    select distinct on (v.instrument_id, c.day) v.instrument_id, c.day, c.close
    from (values ${sql.join(
      pairs.map((p) => sql`(${p.id}::int, ${p.date}::date)`),
      sql`, `,
    )}) as v(instrument_id, day)
    cross join lateral (
      select to_char(ts at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day, close
      from daily_candles
      where instrument_id = v.instrument_id
        and ts < ((v.day + 1)::timestamp at time zone 'Asia/Kolkata')
      order by ts desc
      limit 1
    ) c
    order by v.instrument_id, c.day`);
  for (const row of result.rows) {
    const list = out.get(row.instrument_id) ?? [];
    list.push({ date: row.day, closePaise: Number(row.close) });
    out.set(row.instrument_id, list);
  }
  return out;
}

export interface AmfiRowInput {
  readonly isin: string;
  readonly nseSymbol: string | null;
  readonly category: AmfiCategory;
}

/** The period end (YYYY-MM-DD) of the AMFI list on file, or null when none is loaded. */
export async function latestAmfiPeriod(db: Database): Promise<string | null> {
  const result = await db.execute<{ p: string | null }>(
    sql`select max(period_end)::text as p from amfi_categories`,
  );
  return result.rows[0]?.p ?? null;
}

/**
 * Loads one AMFI list: each ISIN takes the new category and period. Safe to run
 * again; a stock that dropped off the list keeps its old row until it is on one.
 */
export async function upsertAmfiCategories(
  db: Database,
  rows: readonly AmfiRowInput[],
  periodEnd: string,
): Promise<number> {
  let written = 0;
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    if (part.length === 0) continue;
    const result = await db
      .insert(amfiCategories)
      .values(part.map((r) => ({ ...r, periodEnd })))
      .onConflictDoUpdate({
        target: amfiCategories.isin,
        set: {
          nseSymbol: sql`excluded.nse_symbol`,
          category: sql`excluded.category`,
          periodEnd: sql`excluded.period_end`,
        },
      })
      .returning({ isin: amfiCategories.isin });
    written += result.length;
  }
  return written;
}
