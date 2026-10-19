import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { instruments } from './instruments.js';

/**
 * Latest quote snapshots fetched by the worker for the union of watched
 * instruments. This table is intentionally mutable: it is a cache of the
 * latest provider snapshot, not price history.
 *
 * Prices are integer paise per the repo invariant. `quoteAt` is the provider's
 * exchange/feed instant when supplied; `fetchedAt` is when the worker observed
 * and stored the snapshot.
 */
export const latestQuotes = pgTable(
  'latest_quotes',
  {
    instrumentId: integer()
      .primaryKey()
      .references(() => instruments.id, { onDelete: 'cascade' }),
    symbol: text().notNull(),
    source: text().notNull(),
    ltpPaise: integer().notNull(),
    changePaise: integer(),
    changePercent: doublePrecision(),
    openPaise: integer(),
    highPaise: integer(),
    lowPaise: integer(),
    previousClosePaise: integer(),
    averagePricePaise: integer(),
    bidPaise: integer(),
    askPaise: integer(),
    volume: bigint({ mode: 'number' }),
    quoteAt: timestamp({ withTimezone: true }),
    fetchedAt: timestamp({ withTimezone: true }).notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('latest_quotes_fetched_at_idx').on(table.fetchedAt.desc()),
    check('latest_quotes_ltp_positive', sql`${table.ltpPaise} > 0`),
    check(
      'latest_quotes_nullable_prices_positive',
      sql`
        (${table.openPaise} IS NULL OR ${table.openPaise} > 0)
        AND (${table.highPaise} IS NULL OR ${table.highPaise} > 0)
        AND (${table.lowPaise} IS NULL OR ${table.lowPaise} > 0)
        AND (${table.previousClosePaise} IS NULL OR ${table.previousClosePaise} > 0)
        AND (${table.averagePricePaise} IS NULL OR ${table.averagePricePaise} > 0)
        AND (${table.bidPaise} IS NULL OR ${table.bidPaise} > 0)
        AND (${table.askPaise} IS NULL OR ${table.askPaise} > 0)
      `,
    ),
    check(
      'latest_quotes_day_range',
      sql`
        (${table.highPaise} IS NULL OR ${table.lowPaise} IS NULL OR ${table.highPaise} >= ${table.lowPaise})
        AND (${table.highPaise} IS NULL OR ${table.openPaise} IS NULL OR ${table.highPaise} >= ${table.openPaise})
        AND (${table.lowPaise} IS NULL OR ${table.openPaise} IS NULL OR ${table.lowPaise} <= ${table.openPaise})
      `,
    ),
    check('latest_quotes_volume_nonnegative', sql`${table.volume} IS NULL OR ${table.volume} >= 0`),
  ],
);
