/**
 * The intraday price spine, shared by the strategy scanner, the paper engine
 * and the replay: 1-minute candles, the last sampled quote per instrument and
 * every sampled observation. (The Confirmed VWAP Trend Pullback tables that
 * used to live here were exported and dropped in migration 0024.)
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { instruments } from './instruments.js';

export const minuteCandles = pgTable(
  'minute_candles',
  {
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    ts: timestamp({ withTimezone: true }).notNull(),
    open: integer().notNull(),
    high: integer().notNull(),
    low: integer().notNull(),
    close: integer().notNull(),
    volume: bigint({ mode: 'number' }).notNull(),
    providerId: text().notNull(),
    ingestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.instrumentId, t.ts] }),
    check(
      'minute_candles_valid',
      sql`${t.low}>0 and ${t.high}>=greatest(${t.open},${t.close}) and ${t.low}<=least(${t.open},${t.close}) and ${t.volume}>=0`,
    ),
  ],
);
export const signalQuotes = pgTable('signal_quotes', {
  instrumentId: integer()
    .primaryKey()
    .references(() => instruments.id),
  price: integer().notNull(),
  bid: integer(),
  ask: integer(),
  observedAt: timestamp({ withTimezone: true }).notNull(),
  receivedAt: timestamp({ withTimezone: true }).notNull(),
  continuous: boolean().notNull(),
});
export const signalObservations = pgTable(
  'signal_observations',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    price: integer().notNull(),
    bid: integer(),
    ask: integer(),
    observedAt: timestamp({ withTimezone: true }).notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull(),
    continuous: boolean().notNull(),
  },
  (t) => [index('signal_observations_instrument_idx').on(t.instrumentId, t.observedAt)],
);
