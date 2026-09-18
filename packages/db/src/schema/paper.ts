import type { IntradayProjection, PaperSizingSnapshot, TradeIntent } from '@equitywise/shared';
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
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { authUsers } from './auth.js';
import { instruments } from './instruments.js';
import { intradaySignals } from './intraday.js';
import { strategyVersions } from './signals.js';

/**
 * Per-user paper trading (docs/planning/paper-trading-plan.md §7.2).
 *
 * Every table hangs off `paper_portfolios`, and every read path joins through
 * the portfolio's `user_id`. Money is integer paise. Orders, fills, events and
 * ledger entries are append-only (triggers in 0023); the position row and the
 * settings row are the only mutable projections.
 */
export const paperPortfolios = pgTable(
  'paper_portfolios',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => authUsers.id),
    startingCapitalPaise: bigint({ mode: 'number' }).notNull(),
    /** Bumps on a future "reset"; every child row carries the generation it belongs to. */
    resetGeneration: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('paper_portfolios_user_idx').on(t.userId),
    check('paper_portfolios_capital_positive', sql`${t.startingCapitalPaise} > 0`),
  ],
);

export const paperSettings = pgTable(
  'paper_settings',
  {
    portfolioId: integer()
      .primaryKey()
      .references(() => paperPortfolios.id),
    enabled: boolean().notNull().default(false),
    enabledAt: timestamp({ withTimezone: true }),
    disabledAt: timestamp({ withTimezone: true }),
    entriesPaused: boolean().notNull().default(false),
    entriesPausedAt: timestamp({ withTimezone: true }),
    riskBps: integer().notNull(),
    maxOpenPositions: integer().notNull(),
    maxTradesPerDay: integer().notNull(),
    maxPositionExposureBps: integer().notNull(),
    maxPortfolioExposureBps: integer().notNull(),
    maxStockExposureBps: integer().notNull(),
    maxSectorExposureBps: integer().notNull(),
    dailyLossHaltBps: integer().notNull(),
    maxDrawdownHaltBps: integer().notNull(),
    settingsVersion: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    check(
      'paper_settings_bounds',
      sql`${t.riskBps} between 10 and 200 and ${t.maxOpenPositions} between 1 and 5 and ${t.maxTradesPerDay} between 1 and 10 and ${t.maxPositionExposureBps} between 500 and 5000 and ${t.maxPortfolioExposureBps} between 1000 and 10000 and ${t.maxStockExposureBps} between 500 and 5000 and ${t.maxSectorExposureBps} between 1000 and 10000 and ${t.dailyLossHaltBps} between 50 and 500 and ${t.maxDrawdownHaltBps} between 200 and 2000`,
    ),
    check('paper_settings_enabled_at', sql`(${t.enabled} = false) or (${t.enabledAt} is not null)`),
  ],
);

export const paperStrategyAssignments = pgTable(
  'paper_strategy_assignments',
  {
    portfolioId: integer()
      .notNull()
      .references(() => paperPortfolios.id),
    strategyId: text().notNull(),
    enabled: boolean().notNull().default(true),
    priority: integer().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.portfolioId, t.strategyId] }),
    check('paper_strategy_assignments_priority', sql`${t.priority} between 1 and 100`),
  ],
);

/** The risk decision for one intent in one portfolio, and the simulated entry order when accepted. */
export const paperOrders = pgTable(
  'paper_orders',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    portfolioId: integer()
      .notNull()
      .references(() => paperPortfolios.id),
    intentId: integer()
      .notNull()
      .references(() => intradaySignals.id),
    strategyId: text().notNull(),
    strategyVersionId: integer()
      .notNull()
      .references(() => strategyVersions.id),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    direction: text().notNull(),
    /** ENTRY or EXIT; exits carry the leg (1 = Target 1 partial, 2 = final). */
    side: text().notNull(),
    leg: integer().notNull().default(0),
    kind: text().notNull().default('MARKET_NEXT'),
    requestedShares: integer().notNull(),
    status: text().notNull(),
    reasonCode: text(),
    reasonText: text().notNull(),
    decidedAt: timestamp({ withTimezone: true }).notNull(),
    validUntil: timestamp({ withTimezone: true }),
    settingsVersion: integer().notNull(),
    engineRevision: integer().notNull(),
    /** The sizing operands and counts at decision time (`PaperSizingSnapshot` + counts). */
    decision: jsonb()
      .$type<{
        sizing: PaperSizingSnapshot | null;
        counts: { openPositions: number; tradesToday: number };
      }>()
      .notNull(),
    /** The intent as decided, frozen with the order so a later strategy version cannot change it. */
    intent: jsonb().$type<TradeIntent>().notNull(),
    resetGeneration: integer().notNull(),
  },
  (t) => [
    uniqueIndex('paper_orders_idempotency_idx').on(t.portfolioId, t.intentId, t.side, t.leg),
    index('paper_orders_portfolio_decided_idx').on(t.portfolioId, t.decidedAt),
    check(
      'paper_orders_status',
      sql`${t.status} in ('PENDING','ACCEPTED','FILLED','REJECTED','EXPIRED','CANCELLED')`,
    ),
    check('paper_orders_reason', sql`${t.status} <> 'REJECTED' or ${t.reasonCode} is not null`),
    check('paper_orders_side', sql`${t.side} in ('ENTRY','EXIT') and ${t.leg} between 0 and 2`),
  ],
);

export const paperFills = pgTable(
  'paper_fills',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    orderId: integer()
      .notNull()
      .references(() => paperOrders.id),
    portfolioId: integer()
      .notNull()
      .references(() => paperPortfolios.id),
    positionId: integer().notNull(),
    leg: integer().notNull(),
    at: timestamp({ withTimezone: true }).notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull(),
    pricePaise: integer().notNull(),
    shares: integer().notNull(),
    chargesPaise: bigint({ mode: 'number' }).notNull(),
    resolution: text().notNull(),
    /** Provenance: the sampled observation this fill was simulated from. */
    observationId: bigint({ mode: 'number' }),
  },
  (t) => [
    uniqueIndex('paper_fills_position_leg_idx').on(t.positionId, t.leg),
    index('paper_fills_portfolio_at_idx').on(t.portfolioId, t.at),
    check(
      'paper_fills_valid',
      sql`${t.pricePaise} > 0 and ${t.shares} > 0 and ${t.chargesPaise} >= 0 and ${t.leg} between 0 and 2`,
    ),
  ],
);

export const paperPositions = pgTable(
  'paper_positions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    portfolioId: integer()
      .notNull()
      .references(() => paperPortfolios.id),
    orderId: integer()
      .notNull()
      .references(() => paperOrders.id),
    intentId: integer()
      .notNull()
      .references(() => intradaySignals.id),
    strategyId: text().notNull(),
    strategyVersionId: integer()
      .notNull()
      .references(() => strategyVersions.id),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    symbol: text().notNull(),
    sector: text(),
    direction: text().notNull(),
    tradingDate: date().notNull(),
    status: text().notNull(),
    /** The intraday lifecycle projection (fill, exits, effective stop, resolution). */
    projection: jsonb().$type<IntradayProjection>().notNull(),
    decidedShares: integer().notNull(),
    reservePaise: bigint({ mode: 'number' }).notNull(),
    lockedPaise: bigint({ mode: 'number' }).notNull().default(0),
    grossRealisedPaise: bigint({ mode: 'number' }).notNull().default(0),
    chargesPaise: bigint({ mode: 'number' }).notNull().default(0),
    netRealisedPaise: bigint({ mode: 'number' }).notNull().default(0),
    initialRiskPaise: bigint({ mode: 'number' }),
    exitReason: text(),
    sequence: integer().notNull().default(0),
    openedAt: timestamp({ withTimezone: true }),
    closedAt: timestamp({ withTimezone: true }),
    squareOffAt: timestamp({ withTimezone: true }),
    resetGeneration: integer().notNull(),
  },
  (t) => [
    uniqueIndex('paper_positions_intent_idx').on(t.portfolioId, t.intentId),
    uniqueIndex('paper_positions_one_live_idx')
      .on(t.portfolioId, t.instrumentId)
      .where(sql`${t.status} <> 'CLOSED'`),
    index('paper_positions_portfolio_status_idx').on(t.portfolioId, t.status),
    index('paper_positions_portfolio_date_idx').on(t.portfolioId, t.tradingDate),
    index('paper_positions_version_idx').on(t.strategyVersionId),
    check('paper_positions_status', sql`${t.status} in ('OPEN','EXIT_PENDING','CLOSED')`),
    check('paper_positions_closed', sql`(${t.closedAt} is null) = (${t.status} <> 'CLOSED')`),
    check(
      'paper_positions_money',
      sql`${t.lockedPaise} >= 0 and ${t.chargesPaise} >= 0 and ${t.reservePaise} >= 0`,
    ),
  ],
);

export const paperPositionEvents = pgTable(
  'paper_position_events',
  {
    positionId: integer()
      .notNull()
      .references(() => paperPositions.id),
    sequence: integer().notNull(),
    kind: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull(),
    recordedAt: timestamp({ withTimezone: true }).notNull(),
    pricePaise: integer(),
    shares: integer(),
    explanation: text().notNull(),
    observationId: bigint({ mode: 'number' }),
  },
  (t) => [primaryKey({ columns: [t.positionId, t.sequence] })],
);

export const paperLedgerEntries = pgTable(
  'paper_ledger_entries',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    portfolioId: integer()
      .notNull()
      .references(() => paperPortfolios.id),
    sequence: integer().notNull(),
    at: timestamp({ withTimezone: true }).notNull(),
    kind: text().notNull(),
    amountPaise: bigint({ mode: 'number' }).notNull(),
    cashAfterPaise: bigint({ mode: 'number' }).notNull(),
    reservedAfterPaise: bigint({ mode: 'number' }).notNull(),
    lockedAfterPaise: bigint({ mode: 'number' }).notNull(),
    lockedDeltaPaise: bigint({ mode: 'number' }).notNull().default(0),
    refKind: text().notNull(),
    refId: integer().notNull(),
    idempotencyKey: text().notNull(),
    resetGeneration: integer().notNull(),
  },
  (t) => [
    uniqueIndex('paper_ledger_sequence_idx').on(t.portfolioId, t.sequence),
    uniqueIndex('paper_ledger_idempotency_idx').on(t.idempotencyKey),
    check(
      'paper_ledger_nonnegative',
      sql`${t.cashAfterPaise} >= 0 and ${t.reservedAfterPaise} >= 0 and ${t.lockedAfterPaise} >= 0`,
    ),
    check(
      'paper_ledger_kind',
      sql`${t.kind} in ('OPENING_BALANCE','RESERVE','RELEASE','ENTRY','EXIT','CHARGES','ADJUSTMENT_RECONCILE')`,
    ),
  ],
);

export const paperEquitySnapshots = pgTable(
  'paper_equity_snapshots',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    portfolioId: integer()
      .notNull()
      .references(() => paperPortfolios.id),
    tradingDate: date().notNull(),
    at: timestamp({ withTimezone: true }).notNull(),
    cashPaise: bigint({ mode: 'number' }).notNull(),
    reservedPaise: bigint({ mode: 'number' }).notNull(),
    lockedPaise: bigint({ mode: 'number' }).notNull(),
    unrealisedPaise: bigint({ mode: 'number' }),
    equityPaise: bigint({ mode: 'number' }),
    peakEquityPaise: bigint({ mode: 'number' }).notNull(),
    drawdownPaise: bigint({ mode: 'number' }),
    exposurePaise: bigint({ mode: 'number' }).notNull(),
    marksComplete: boolean().notNull(),
  },
  (t) => [
    uniqueIndex('paper_equity_snapshots_at_idx').on(t.portfolioId, t.at),
    index('paper_equity_snapshots_date_idx').on(t.portfolioId, t.tradingDate),
  ],
);

export const paperRiskEvents = pgTable(
  'paper_risk_events',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    portfolioId: integer().references(() => paperPortfolios.id),
    at: timestamp({ withTimezone: true }).notNull(),
    kind: text().notNull(),
    detail: jsonb().$type<Record<string, unknown>>().notNull(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('paper_risk_events_portfolio_idx').on(t.portfolioId, t.at)],
);

/** Insert-only, like auth_audit; user id is not a FK so the trail survives deletion. */
export const paperAuditEvents = pgTable(
  'paper_audit_events',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp({ withTimezone: true }).notNull(),
    userId: integer(),
    portfolioId: integer(),
    event: text().notNull(),
    detail: jsonb().$type<Record<string, unknown>>().notNull(),
    ipAddress: text(),
  },
  (t) => [index('paper_audit_events_portfolio_idx').on(t.portfolioId, t.at)],
);

export const workerCheckpoints = pgTable('worker_checkpoints', {
  job: text().primaryKey(),
  cursor: jsonb().$type<Record<string, unknown>>().notNull(),
  runId: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull(),
});

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

export const instrumentProviderRefs = pgTable(
  'instrument_provider_refs',
  {
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    providerId: text().notNull(),
    providerRef: text().notNull(),
    firstSeenAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.instrumentId, t.providerId] })],
);
