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

/** A bar in the shape `@wealthos/core` consumes. Prices are integer paise. */
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
 * Instruments per batched minute-bar read.
 *
 * One query for fifty symbols × ten sessions is roughly 190,000 rows, and
 * parsing them blocks the event loop long enough that other pooled connections
 * time out mid-handshake — the read succeeds and everything around it fails.
 * Ten at a time is still five round trips instead of fifty, without ever
 * holding the loop for seconds at a stretch.
 */
const READ_CHUNK = 10;

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

/** The same, for many instruments in one round trip. */
async function adjustmentsForMany(
  db: Database,
  instrumentIds: readonly number[],
): Promise<Map<number, Adjustment[]>> {
  if (instrumentIds.length === 0) return new Map();

  const rows = await db
    .select({
      instrumentId: corporateActions.instrumentId,
      exDate: corporateActions.exDate,
      ratio: corporateActions.ratio,
    })
    .from(corporateActions)
    .where(inArray(corporateActions.instrumentId, [...instrumentIds]))
    .orderBy(desc(corporateActions.exDate));

  const grouped = new Map<number, Adjustment[]>();
  for (const row of rows) {
    const adjustment = {
      exDate: new Date(`${row.exDate}T00:00:00Z`).getTime(),
      ratio: Number(row.ratio),
    };
    const bucket = grouped.get(row.instrumentId);
    if (bucket === undefined) grouped.set(row.instrumentId, [adjustment]);
    else bucket.push(adjustment);
  }
  return grouped;
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
 * The newest `limit` daily bars for MANY instruments, in one round trip.
 *
 * `DISTINCT ON` with a descending sort gives Postgres the newest rows per
 * instrument straight off the (instrument_id, ts DESC) index, rather than the
 * fifty separate index scans and fifty network round trips the per-instrument
 * version would cost. The intraday cycle reads these for every symbol in the
 * universe on every pass, so the round trips, not the rows, are the cost.
 */
export async function getDailyBarsForInstruments(
  db: Database,
  query: { instrumentIds: readonly number[]; to: Date; limit: number },
): Promise<Map<number, StoredBar[]>> {
  const { instrumentIds, to, limit } = query;
  const result = new Map<number, StoredBar[]>();
  if (instrumentIds.length === 0) return result;

  // The predicate is built with drizzle's `inArray` rather than written as
  // `= ANY(...)`: the template tag expands a JS array into one placeholder per
  // element, which is an `IN` list, not an array literal, and Postgres rejects
  // it outright.
  const rows = await db.execute<{
    instrument_id: number;
    ts: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: string;
  }>(sql`
    SELECT instrument_id, ts, open, high, low, close, volume
    FROM (
      SELECT instrument_id, ts, open, high, low, close, volume,
             row_number() OVER (PARTITION BY instrument_id ORDER BY ts DESC) AS rn
      FROM daily_candles
      WHERE ${inArray(dailyCandles.instrumentId, [...instrumentIds])}
        AND ${lte(dailyCandles.ts, to)}
    ) ranked
    WHERE rn <= ${limit}
    ORDER BY instrument_id, ts ASC
  `);

  for (const row of rows.rows) {
    const bar: StoredBar = {
      timestamp: new Date(row.ts).getTime(),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: Number(row.volume),
    };
    const bucket = result.get(row.instrument_id);
    if (bucket === undefined) result.set(row.instrument_id, [bar]);
    else bucket.push(bar);
  }

  const adjustments = await adjustmentsForMany(db, instrumentIds);
  for (const instrumentId of instrumentIds) {
    const bars = result.get(instrumentId) ?? [];
    result.set(instrumentId, applyAdjustments(bars, adjustments.get(instrumentId) ?? []));
  }
  return result;
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
 * Raw 1m bars for an instrument, ascending, adjusted on read.
 *
 * The intraday engine consumes these directly rather than going through
 * `getIntradayBars`: it derives 3m/5m/15m itself, in pure code, so that a
 * backtest bucketing a historical series and the live path bucketing today's
 * series execute the same function. Routing the live path through SQL and the
 * backtest through TypeScript would be two implementations of one rule.
 */
export async function getMinuteBars(
  db: Database,
  query: { instrumentId: number; from: Date; to: Date; raw?: boolean },
): Promise<StoredBar[]> {
  const { instrumentId, from, to, raw = false } = query;

  const rows = await db
    .select({
      ts: minuteCandles.ts,
      open: minuteCandles.open,
      high: minuteCandles.high,
      low: minuteCandles.low,
      close: minuteCandles.close,
      volume: minuteCandles.volume,
    })
    .from(minuteCandles)
    .where(
      and(
        eq(minuteCandles.instrumentId, instrumentId),
        gte(minuteCandles.ts, from),
        lte(minuteCandles.ts, to),
      ),
    )
    .orderBy(asc(minuteCandles.ts));

  const bars: StoredBar[] = rows.map((row) => ({
    timestamp: row.ts.getTime(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  }));

  return raw ? bars : applyAdjustments(bars, await adjustmentsFor(db, instrumentId));
}

/**
 * 1m bars for MANY instruments in one round trip.
 *
 * The intraday cycle needs prior-session candles for every symbol in the
 * universe to warm its indicators and build its volume profiles. Fifty separate
 * queries against a Neon endpoint is fifty round trips for data that fits in
 * one; the per-request latency, not the row count, is what makes the first
 * cycle of the day slow.
 */
export async function getMinuteBarsForInstruments(
  db: Database,
  query: {
    instrumentIds: readonly number[];
    from: Date;
    to: Date;
    raw?: boolean;
    /** Instruments per query. See {@link READ_CHUNK}. */
    chunk?: number;
  },
): Promise<Map<number, StoredBar[]>> {
  const { instrumentIds, from, to, raw = false, chunk = READ_CHUNK } = query;
  const result = new Map<number, StoredBar[]>();
  if (instrumentIds.length === 0) return result;

  for (let offset = 0; offset < instrumentIds.length; offset += chunk) {
    const batch = instrumentIds.slice(offset, offset + chunk);
    if (batch.length === 0) continue;

    const rows = await db
      .select({
        instrumentId: minuteCandles.instrumentId,
        ts: minuteCandles.ts,
        open: minuteCandles.open,
        high: minuteCandles.high,
        low: minuteCandles.low,
        close: minuteCandles.close,
        volume: minuteCandles.volume,
      })
      .from(minuteCandles)
      .where(
        and(
          inArray(minuteCandles.instrumentId, [...batch]),
          gte(minuteCandles.ts, from),
          lte(minuteCandles.ts, to),
        ),
      )
      .orderBy(asc(minuteCandles.instrumentId), asc(minuteCandles.ts));

    for (const row of rows) {
      const bar: StoredBar = {
        timestamp: row.ts.getTime(),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      };
      const bucket = result.get(row.instrumentId);
      if (bucket === undefined) result.set(row.instrumentId, [bar]);
      else bucket.push(bar);
    }
  }

  // Every instrument gets an entry, so a caller can tell "no bars stored" from
  // "instrument not requested" without a second lookup.
  for (const instrumentId of instrumentIds) {
    if (!result.has(instrumentId)) result.set(instrumentId, []);
  }

  if (raw) return result;

  const adjustments = await adjustmentsForMany(db, instrumentIds);
  for (const [instrumentId, bars] of result) {
    result.set(instrumentId, applyAdjustments(bars, adjustments.get(instrumentId) ?? []));
  }
  return result;
}

/**
 * The latest stored 1m bar per instrument.
 *
 * The incremental-ingestion cursor: without it every cycle would refetch the
 * whole session, which at fifty symbols is fifty full-day requests every few
 * minutes against an account-wide rate limit.
 */
export async function latestMinuteBarPerInstrument(
  db: Database,
  instrumentIds: readonly number[],
  from: Date,
): Promise<Map<number, Date>> {
  if (instrumentIds.length === 0) return new Map();

  const rows = await db
    .select({
      instrumentId: minuteCandles.instrumentId,
      ts: sql<Date>`max(${minuteCandles.ts})`,
    })
    .from(minuteCandles)
    .where(
      and(inArray(minuteCandles.instrumentId, [...instrumentIds]), gte(minuteCandles.ts, from)),
    )
    .groupBy(minuteCandles.instrumentId);

  return new Map(rows.map((row) => [row.instrumentId, new Date(row.ts)]));
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

/** One stored session's minute-candle coverage. */
export interface SessionCoverage {
  /** IST trading date, `YYYY-MM-DD`. */
  readonly tradingDate: string;
  readonly bars: number;
  readonly instruments: number;
}

/**
 * What minute-candle history actually exists, by IST trading date.
 *
 * The first question any backtest has to answer before its results mean
 * anything: a strong number over four sessions and a strong number over eighty
 * are different claims, and only this tells them apart.
 */
export async function minuteCandleCoverage(db: Database): Promise<SessionCoverage[]> {
  const rows = await db.execute<{ d: string; n: string; syms: string }>(sql`
    SELECT (${minuteCandles.ts} AT TIME ZONE 'Asia/Kolkata')::date AS d,
           count(*) AS n,
           count(DISTINCT ${minuteCandles.instrumentId}) AS syms
    FROM ${minuteCandles}
    GROUP BY 1
    ORDER BY 1`);

  return rows.rows.map((row) => ({
    tradingDate: String(row.d).slice(0, 10),
    bars: Number(row.n),
    instruments: Number(row.syms),
  }));
}
