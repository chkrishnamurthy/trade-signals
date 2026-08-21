import {
  bigint,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
} from 'drizzle-orm/pg-core';
import { instruments } from './instruments.js';

/**
 * Precomputed end-of-day indicator values, one row per instrument per session.
 *
 * The screener's reason for existing. Filtering 500 instruments on "above the
 * 50 EMA and RSI over 60 and relative volume over 1.5" is one indexed scan
 * here, versus 500 history calls and 500 recomputations against a rate-limited
 * upstream — which is not a thing that can be done per query.
 *
 * Values are derived, so this table CAN be rebuilt from `daily_candles`. That
 * makes it safe to drop and recompute after an engine fix, unlike the candles
 * themselves.
 *
 * Prices are paise (integers). Ratios like RSI are dimensionless floats.
 */
export const dailyIndicators = pgTable(
  'daily_indicators',
  {
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    /** IST trading date of the CLOSED session these describe. */
    tradingDate: date().notNull(),

    /** Close of that session, paise. Denormalised so the screener needs no join. */
    close: integer().notNull(),
    volume: bigint({ mode: 'number' }).notNull(),

    /** Paise. Null until enough bars exist — never zero, never back-filled. */
    ema20: integer(),
    ema50: integer(),
    ema200: integer(),
    sma20: integer(),
    sma50: integer(),

    /** 0–100. */
    rsi14: doublePrecision(),
    /** MACD line, signal and histogram, in paise. */
    macd: integer(),
    macdSignal: integer(),
    macdHistogram: integer(),
    /** Average true range, paise. */
    atr14: integer(),

    /** Mean volume over the lookback, excluding this session. */
    averageVolume: bigint({ mode: 'number' }),
    /** volume ÷ averageVolume. Dimensionless. */
    relativeVolume: doublePrecision(),

    /** Rolling 52-week extremes, paise. */
    high52w: integer(),
    low52w: integer(),
    /** Day range extremes for the session, paise. */
    high: integer().notNull(),
    low: integer().notNull(),

    /** Percent change vs the previous close. */
    changePercent: doublePrecision(),

    /** Bars available when this was computed — the warm-up audit trail. */
    barCount: integer().notNull(),
    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.instrumentId, table.tradingDate] }),
    // Every screener query filters by session first, then by predicate.
    index('daily_indicators_date_idx').on(table.tradingDate),
    index('daily_indicators_date_rsi_idx').on(table.tradingDate, table.rsi14),
    index('daily_indicators_date_relvol_idx').on(table.tradingDate, table.relativeVolume),
  ],
);
