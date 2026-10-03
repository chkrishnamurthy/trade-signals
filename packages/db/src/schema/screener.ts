import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { authUsers } from './auth.js';
import { instruments } from './instruments.js';

/**
 * The stock-analysis surfaces: screener, stock page and market breadth
 * (docs/planning/screener-dhan-fyers-plan.md §9).
 *
 * Shared reference data (classification, membership, snapshots, breadth) is
 * written ONLY by the worker. `saved_screens` is per-user and owner-scoped,
 * like watchlists.
 */

/**
 * Exchange reference facts per instrument, from NSE's equity list and index
 * constituent files. One row per instrument, refreshed in place: these are
 * descriptive attributes, not price history, so an UPDATE is the right shape.
 */
export const instrumentReference = pgTable('instrument_reference', {
  instrumentId: integer()
    .primaryKey()
    .references(() => instruments.id),
  /** NSE series: EQ, BE or BZ. */
  series: text().notNull(),
  listingDate: date(),
  /** Face value per share, paise. */
  faceValuePaise: integer(),
  /** NSE index industry; null = unclassified (never guessed). */
  industry: text(),
  /** Which file supplied `industry`. */
  industrySource: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * Index membership with effective dates. A row with `effectiveTo` null is the
 * current membership; leaving an index closes the row rather than deleting it,
 * so "was it in the Nifty 500 then?" stays answerable.
 */
export const indexMemberships = pgTable(
  'index_memberships',
  {
    indexKey: text().notNull(),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    effectiveFrom: date().notNull(),
    effectiveTo: date(),
    source: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.indexKey, table.instrumentId, table.effectiveFrom] }),
    index('index_memberships_current_idx')
      .on(table.indexKey, table.instrumentId)
      .where(sql`${table.effectiveTo} IS NULL`),
  ],
);

/** One worker run of the snapshot build — the audit trail for every row it wrote. */
export const screenerSnapshotBuilds = pgTable(
  'screener_snapshot_builds',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    tradingDate: date().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
    /** `running`, `ok`, `failed`. */
    status: text().notNull().default('running'),
    instruments: integer().notNull().default(0),
    rowsWritten: integer().notNull().default(0),
    /** Instruments skipped for too little history or a data issue. */
    skipped: integer().notNull().default(0),
    /** Version of the metric calculations, bumped when a formula changes. */
    calcVersion: text().notNull(),
    error: text(),
  },
  (table) => [index('screener_snapshot_builds_date_idx').on(table.tradingDate.desc())],
);

/**
 * The screener's read model: one wide row per (session, instrument).
 *
 * Every metric column is named after its catalogue key
 * (`packages/core/src/screener/catalogue.ts`), so the SQL compiler maps a
 * filter leaf to a column by name. Nullable throughout: null means "not
 * enough data", never zero.
 *
 * Units: prices and money are integer paise; percentages, ratios and scores
 * are doubles; share counts are bigints.
 */
export const screenerSnapshots = pgTable(
  'screener_snapshots',
  {
    tradingDate: date().notNull(),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    buildId: integer()
      .notNull()
      .references(() => screenerSnapshotBuilds.id),
    symbol: text().notNull(),
    name: text().notNull(),

    // Price & returns
    close: integer().notNull(),
    changePct: doublePrecision(),
    gapPct: doublePrecision(),
    ret1w: doublePrecision(),
    ret1m: doublePrecision(),
    ret3m: doublePrecision(),
    ret6m: doublePrecision(),
    ret1y: doublePrecision(),
    retYtd: doublePrecision(),
    dist52wHigh: doublePrecision(),
    dist52wLow: doublePrecision(),
    distAth: doublePrecision(),
    rangePosDay: doublePrecision(),
    high52w: integer(),
    low52w: integer(),

    // Trend
    closeVsEma20: doublePrecision(),
    closeVsEma50: doublePrecision(),
    closeVsEma200: doublePrecision(),
    closeVsSma50: doublePrecision(),
    closeVsSma200: doublePrecision(),
    emaStack: text(),
    goldenCrossDays: integer(),
    deathCrossDays: integer(),
    supertrendDir: text(),
    supertrendFlipDays: integer(),
    adx14: doublePrecision(),
    plusDi: doublePrecision(),
    minusDi: doublePrecision(),
    higherHighs: boolean(),
    ema20: integer(),
    ema50: integer(),
    ema200: integer(),
    supertrendValue: integer(),

    // Momentum
    rsi14: doublePrecision(),
    rsiAbove50Days: integer(),
    rsiAbove60Days: integer(),
    rsiBelow40Days: integer(),
    macdHist: integer(),
    macdHistRising: boolean(),
    macdCrossUpDays: integer(),
    macdCrossDownDays: integer(),
    stochK: doublePrecision(),
    stochD: doublePrecision(),
    roc20: doublePrecision(),

    // Volatility & range
    atr14: integer(),
    atrPct: doublePrecision(),
    bbWidth: doublePrecision(),
    bbSqueeze: boolean(),
    range10Pct: doublePrecision(),
    range20Pct: doublePrecision(),
    volatility20: doublePrecision(),
    nr4: boolean(),
    nr7: boolean(),

    // Breakouts & patterns
    high20d: integer(),
    low20d: integer(),
    breakout20d: boolean(),
    breakdown20d: boolean(),
    breakout52w: boolean(),
    breakdown52w: boolean(),
    insideBar: boolean(),
    outsideBar: boolean(),
    bullishEngulfing: boolean(),
    bearishEngulfing: boolean(),
    hammer: boolean(),
    shootingStar: boolean(),
    doji: boolean(),

    // Relative strength
    rsRank: doublePrecision(),
    rs1m: doublePrecision(),
    rs3m: doublePrecision(),
    rs6m: doublePrecision(),
    rsNewHigh: boolean(),

    // Volume & liquidity
    volume: bigint({ mode: 'number' }).notNull(),
    avgVolume20: bigint({ mode: 'number' }),
    relVolume: doublePrecision(),
    turnover: bigint({ mode: 'number' }),
    avgTurnover20: bigint({ mode: 'number' }),
    trades: integer(),

    // Delivery
    deliveryPct: doublePrecision(),
    avgDelivery20: doublePrecision(),
    deliveryVsAvg: doublePrecision(),
    deliveryRatio: doublePrecision(),
    deliveryQty: bigint({ mode: 'number' }),

    // F&O
    fnoEligible: boolean().notNull().default(false),
    futOi: bigint({ mode: 'number' }),
    futOiChgPct: doublePrecision(),
    oiBuildup: text(),
    oiBuildupStreak: integer(),
    oiAsOf: date(),

    // Ownership
    promoterPct: doublePrecision(),
    promoterChgQoq: doublePrecision(),
    publicPct: doublePrecision(),
    publicChgQoq: doublePrecision(),
    promoterStreak: integer(),
    shareholdingAsOf: date(),

    // Deals & events
    bulkDeals20d: integer(),
    blockDeals20d: integer(),
    resultsInDays: integer(),
    exDateInDays: integer(),
    announcements7d: integer(),
    listedDays: integer(),

    // Classification
    industry: text(),
    series: text(),
    indexKeys: text().array().notNull().default(sql`ARRAY[]::text[]`),
    sizeBucket: text(),

    // Signals (served to admins only)
    signalDirection: text(),
    signalStrength: doublePrecision(),

    /** Last 60 adjusted closes, paise — the results sparkline. */
    spark: integer().array(),
    /** Set when history-dependent metrics were withheld (e.g. an unrecorded split). */
    dataIssue: text(),
    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tradingDate, table.instrumentId] }),
    index('screener_snapshots_instrument_idx').on(table.instrumentId, table.tradingDate.desc()),
    index('screener_snapshots_date_rs_idx').on(table.tradingDate, table.rsRank.desc()),
    index('screener_snapshots_industry_idx').on(table.tradingDate, table.industry),
  ],
);

/**
 * Market breadth per session and universe (`all`, `nifty500`), rebuilt
 * nightly from each stock's adjusted series. Upserted: the latest build is
 * the truth for a derived aggregate.
 */
export const marketBreadthDaily = pgTable(
  'market_breadth_daily',
  {
    universe: text().notNull(),
    tradingDate: date().notNull(),
    advances: integer().notNull(),
    declines: integer().notNull(),
    unchanged: integer().notNull(),
    above20: integer().notNull(),
    base20: integer().notNull(),
    above50: integer().notNull(),
    base50: integer().notNull(),
    above200: integer().notNull(),
    base200: integer().notNull(),
    newHighs: integer().notNull(),
    newLows: integer().notNull(),
    base52: integer().notNull(),
    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.universe, table.tradingDate] })],
);

/** A user's saved screen: the filter AST, columns and sort, owner-scoped. */
export const savedScreens = pgTable(
  'saved_screens',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ownerId: integer()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    /** The FilterNode tree, validated on write AND on read. */
    definition: jsonb().notNull(),
    /** Metric keys shown as columns, in order. */
    columns: jsonb().notNull(),
    /** `metricKey:asc|desc`. */
    sort: text().notNull(),
    /** `all`, `index:<key>` or `watchlist:<id>`. */
    universe: text().notNull().default('all'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('saved_screens_owner_name_idx').on(table.ownerId, table.name),
    index('saved_screens_owner_idx').on(table.ownerId, table.updatedAt.desc()),
  ],
);
