import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * The tradeable universe, and the corrections applied to its price history.
 *
 * Provider-neutral by construction: `symbol` is OUR symbol and `provider_ref`
 * is an opaque string. Nothing here encodes a Fyers ticker format.
 */

export const instruments = pgTable(
  'instruments',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** Our symbol: `RELIANCE`, `NIFTY50`. Unique per exchange. */
    symbol: text().notNull(),
    name: text().notNull(),
    /** `equity` or `index`. */
    kind: text().notNull(),
    exchange: text().notNull().default('NSE'),
    /** Null for indices, which have no ISIN. */
    isin: text(),
    lotSize: integer().notNull().default(1),
    /** Minimum price increment, in PAISE. */
    tickSize: integer().notNull(),
    /**
     * The provider's own identifier, opaque above the adapter.
     *
     * Stored so ingestion survives a ticker rename: the provider keeps the same
     * ref while `symbol` changes underneath it.
     */
    providerRef: text(),
    providerId: text().notNull(),
    /**
     * False once an instrument leaves the universe.
     *
     * Never deleted — its candles stay valid history, and deleting it would
     * silently introduce survivorship bias into every backtest.
     */
    active: boolean().notNull().default(true),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('instruments_symbol_exchange_idx').on(table.symbol, table.exchange),
    index('instruments_active_idx').on(table.active).where(sql`${table.active}`),
    index('instruments_provider_ref_idx').on(table.providerId, table.providerRef),
  ],
);

/**
 * Splits, bonuses and other events that make raw history discontinuous.
 *
 * Applied ON READ (CLAUDE.md hard rule 5) — `candles` is never UPDATEd. A 1:5
 * split is `ratio = 0.2`: multiply every price BEFORE `ex_date` by it to put
 * the series on today's terms.
 */
export const corporateActions = pgTable(
  'corporate_actions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    /** `split`, `bonus`, `dividend`, `consolidation`. */
    kind: text().notNull(),
    /** First session that trades on the new basis. */
    exDate: date().notNull(),
    /**
     * Price adjustment factor, exact.
     *
     * `numeric`, not float: this multiplies every historical price, so a binary
     * rounding error here propagates through the entire series.
     */
    ratio: numeric({ precision: 18, scale: 10 }).notNull(),
    /** Free text from the source, for auditing a surprising adjustment. */
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('corporate_actions_unique_idx').on(table.instrumentId, table.exDate, table.kind),
    index('corporate_actions_instrument_idx').on(table.instrumentId, table.exDate),
  ],
);

/**
 * Ingestion bookkeeping.
 *
 * Answers "which sessions do we actually have?" — without it, a worker outage
 * leaves a hole that indicators compute straight across, producing a plausible
 * and wrong number rather than an error.
 */
export const ingestionRuns = pgTable(
  'ingestion_runs',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** `daily_candles`, `intraday_candles`, `instruments`, `indicators`. */
    job: text().notNull(),
    /** IST trading date the run covers, `YYYY-MM-DD`. */
    tradingDate: date().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
    /** `running`, `ok`, `partial`, `failed`. */
    status: text().notNull().default('running'),
    instrumentsRequested: integer().notNull().default(0),
    instrumentsSucceeded: integer().notNull().default(0),
    rowsWritten: integer().notNull().default(0),
    /** Symbols that failed, so a retry knows exactly what to re-fetch. */
    failedSymbols: text().array().notNull().default(sql`ARRAY[]::text[]`),
    error: text(),
  },
  (table) => [
    index('ingestion_runs_job_date_idx').on(table.job, table.tradingDate),
    index('ingestion_runs_status_idx').on(table.status),
  ],
);
