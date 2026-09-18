import { and, asc, eq, gte, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { instruments } from '../schema/instruments.js';
import { minuteCandles, signalQuotes } from '../schema/vwap-signals.js';

/**
 * Minute history and the sampled-quote store, shared by every intraday
 * consumer. Strategy-free: the same rows feed the scanner, the replay and the
 * chart. Only 1m candles are persisted; five-minute bars are derived on read
 * with the exchange-aligned `time_bucket` (hard rule 4).
 */
type Candle = typeof minuteCandles.$inferInsert;
export async function insertSignalMinutes(db: Database, rows: readonly Candle[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 1000)
    await db
      .insert(minuteCandles)
      .values(rows.slice(i, i + 1000))
      .onConflictDoNothing();
}
export async function getSignalMinutes(
  db: Database,
  instrumentId: number,
  from: number,
  to: number,
) {
  const rows = await db
    .select()
    .from(minuteCandles)
    .where(
      and(
        eq(minuteCandles.instrumentId, instrumentId),
        gte(minuteCandles.ts, new Date(from)),
        sql`${minuteCandles.ts} < ${new Date(to)}`,
      ),
    )
    .orderBy(asc(minuteCandles.ts));
  return rows.map((r) => ({
    timestamp: r.ts.getTime(),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));
}
/** Uses the mandated exchange-aligned time_bucket. Incomplete groups are omitted. */
export async function getSignalBars(db: Database, instrumentId: number, from: number, now: number) {
  const result = await db.execute<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: string;
  }>(sql`
    SELECT extract(epoch FROM bucket)*1000 AS timestamp, (array_agg(open ORDER BY ts))[1] AS open,
      max(high)::integer AS high, min(low)::integer AS low, (array_agg(close ORDER BY ts DESC))[1] AS close, sum(volume)::text AS volume
    FROM (SELECT *, time_bucket('5 minutes', ts, TIMESTAMPTZ '2000-01-01 03:45:00+00') AS bucket
      FROM minute_candles WHERE instrument_id=${instrumentId} AND ts >= ${new Date(from)} AND ts < ${new Date(now)}) b
    WHERE bucket + interval '5 minutes' <= ${new Date(now)} AND (ts AT TIME ZONE 'Asia/Kolkata')::time >= time '09:15'
      AND (ts AT TIME ZONE 'Asia/Kolkata')::time < time '15:30'
    GROUP BY bucket HAVING count(*)=5 AND min(ts)=bucket AND max(ts)=bucket+interval '4 minutes' ORDER BY bucket`);
  return result.rows.map((r) => ({
    timestamp: Number(r.timestamp),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: Number(r.volume),
  }));
}
export async function signalUniverseInstruments(db: Database) {
  return db
    .select({
      id: instruments.id,
      symbol: instruments.symbol,
      kind: instruments.kind,
      tickSize: instruments.tickSize,
    })
    .from(instruments)
    .where(eq(instruments.active, true));
}
export async function getScannerQuote(db: Database, instrumentId: number) {
  const [row] = await db
    .select()
    .from(signalQuotes)
    .where(eq(signalQuotes.instrumentId, instrumentId));
  return row ?? null;
}
/** The newest sampled price across every instrument; null before the first. */
export async function latestSignalQuoteAt(db: Database): Promise<number | null> {
  const [row] = await db
    .select({ at: sql<string | null>`max(${signalQuotes.observedAt})` })
    .from(signalQuotes);
  return row?.at ? new Date(row.at).getTime() : null;
}
