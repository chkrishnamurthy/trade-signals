import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { authUsers } from './auth.js';
import { instruments } from './instruments.js';

/**
 * A signed-in user's own record of shares they hold, typed in or read from a file
 * they chose. Nothing here is fetched from a broker.
 *
 * One row per event, never per holding: what the user holds now is DERIVED on
 * read (`packages/core/src/portfolio/derive.ts`). That keeps the user's numbers
 * exactly as entered; splits and bonuses are applied on read from
 * `corporate_actions`, never written into these rows (CLAUDE.md rule 5's spirit).
 *
 *   opening   shares and total cost that were true on `trade_date` (a holdings
 *             snapshot, or "I owned these before I started tracking")
 *   add       shares added on `trade_date` for `amount_paise` (with charges)
 *   remove    shares removed on `trade_date` for `amount_paise` (proceeds)
 *
 * `amount_paise` is the TOTAL money for the row in integer paise (rule 3). A
 * per-share price is never stored: brokers round it, the total is exact.
 *
 * PRIVATE (CLAUDE.md rule 9): every read and write goes through
 * `repositories/portfolio.ts`, scoped by `owner_id`. Never logged.
 */
export const holdingEntries = pgTable(
  'holding_entries',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ownerId: integer()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id, { onDelete: 'cascade' }),
    kind: text().notNull(),
    tradeDate: date().notNull(),
    shares: integer().notNull(),
    amountPaise: bigint({ mode: 'number' }).notNull(),
    source: text().notNull(),
    /** The broker's trade id from an uploaded trade list; makes a repeated import a no-op. */
    tradeId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('holding_entries_owner_idx').on(table.ownerId, table.instrumentId, table.tradeDate),
    index('holding_entries_instrument_idx').on(table.instrumentId),
    uniqueIndex('holding_entries_owner_trade_idx')
      .on(table.ownerId, table.tradeId)
      .where(sql`${table.tradeId} is not null`),
    check('holding_entries_kind_check', sql`${table.kind} in ('opening', 'add', 'remove')`),
    check('holding_entries_source_check', sql`${table.source} in ('manual', 'file')`),
    check('holding_entries_shares_positive', sql`${table.shares} > 0`),
    check('holding_entries_amount_nonnegative', sql`${table.amountPaise} >= 0`),
  ],
);

/**
 * How much each user uses the portfolio page: counts and dates only, one row per
 * user. Never a stock, a share count or an amount (CLAUDE.md rule 9). It answers
 * "do people come back?" — the success measure in `docs/planning/holdings-plan.md`.
 * Deleted with the account.
 */
export const portfolioUsage = pgTable('portfolio_usage', {
  ownerId: integer()
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  /** Distinct UTC days with any use. */
  activeDays: integer().notNull().default(1),
  views: integer().notNull().default(0),
  imports: integer().notNull().default(0),
  entriesAdded: integer().notNull().default(0),
});
