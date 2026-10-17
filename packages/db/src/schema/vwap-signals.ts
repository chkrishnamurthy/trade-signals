import { bigint, boolean, index, integer, pgTable, timestamp } from 'drizzle-orm/pg-core';
import { instruments } from './instruments.js';

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
