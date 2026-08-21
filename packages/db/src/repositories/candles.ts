import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { corporateActions, dailyCandles, minuteCandles } from '../schema/index.js';

/**
 * Candle persistence and adjusted reads.
 *
 * Two rules shape every function here:
 *
 *  - Writes are append-only and idempotent (hard rule 5). Re-running an
 *    ingestion inserts nothing it already has and never UPDATEs. A database
 *    trigger enforces this independently — see migration 0002.
 *  - Reads apply corporate actions on the way out. Raw rows are the historical
 *    record; adjusted rows are what indicators must see.
 */

/** A bar in the shape `@signal/core` consumes. Prices are integer paise. */
export interface StoredBar {
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface CandleInput {
  readonly instrumentId: number;
  readonly ts: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** Postgres caps a statement at 65535 bind parameters; 8 columns per row. */
const INSERT_CHUNK = 2_000;

/**
 * Appends daily candles, skipping any already present.
 *
 * `ON CONFLICT DO NOTHING` rather than `DO UPDATE`: if a provider sends a
 * different price for a session we already stored, that is a discrepancy worth
 * investigating, not something to silently overwrite the record with.
 *
 * @returns rows actually inserted.
 */
export async function insertDailyCandles(
  db: Database,
  providerId: string,
  rows: readonly CandleInput[],
): Promise<number> {
  return insertCandles(db, dailyCandles, providerId, rows);
}

export async function insertMinuteCandles(
  db: Database,
  providerId: string,
  rows: readonly CandleInput[],
): Promise<number> {
  return insertCandles(db, minuteCandles, providerId, rows);
}

async function insertCandles(
  db: Database,
  table: typeof dailyCandles | typeof minuteCandles,
  providerId: string,
  rows: readonly CandleInput[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK).map((row) => ({ ...row, providerId }));
    if (chunk.length === 0) continue;
    const result = await db.insert(table).values(chunk).onConflictDoNothing().returning({
      ts: table.ts,
    });
    written += result.length;
  }
  return written;
}

/**
 * Cumulative adjustment factors by ex-date, newest first.
 *
 * A bar is adjusted by the product of every factor whose ex-date is AFTER it.
 * Two splits between then and now compound; applying only the most recent one
 * leaves the series wrong by the other.
 */
interface Adjustment {
  readonly exDate: number;
  readonly ratio: number;
}

async function adjustmentsFor(db: Database, instrumentId: number): Promise<Adjustment[]> {
  const rows = await db
    .select({ exDate: corporateActions.exDate, ratio: corporateActions.ratio })
    .from(corporateActions)
    .where(eq(corporateActions.instrumentId, instrumentId))
    .orderBy(desc(corporateActions.exDate));

  return rows.map((row) => ({
    exDate: new Date(`${row.exDate}T00:00:00Z`).getTime(),
    ratio: Number(row.ratio),
  }));
}

/**
 * Applies corporate actions to a raw series.
 *
 * Prices are rounded back to whole paise after scaling — they are integers by
 * invariant (hard rule 3), and a fractional paise would be a float sneaking in
 * through the back door.
 *
 * Volume scales inversely: a 1:5 split multiplies share count by 5, so a
 * pre-split volume must be divided by the same ratio to stay comparable.
 */
export function applyAdjustments(
  bars: readonly StoredBar[],
  adjustments: readonly Adjustment[],
): StoredBar[] {
  if (adjustments.length === 0) return [...bars];

  return bars.map((bar) => {
    let factor = 1;
    for (const adjustment of adjustments) {
      if (bar.timestamp < adjustment.exDate) factor *= adjustment.ratio;
    }
    if (factor === 1) return bar;

    return {
      timestamp: bar.timestamp,
      open: Math.round(bar.open * factor),
      high: Math.round(bar.high * factor),
      low: Math.round(bar.low * factor),
      close: Math.round(bar.close * factor),
      volume: Math.round(bar.volume / factor),
    };
  });
}

export interface BarQuery {
  readonly instrumentId: number;
  readonly from: Date;
  readonly to: Date;
  /** Newest N sessions instead of a range. Overrides `from` when set. */
  readonly limit?: number;
  /**
   * Skip corporate-action adjustment.
   *
   * Only for auditing what was actually received. Indicators must never use
   * this — an unadjusted series has a fake gap at every split.
   */
  readonly raw?: boolean;
}

/** Daily bars, ascending, adjusted for corporate actions unless `raw`. */
export async function getDailyBars(db: Database, query: BarQuery): Promise<StoredBar[]> {
  const { instrumentId, from, to, limit, raw = false } = query;

  const conditions = [eq(dailyCandles.instrumentId, instrumentId), lte(dailyCandles.ts, to)];
  if (limit === undefined) conditions.push(gte(dailyCandles.ts, from));

  const rows = await db
    .select({
      ts: dailyCandles.ts,
      open: dailyCandles.open,
      high: dailyCandles.high,
      low: dailyCandles.low,
      close: dailyCandles.close,
      volume: dailyCandles.volume,
    })
    .from(dailyCandles)
    .where(and(...conditions))
    // Newest-first with a LIMIT when taking the last N, then reversed — the
    // index is on (instrument_id, ts DESC), so this needs no sort.
    .orderBy(limit === undefined ? asc(dailyCandles.ts) : desc(dailyCandles.ts))
    .limit(limit ?? Number.MAX_SAFE_INTEGER);

  const bars: StoredBar[] = rows.map((row) => ({
    timestamp: row.ts.getTime(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  }));

  const ascending = limit === undefined ? bars : bars.reverse();
  return raw ? ascending : applyAdjustments(ascending, await adjustmentsFor(db, instrumentId));
}

/**
 * Intraday bars at a derived timeframe.
 *
 * Derived on read with `time_bucket`, never persisted (hard rule 4). The origin
 * is pinned to 09:15 IST so a 15-minute bucket starts with the session rather
 * than with midnight UTC — an unaligned origin silently shifts every intraday
 * candle in the app.
 */
export async function getIntradayBars(
  db: Database,
  query: { instrumentId: number; minutes: number; from: Date; to: Date },
): Promise<StoredBar[]> {
  const { instrumentId, minutes, from, to } = query;
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new RangeError(`getIntradayBars: minutes must be a positive integer, got ${minutes}`);
  }

  // 09:15 IST == 03:45 UTC. Any date works as an origin; only the offset within
  // the bucket interval matters.
  const rows = await db.execute<{
    bucket: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: string;
  }>(sql`
    SELECT
      time_bucket(
        ${`${minutes} minutes`}::interval,
        ts,
        TIMESTAMPTZ '2000-01-03 03:45:00+00'
      ) AS bucket,
      (array_agg(open ORDER BY ts ASC))[1]  AS open,
      MAX(high)                             AS high,
      MIN(low)                              AS low,
      (array_agg(close ORDER BY ts DESC))[1] AS close,
      SUM(volume)                           AS volume
    FROM minute_candles
    WHERE instrument_id = ${instrumentId}
      AND ts >= ${from}
      AND ts <= ${to}
    GROUP BY bucket
    ORDER BY bucket ASC
  `);

  const bars: StoredBar[] = rows.rows.map((row) => ({
    timestamp: new Date(row.bucket).getTime(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: Number(row.volume),
  }));

  return applyAdjustments(bars, await adjustmentsFor(db, instrumentId));
}

/**
 * Sessions actually present for an instrument in a range.
 *
 * The gap detector. A worker outage leaves a hole that indicators would compute
 * straight across, producing a plausible and wrong number rather than an error.
 */
export async function getStoredSessionDates(
  db: Database,
  instrumentIds: readonly number[],
  from: Date,
  to: Date,
): Promise<Map<number, Set<string>>> {
  if (instrumentIds.length === 0) return new Map();

  const rows = await db
    .select({ instrumentId: dailyCandles.instrumentId, ts: dailyCandles.ts })
    .from(dailyCandles)
    .where(
      and(
        inArray(dailyCandles.instrumentId, [...instrumentIds]),
        gte(dailyCandles.ts, from),
        lte(dailyCandles.ts, to),
      ),
    );

  const byInstrument = new Map<number, Set<string>>();
  for (const row of rows) {
    const key = row.ts.toISOString().slice(0, 10);
    const set = byInstrument.get(row.instrumentId) ?? new Set<string>();
    set.add(key);
    byInstrument.set(row.instrumentId, set);
  }
  return byInstrument;
}
