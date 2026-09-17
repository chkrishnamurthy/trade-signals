import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { instruments } from './instruments.js';

/**
 * INSTITUTIONAL FLOW — the per-stock and market-wide positioning datasets
 * behind `/flows` (docs/planning/institutional-flow-plan.md).
 *
 * Three exchange-published EOD datasets plus one derived from the market-data
 * provider's derivatives history:
 *
 *   - `delivery_stats`      NSE full bhavdata: how much of a session's volume
 *                           was actually taken delivery of, per stock.
 *   - `participant_oi`      NSE participant-wise open interest: FII / DII /
 *                           Pro / Client long-short contracts, market-wide.
 *   - `derivative_oi_daily` Stock-futures open interest per session, with the
 *                           build-up classification computed in core.
 *   - `feed_ingestion_runs` One row per attempt of every flow feed, so the
 *                           page can say WHY a dataset is stale, not just that
 *                           it is.
 *
 * Invariants (CLAUDE.md): money is INTEGER PAISE (rule 3); percentages are
 * dimensionless doubles; trading dates are IST date keys; timestamps are UTC
 * (rule 6). Like the disclosure tables these upsert on a natural key — the
 * exchange republishes a file when it corrects it.
 */

/** One attempt of one feed. `feed` is a stable id, e.g. `nse-bhavdata`. */
export const feedIngestionRuns = pgTable(
  'feed_ingestion_runs',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    feed: text().notNull(),
    succeeded: boolean().notNull(),
    fetched: integer().notNull(),
    written: integer().notNull(),
    /** Error name + message on failure; never a stack or a response body. */
    error: text(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    completedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [index('feed_ingestion_runs_feed_idx').on(table.feed, table.completedAt.desc())],
);

/**
 * A session's delivery data for one stock.
 *
 * `deliveryPercent` = deliverable ÷ traded quantity, as published. The close
 * is stored too because the exchange file is final the same evening, a day
 * before `daily_candles` has the session (the EOD pass drops the same-day bar
 * by rule 2), so the flow page can show price and delivery for one date.
 */
export const deliveryStats = pgTable(
  'delivery_stats',
  {
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    tradingDate: date().notNull(),
    /** Shares traded. A count. */
    tradedQty: bigint({ mode: 'number' }).notNull(),
    /** Shares delivered. A count. */
    deliverableQty: bigint({ mode: 'number' }).notNull(),
    deliveryPercent: doublePrecision().notNull(),
    closePaise: integer().notNull(),
    prevClosePaise: integer().notNull(),
    /** Session VWAP as published, paise. */
    avgPricePaise: integer().notNull(),
    /** Session turnover, paise. */
    turnoverPaise: bigint({ mode: 'number' }).notNull(),
    trades: integer().notNull(),
    source: text().notNull(),
    ingestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.instrumentId, table.tradingDate] }),
    index('delivery_stats_date_idx').on(table.tradingDate.desc()),
  ],
);

/**
 * Participant-wise open interest, market-wide, in contracts.
 *
 * One row per (session, participant, bucket): `participant` is `fii` | `dii`
 * | `pro` | `client`; `bucket` is `index_fut` | `stock_fut` | `index_ce` |
 * `index_pe` | `stock_ce` | `stock_pe`. Net = long − short.
 */
export const participantOi = pgTable(
  'participant_oi',
  {
    tradingDate: date().notNull(),
    participant: text().notNull(),
    bucket: text().notNull(),
    longContracts: bigint({ mode: 'number' }).notNull(),
    shortContracts: bigint({ mode: 'number' }).notNull(),
    source: text().notNull(),
    ingestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tradingDate, table.participant, table.bucket] }),
    index('participant_oi_date_idx').on(table.tradingDate.desc()),
  ],
);

/**
 * Stock-futures open interest per session, summed across listed expiries.
 *
 * `buildup` is the standard four-way read of price change × OI change
 * (`long_buildup`, `short_buildup`, `short_covering`, `long_unwinding`),
 * computed in `@equitywise/core` from two CLOSED sessions and stored — the
 * UI never recomputes it (the same discipline as `signal_factors`). Null on
 * the first session seen or when either delta is zero.
 */
export const derivativeOiDaily = pgTable(
  'derivative_oi_daily',
  {
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    tradingDate: date().notNull(),
    /** Total OI across expiries, in the exchange's unit (shares). */
    futuresOi: bigint({ mode: 'number' }).notNull(),
    /** vs the previous stored session. Null on the first. */
    oiChange: bigint({ mode: 'number' }),
    /** Nearest unexpired contract's expiry on this session. */
    nearExpiry: date().notNull(),
    /** Nearest contract's close, paise. */
    futuresClosePaise: integer().notNull(),
    closeChangePaise: integer(),
    buildup: text(),
    /** Contracts summed into `futuresOi`. */
    contracts: integer().notNull(),
    /** Provider id that supplied the bars. */
    source: text().notNull(),
    ingestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.instrumentId, table.tradingDate] }),
    index('derivative_oi_daily_date_idx').on(table.tradingDate.desc()),
  ],
);
