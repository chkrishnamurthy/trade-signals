import { sql } from 'drizzle-orm';
import { check, date, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * One row per exchange trading date: whether the market trades and when
 * (computed from `config/nse-calendar.yaml` by the worker's calendar refresh).
 * The worker reads it to skip holidays and weekends in its in-session jobs.
 */
export const exchangeSessions = pgTable(
  'exchange_sessions',
  {
    exchange: text().notNull(),
    tradingDate: date().notNull(),
    kind: text().notNull(),
    openAt: timestamp({ withTimezone: true }),
    closeAt: timestamp({ withTimezone: true }),
    entryCutoffAt: timestamp({ withTimezone: true }),
    squareOffAt: timestamp({ withTimezone: true }),
    source: text().notNull(),
    note: text(),
    updatedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.exchange, t.tradingDate] }),
    check(
      'exchange_sessions_kind',
      sql`${t.kind} in ('NORMAL','HOLIDAY','SPECIAL','MUHURAT','CLOSED_UNSCHEDULED','WEEKEND')`,
    ),
  ],
);
