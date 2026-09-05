import { bigint, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { instruments } from './instruments.js';

/**
 * Price history.
 *
 * Four rules govern this table, all from CLAUDE.md:
 *
 *  - **Only 1m and 1d are stored** (rule 4). 5m/15m/30m/1h derive via
 *    `time_bucket` with origin aligned to 09:15 IST; weekly derives from daily.
 *    A persisted derived timeframe is a bug — it can disagree with its source.
 *  - **Never mutated** (rule 5). No UPDATE, ever. Corrections are rows in
 *    `corporate_actions`, applied on read.
 *  - **Integer paise** (rule 3). No float, no numeric, no decimal library.
 *  - **TIMESTAMPTZ in UTC** (rule 6). IST appears only at the presentation
 *    boundary and in `time_bucket` origins.
 *
 * `ts` is the instant the candle OPENS.
 */

/** Daily candles. One row per instrument per session. */
export const dailyCandles = pgTable(
  'daily_candles',
  {
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    ts: timestamp({ withTimezone: true }).notNull(),
    /** Paise. */
    open: integer().notNull(),
    high: integer().notNull(),
    low: integer().notNull(),
    close: integer().notNull(),
    /** Shares. A count, not money, so it stays a plain integer. */
    volume: bigint({ mode: 'number' }).notNull(),
    /** Which provider supplied this row, for reconciling a disagreement. */
    providerId: text().notNull(),
    ingestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Idempotent ingestion: re-running a day overwrites nothing and inserts
    // nothing new. ON CONFLICT DO NOTHING depends on this being the PK.
    primaryKey({ columns: [table.instrumentId, table.ts] }),
    // The hot path is "give me N sessions of one instrument, newest first".
    index('daily_candles_instrument_ts_idx').on(table.instrumentId, table.ts.desc()),
    // Breadth scans one session across every instrument.
    index('daily_candles_ts_idx').on(table.ts.desc()),
  ],
);
