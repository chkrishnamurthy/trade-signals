import { and, asc, desc, eq, gte, isNotNull, lte, type SQL, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { dailyIndicators, instruments } from '../schema/index.js';

/**
 * Precomputed indicator storage and the screener query built on it.
 *
 * This table is why a screener is possible at all. Filtering 500 instruments
 * on "above the 50 EMA and RSI over 60 and relative volume over 1.5" is one
 * indexed scan here; computing it live would be 500 rate-limited history calls
 * and 500 indicator passes per query, which is not a thing that can be done.
 *
 * Everything here is DERIVED from `daily_candles`, so it can be dropped and
 * rebuilt after an engine fix. The candles cannot.
 */

export interface IndicatorUpsert {
  readonly instrumentId: number;
  /** IST trading date of the CLOSED session, `YYYY-MM-DD`. */
  readonly tradingDate: string;
  readonly close: number;
  readonly high: number;
  readonly low: number;
  readonly volume: number;
  readonly ema20: number | null;
  readonly ema50: number | null;
  readonly ema200: number | null;
  readonly sma20: number | null;
  readonly sma50: number | null;
  readonly rsi14: number | null;
  readonly macd: number | null;
  readonly macdSignal: number | null;
  readonly macdHistogram: number | null;
  readonly atr14: number | null;
  readonly averageVolume: number | null;
  readonly relativeVolume: number | null;
  readonly high52w: number | null;
  readonly low52w: number | null;
  readonly changePercent: number | null;
  readonly barCount: number;
}

const CHUNK = 500;

/**
 * Writes indicator rows for a session.
 *
 * Unlike candles this DOES overwrite: a recomputation after an engine fix must
 * replace the wrong values, and nothing downstream treats these as a historical
 * record.
 */
export async function upsertDailyIndicators(
  db: Database,
  rows: readonly IndicatorUpsert[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;

    const result = await db
      .insert(dailyIndicators)
      .values([...chunk])
      .onConflictDoUpdate({
        target: [dailyIndicators.instrumentId, dailyIndicators.tradingDate],
        set: {
          close: sql`excluded.close`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          volume: sql`excluded.volume`,
          ema20: sql`excluded.ema20`,
          ema50: sql`excluded.ema50`,
          ema200: sql`excluded.ema200`,
          sma20: sql`excluded.sma20`,
          sma50: sql`excluded.sma50`,
          rsi14: sql`excluded.rsi14`,
          macd: sql`excluded.macd`,
          macdSignal: sql`excluded.macd_signal`,
          macdHistogram: sql`excluded.macd_histogram`,
          atr14: sql`excluded.atr14`,
          averageVolume: sql`excluded.average_volume`,
          relativeVolume: sql`excluded.relative_volume`,
          high52w: sql`excluded.high52w`,
          low52w: sql`excluded.low52w`,
          changePercent: sql`excluded.change_percent`,
          barCount: sql`excluded.bar_count`,
          computedAt: sql`now()`,
        },
      })
      .returning({ instrumentId: dailyIndicators.instrumentId });
    written += result.length;
  }
  return written;
}

/** The most recent session that has indicator rows at all. */
export async function latestIndicatorDate(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ tradingDate: dailyIndicators.tradingDate })
    .from(dailyIndicators)
    .orderBy(desc(dailyIndicators.tradingDate))
    .limit(1);
  return row?.tradingDate ?? null;
}

// ---------------------------------------------------------------------------
// Screener
// ---------------------------------------------------------------------------

/**
 * One screener predicate.
 *
 * A closed set, not free-form SQL. Every filter the UI can express maps to one
 * of these, so a query string can never reach the database as SQL.
 */
export type ScreenerFilter =
  | { readonly kind: 'price_between'; readonly min: number | null; readonly max: number | null }
  | { readonly kind: 'change_percent'; readonly min: number | null; readonly max: number | null }
  | { readonly kind: 'above_ema'; readonly period: 20 | 50 | 200 }
  | { readonly kind: 'below_ema'; readonly period: 20 | 50 | 200 }
  | { readonly kind: 'ema_stacked_bullish' }
  | { readonly kind: 'ema_stacked_bearish' }
  | { readonly kind: 'rsi_between'; readonly min: number | null; readonly max: number | null }
  | { readonly kind: 'macd_bullish' }
  | { readonly kind: 'macd_bearish' }
  | { readonly kind: 'relative_volume_above'; readonly value: number }
  | { readonly kind: 'volume_above'; readonly value: number }
  | { readonly kind: 'near_52w_high'; readonly withinPercent: number }
  | { readonly kind: 'near_52w_low'; readonly withinPercent: number }
  | { readonly kind: 'at_day_high' }
  | { readonly kind: 'at_day_low' };

const EMA_COLUMN = {
  20: dailyIndicators.ema20,
  50: dailyIndicators.ema50,
  200: dailyIndicators.ema200,
} as const;

/**
 * Turns one filter into a SQL condition.
 *
 * Note every EMA/RSI comparison also requires the column to be non-null. A
 * `null` indicator means "not enough bars to warm up", and SQL's three-valued
 * logic would otherwise quietly exclude it from BOTH `above_ema` and
 * `below_ema` — which is correct, but only by accident. Being explicit keeps it
 * correct on purpose.
 */
function toCondition(filter: ScreenerFilter): SQL | undefined {
  switch (filter.kind) {
    case 'price_between': {
      const parts: SQL[] = [];
      if (filter.min !== null) parts.push(gte(dailyIndicators.close, filter.min));
      if (filter.max !== null) parts.push(lte(dailyIndicators.close, filter.max));
      return parts.length === 0 ? undefined : and(...parts);
    }
    case 'change_percent': {
      const parts: SQL[] = [isNotNull(dailyIndicators.changePercent)];
      if (filter.min !== null) parts.push(gte(dailyIndicators.changePercent, filter.min));
      if (filter.max !== null) parts.push(lte(dailyIndicators.changePercent, filter.max));
      return and(...parts);
    }
    case 'above_ema': {
      const column = EMA_COLUMN[filter.period];
      return and(isNotNull(column), sql`${dailyIndicators.close} > ${column}`);
    }
    case 'below_ema': {
      const column = EMA_COLUMN[filter.period];
      return and(isNotNull(column), sql`${dailyIndicators.close} < ${column}`);
    }
    case 'ema_stacked_bullish':
      // Price > 20 > 50 > 200: the textbook uptrend alignment.
      return sql`${dailyIndicators.ema20} IS NOT NULL
        AND ${dailyIndicators.ema50} IS NOT NULL
        AND ${dailyIndicators.ema200} IS NOT NULL
        AND ${dailyIndicators.close} > ${dailyIndicators.ema20}
        AND ${dailyIndicators.ema20} > ${dailyIndicators.ema50}
        AND ${dailyIndicators.ema50} > ${dailyIndicators.ema200}`;
    case 'ema_stacked_bearish':
      return sql`${dailyIndicators.ema20} IS NOT NULL
        AND ${dailyIndicators.ema50} IS NOT NULL
        AND ${dailyIndicators.ema200} IS NOT NULL
        AND ${dailyIndicators.close} < ${dailyIndicators.ema20}
        AND ${dailyIndicators.ema20} < ${dailyIndicators.ema50}
        AND ${dailyIndicators.ema50} < ${dailyIndicators.ema200}`;
    case 'rsi_between': {
      const parts: SQL[] = [isNotNull(dailyIndicators.rsi14)];
      if (filter.min !== null) parts.push(gte(dailyIndicators.rsi14, filter.min));
      if (filter.max !== null) parts.push(lte(dailyIndicators.rsi14, filter.max));
      return and(...parts);
    }
    case 'macd_bullish':
      return sql`${dailyIndicators.macdHistogram} IS NOT NULL AND ${dailyIndicators.macdHistogram} > 0`;
    case 'macd_bearish':
      return sql`${dailyIndicators.macdHistogram} IS NOT NULL AND ${dailyIndicators.macdHistogram} < 0`;
    case 'relative_volume_above':
      return and(
        isNotNull(dailyIndicators.relativeVolume),
        gte(dailyIndicators.relativeVolume, filter.value),
      );
    case 'volume_above':
      return gte(dailyIndicators.volume, filter.value);
    case 'near_52w_high':
      return sql`${dailyIndicators.high52w} IS NOT NULL
        AND ${dailyIndicators.close} >= ${dailyIndicators.high52w} * ${1 - filter.withinPercent / 100}`;
    case 'near_52w_low':
      return sql`${dailyIndicators.low52w} IS NOT NULL
        AND ${dailyIndicators.close} <= ${dailyIndicators.low52w} * ${1 + filter.withinPercent / 100}`;
    case 'at_day_high':
      // Within the top 2% of the session's range.
      return sql`${dailyIndicators.high} > ${dailyIndicators.low}
        AND (${dailyIndicators.close} - ${dailyIndicators.low})::float
            / NULLIF(${dailyIndicators.high} - ${dailyIndicators.low}, 0) >= 0.98`;
    case 'at_day_low':
      return sql`${dailyIndicators.high} > ${dailyIndicators.low}
        AND (${dailyIndicators.close} - ${dailyIndicators.low})::float
            / NULLIF(${dailyIndicators.high} - ${dailyIndicators.low}, 0) <= 0.02`;
    default: {
      // Exhaustiveness: a new filter kind fails to compile rather than
      // silently matching everything.
      const never: never = filter;
      throw new Error(`Unhandled screener filter: ${JSON.stringify(never)}`);
    }
  }
}

export type ScreenerSort =
  | 'change_desc'
  | 'change_asc'
  | 'relative_volume_desc'
  | 'rsi_desc'
  | 'rsi_asc'
  | 'volume_desc'
  | 'symbol_asc';

export interface ScreenerQuery {
  /** Session to screen. Defaults to the latest one with indicators. */
  readonly tradingDate?: string;
  readonly filters: readonly ScreenerFilter[];
  readonly sort?: ScreenerSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ScreenerRow {
  readonly symbol: string;
  readonly name: string;
  readonly sector: string | null;
  readonly close: number;
  readonly changePercent: number | null;
  readonly volume: number;
  readonly relativeVolume: number | null;
  readonly rsi14: number | null;
  readonly ema20: number | null;
  readonly ema50: number | null;
  readonly ema200: number | null;
  readonly macdHistogram: number | null;
  readonly atr14: number | null;
  readonly high52w: number | null;
  readonly low52w: number | null;
  readonly tradingDate: string;
  readonly barCount: number;
}

export interface ScreenerResult {
  readonly rows: readonly ScreenerRow[];
  /** The session actually screened. Never assume it is today. */
  readonly tradingDate: string | null;
  /** Matches before `limit`, so the UI can say "showing 20 of 137". */
  readonly total: number;
}

const SORTS: Record<ScreenerSort, SQL> = {
  change_desc: sql`${dailyIndicators.changePercent} DESC NULLS LAST`,
  change_asc: sql`${dailyIndicators.changePercent} ASC NULLS LAST`,
  relative_volume_desc: sql`${dailyIndicators.relativeVolume} DESC NULLS LAST`,
  rsi_desc: sql`${dailyIndicators.rsi14} DESC NULLS LAST`,
  rsi_asc: sql`${dailyIndicators.rsi14} ASC NULLS LAST`,
  volume_desc: sql`${dailyIndicators.volume} DESC`,
  symbol_asc: sql`${instruments.symbol} ASC`,
};

/** Hard ceiling: a screener is for narrowing, not for dumping the universe. */
const MAX_LIMIT = 200;

/**
 * Runs a screen against one session's precomputed indicators.
 *
 * Returns the session it actually used. If ingestion has not run today, that is
 * yesterday — and the caller MUST show it, because a screen on stale data
 * presented as today's is exactly the kind of quiet wrongness this app cannot
 * afford.
 */
export async function screen(db: Database, query: ScreenerQuery): Promise<ScreenerResult> {
  const tradingDate = query.tradingDate ?? (await latestIndicatorDate(db));
  if (tradingDate === null) return { rows: [], tradingDate: null, total: 0 };

  const conditions: SQL[] = [eq(dailyIndicators.tradingDate, tradingDate)];
  for (const filter of query.filters) {
    const condition = toCondition(filter);
    if (condition !== undefined) conditions.push(condition);
  }
  const where = and(...conditions);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(dailyIndicators)
    .innerJoin(instruments, eq(instruments.id, dailyIndicators.instrumentId))
    .where(where);

  const rows = await db
    .select({
      symbol: instruments.symbol,
      name: instruments.name,
      close: dailyIndicators.close,
      changePercent: dailyIndicators.changePercent,
      volume: dailyIndicators.volume,
      relativeVolume: dailyIndicators.relativeVolume,
      rsi14: dailyIndicators.rsi14,
      ema20: dailyIndicators.ema20,
      ema50: dailyIndicators.ema50,
      ema200: dailyIndicators.ema200,
      macdHistogram: dailyIndicators.macdHistogram,
      atr14: dailyIndicators.atr14,
      high52w: dailyIndicators.high52w,
      low52w: dailyIndicators.low52w,
      tradingDate: dailyIndicators.tradingDate,
      barCount: dailyIndicators.barCount,
    })
    .from(dailyIndicators)
    .innerJoin(instruments, eq(instruments.id, dailyIndicators.instrumentId))
    .where(where)
    .orderBy(SORTS[query.sort ?? 'change_desc'], asc(instruments.symbol))
    .limit(Math.min(query.limit ?? 50, MAX_LIMIT))
    .offset(query.offset ?? 0);

  return {
    // Sector lives in config/indices.yaml, not the database; the server layer
    // joins it in rather than duplicating a second source of truth here.
    rows: rows.map((row) => ({ ...row, sector: null })),
    tradingDate,
    total: countRow?.total ?? 0,
  };
}
