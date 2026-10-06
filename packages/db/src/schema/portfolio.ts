import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
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
    /**
     * When the shares were really bought, if the user knows it and it differs from
     * `trade_date` (an opening balance entered today for shares bought years ago).
     * Used for holding period only; returns count from `trade_date`.
     */
    acquiredOn: date(),
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
    check(
      'holding_entries_acquired_before_trade',
      sql`${table.acquiredOn} is null or ${table.acquiredOn} <= ${table.tradeDate}`,
    ),
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

/**
 * Each stock's highest traded price on 31 Jan 2018, from NSE's bhavcopy for
 * that day: the "fair market value" in the 2018 grandfathering rule for long-term
 * gains on shares acquired before 1 Feb 2018 (Income-tax Act s.112A). Loaded
 * once; reference data, not price history. Integer paise.
 */
export const fairMarketValues2018 = pgTable(
  'fair_market_values_2018',
  {
    isin: text().primaryKey(),
    symbol: text().notNull(),
    highPaise: integer().notNull(),
    closePaise: integer().notNull(),
    source: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('fair_market_values_2018_symbol_idx').on(table.symbol),
    check(
      'fair_market_values_2018_prices_positive',
      sql`${table.highPaise} > 0 and ${table.closePaise} > 0`,
    ),
  ],
);

/** What a holding notice is about. */
export const HOLDING_NOTICE_KINDS = [
  'event_soon',
  'share_change',
  'stock_move',
  'portfolio_move',
  'long_term_soon',
] as const;
export type HoldingNoticeKind = (typeof HOLDING_NOTICE_KINDS)[number];

/**
 * In-app notices about the user's own holdings, written by the worker after the
 * nightly pass. Facts only ("ITC pays a dividend in 3 days"), never an
 * instruction. `dedupe_key` makes each notice once-only per owner and kind;
 * `data` carries the facts and the page words them.
 * Private to the owner (rule 9); deleted with the account.
 */
export const holdingNotices = pgTable(
  'holding_notices',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ownerId: integer()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    kind: text().notNull(),
    instrumentId: integer().references(() => instruments.id, { onDelete: 'cascade' }),
    dedupeKey: text().notNull(),
    noticeDate: date().notNull(),
    /** The facts (paise, dates, counts); the page writes the sentence. */
    data: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex('holding_notices_dedupe_idx').on(table.ownerId, table.kind, table.dedupeKey),
    index('holding_notices_owner_idx').on(table.ownerId, table.createdAt.desc()),
    check(
      'holding_notices_kind_check',
      sql`${table.kind} in ('event_soon', 'share_change', 'stock_move', 'portfolio_move', 'long_term_soon')`,
    ),
  ],
);

/** Which holding notices a user gets, and their levels. A missing row means the defaults. */
export const holdingNoticeSettings = pgTable(
  'holding_notice_settings',
  {
    ownerId: integer()
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    events: boolean().notNull().default(true),
    shareChanges: boolean().notNull().default(true),
    stockMoves: boolean().notNull().default(true),
    stockMovePercent: integer().notNull().default(5),
    portfolioMoves: boolean().notNull().default(true),
    portfolioMovePercent: integer().notNull().default(3),
    longTerm: boolean().notNull().default(true),
    longTermDays: integer().notNull().default(7),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'holding_notice_settings_ranges',
      sql`${table.stockMovePercent} between 1 and 50 and ${table.portfolioMovePercent} between 1 and 50 and ${table.longTermDays} between 1 and 90`,
    ),
  ],
);

/**
 * AMFI's half-yearly Large / Mid / Small Cap list (SEBI circular of 6 Oct 2017),
 * one row per ISIN, from the six months ended `period_end`. Reference data, not
 * price history: a new list replaces the old one row by row.
 */
export const amfiCategories = pgTable(
  'amfi_categories',
  {
    isin: text().primaryKey(),
    nseSymbol: text(),
    category: text().notNull(),
    periodEnd: date().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('amfi_categories_period_idx').on(table.periodEnd),
    check('amfi_categories_category_check', sql`${table.category} in ('large', 'mid', 'small')`),
  ],
);
