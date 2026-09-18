import { z } from 'zod';
import {
  intradayDirectionSchema,
  intradayEvidenceSchema,
  intradayProjectionSchema,
  paiseSchema,
} from './intraday.js';

/**
 * Contracts for per-user intraday paper trading
 * (docs/planning/paper-trading-plan.md §7, §10, §13).
 *
 * A strategy publishes a TRADE INTENT once, globally. Each user's paper
 * portfolio then makes its own deterministic risk decision and simulates the
 * trade in its own ledger. Nothing here is shaped for a broker order: shares
 * are simulated, prices are technical levels, cash is virtual.
 */

/** What a strategy hands the engine. Provider-neutral, versioned, frozen. */
export const tradeIntentSchema = z.object({
  id: z.number().int().positive(),
  strategyId: z.string().min(1),
  strategyVersionId: z.number().int().positive(),
  instrumentId: z.number().int(),
  symbol: z.string().min(1),
  sector: z.string().nullable(),
  direction: intradayDirectionSchema,
  /** Candle close that produced the signal, ms UTC. Fills happen strictly after it. */
  signalAt: z.number().int(),
  sessionDate: z.string(),
  entry: z.object({
    kind: z.enum(['MARKET_NEXT', 'STOP_BEYOND_LEVEL', 'LIMIT']),
    /** The signal close; all levels are measured from it. */
    reference: paiseSchema,
    maxSlipBps: z.number().int().nonnegative(),
  }),
  validUntil: z.number().int(),
  stop: paiseSchema,
  target1: paiseSchema,
  target2: paiseSchema,
  riskDistance: paiseSchema,
  tickSize: paiseSchema,
  exits: z.object({
    partialAtTarget1: z.number().min(0).max(1),
    breakevenAfterTarget1: z.boolean(),
    trailing: z.null(),
    timeExitAt: z.number().int().nullable(),
  }),
  /** The strategy's own ranking metric for same-candle ties (ORB-VC: relative volume). */
  sizing: z.object({ strength: z.number().finite() }),
  evidence: intradayEvidenceSchema,
});
export type TradeIntent = z.infer<typeof tradeIntentSchema>;

/** Portfolio-level limits. Integers only; bps of equity unless named otherwise. */
export const paperLimitsSchema = z
  .object({
    riskBps: z.number().int().min(10).max(200),
    maxOpenPositions: z.number().int().min(1).max(5),
    maxTradesPerDay: z.number().int().min(1).max(10),
    maxPositionExposureBps: z.number().int().min(500).max(5000),
    maxPortfolioExposureBps: z.number().int().min(1000).max(10000),
    maxStockExposureBps: z.number().int().min(500).max(5000),
    maxSectorExposureBps: z.number().int().min(1000).max(10000),
    dailyLossHaltBps: z.number().int().min(50).max(500),
    maxDrawdownHaltBps: z.number().int().min(200).max(2000),
  })
  .strict();
export type PaperLimits = z.infer<typeof paperLimitsSchema>;

export const paperSettingsSchema = paperLimitsSchema.extend({
  enabled: z.boolean(),
  enabledAt: z.number().int().nullable(),
  entriesPaused: z.boolean(),
  settingsVersion: z.number().int().positive(),
});
export type PaperSettings = z.infer<typeof paperSettingsSchema>;

export const paperStrategyAssignmentSchema = z.object({
  strategyId: z.string().min(1),
  enabled: z.boolean(),
  /** Lower wins when strategies compete for the same candle's capital. */
  priority: z.number().int().min(1).max(100),
});
export type PaperStrategyAssignment = z.infer<typeof paperStrategyAssignmentSchema>;

/** Every way the engine declines or ends a trade. Stored, never inferred. */
export const paperReasonCodeSchema = z.enum([
  'INSUFFICIENT_CASH',
  'PORTFOLIO_RISK_LIMIT',
  'DAILY_LOSS_LIMIT',
  'DRAWDOWN_LIMIT',
  'MAX_POSITIONS',
  'MAX_TRADES_PER_DAY',
  'STOCK_EXPOSURE_LIMIT',
  'SECTOR_EXPOSURE_LIMIT',
  'DUPLICATE_SIGNAL',
  'CONFLICTING_SIGNAL',
  'EXISTING_POSITION',
  'STRATEGY_DISABLED',
  'PAPER_TRADING_DISABLED',
  'ENTRIES_PAUSED',
  'SIGNAL_BEFORE_ACTIVATION',
  'SIGNAL_EXPIRED',
  'MARKET_CLOSED',
  'AFTER_ENTRY_CUTOFF',
  'STALE_MARKET_DATA',
  'MISSING_CANDLE',
  'ENTRY_GAP_TOO_LARGE',
  'INVALID_STOP',
  'QUANTITY_ZERO',
  'UNSUPPORTED_ENTRY_KIND',
  'EOD_SQUARE_OFF',
  'COVERAGE_UNAVAILABLE',
]);
export type PaperReasonCode = z.infer<typeof paperReasonCodeSchema>;

export const paperOrderStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'FILLED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);
export type PaperOrderStatus = z.infer<typeof paperOrderStatusSchema>;
export const paperPositionStatusSchema = z.enum(['OPEN', 'EXIT_PENDING', 'CLOSED']);
export type PaperPositionStatus = z.infer<typeof paperPositionStatusSchema>;

/** The operands of one sizing decision, kept so the page can say "why 67 shares". */
export const paperSizingSnapshotSchema = z.object({
  equityPaise: z.number().int().safe().nonnegative(),
  availableCashPaise: z.number().int().safe().nonnegative(),
  riskBudgetPaise: z.number().int().safe().nonnegative(),
  perShareRiskPaise: paiseSchema,
  plannedEntryPaise: paiseSchema,
  caps: z.object({
    byRisk: z.number().int().nonnegative(),
    byCash: z.number().int().nonnegative(),
    byPosition: z.number().int().nonnegative(),
    byStock: z.number().int().nonnegative(),
    bySector: z.number().int().nonnegative(),
    byPortfolio: z.number().int().nonnegative(),
  }),
  bindingCap: z.enum([
    'byRisk',
    'byCash',
    'byPosition',
    'byStock',
    'bySector',
    'byPortfolio',
    'charges',
  ]),
  shares: z.number().int().nonnegative(),
  reservePaise: z.number().int().safe().nonnegative(),
});
export type PaperSizingSnapshot = z.infer<typeof paperSizingSnapshotSchema>;

/** One risk decision for one intent in one portfolio. */
export const paperDecisionSchema = z.object({
  intentId: z.number().int().positive(),
  strategyId: z.string(),
  accepted: z.boolean(),
  reasonCode: paperReasonCodeSchema.nullable(),
  reasonText: z.string(),
  shares: z.number().int().nonnegative(),
  sizing: paperSizingSnapshotSchema.nullable(),
  /** Counts as the engine saw them, after earlier decisions in the same batch. */
  counts: z.object({ openPositions: z.number().int(), tradesToday: z.number().int() }),
});
export type PaperDecision = z.infer<typeof paperDecisionSchema>;

export const paperLedgerKindSchema = z.enum([
  'OPENING_BALANCE',
  'RESERVE',
  'RELEASE',
  'ENTRY',
  'EXIT',
  'CHARGES',
  'ADJUSTMENT_RECONCILE',
]);
export type PaperLedgerKind = z.infer<typeof paperLedgerKindSchema>;

/** One immutable line of the virtual cash book. */
export const paperLedgerEntrySchema = z.object({
  sequence: z.number().int().positive(),
  at: z.number().int(),
  kind: paperLedgerKindSchema,
  /** Signed effect on free cash. */
  amountPaise: z.number().int().safe(),
  cashAfterPaise: z.number().int().safe().nonnegative(),
  /** Cash held by pending orders after this entry. */
  reservedAfterPaise: z.number().int().safe().nonnegative(),
  /** Cost basis held in open trades after this entry. */
  lockedAfterPaise: z.number().int().safe().nonnegative(),
  /** EXIT only: the cost-basis part of the amount returned (negative). 0 otherwise. */
  lockedDeltaPaise: z.number().int().safe(),
  refKind: z.enum(['portfolio', 'order', 'fill', 'position', 'reconcile']),
  refId: z.number().int(),
  idempotencyKey: z.string().min(1),
});
export type PaperLedgerEntry = z.infer<typeof paperLedgerEntrySchema>;

export const paperPositionEventKindSchema = z.enum([
  'OPENED',
  'TARGET1_PARTIAL',
  'STOP_UPDATED',
  'TARGET2',
  'STOP',
  'BREAKEVEN_STOP',
  'EOD_SQUARE_OFF',
  'COVERAGE_BREAK',
  'UNRESOLVED',
]);
export type PaperPositionEventKind = z.infer<typeof paperPositionEventKindSchema>;

/** A live paper trade: the intraday projection plus what the ledger needs. */
export const paperPositionSchema = z.object({
  id: z.number().int(),
  intentId: z.number().int(),
  strategyId: z.string(),
  strategyVersionId: z.number().int(),
  instrumentId: z.number().int(),
  symbol: z.string(),
  sector: z.string().nullable(),
  direction: intradayDirectionSchema,
  status: paperPositionStatusSchema,
  projection: intradayProjectionSchema,
  /** entry price × shares, the cost basis still open. */
  lockedPaise: z.number().int().safe().nonnegative(),
  grossRealisedPaise: z.number().int().safe(),
  chargesPaise: z.number().int().safe().nonnegative(),
  netRealisedPaise: z.number().int().safe(),
  initialRiskPaise: z.number().int().safe().nonnegative().nullable(),
  exitReason: paperReasonCodeSchema.or(paperPositionEventKindSchema).nullable(),
  openedAt: z.number().int().nullable(),
  closedAt: z.number().int().nullable(),
});
export type PaperPosition = z.infer<typeof paperPositionSchema>;

export const exchangeSessionKindSchema = z.enum([
  'NORMAL',
  'HOLIDAY',
  'SPECIAL',
  'MUHURAT',
  'CLOSED_UNSCHEDULED',
  'WEEKEND',
]);
export type ExchangeSessionKind = z.infer<typeof exchangeSessionKindSchema>;
export const exchangeSessionSchema = z.object({
  tradingDate: z.string(),
  kind: exchangeSessionKindSchema,
  /** ms UTC; null when the exchange is closed. */
  openAt: z.number().int().nullable(),
  closeAt: z.number().int().nullable(),
  entryCutoffAt: z.number().int().nullable(),
  squareOffAt: z.number().int().nullable(),
  note: z.string().nullable(),
});
export type ExchangeSession = z.infer<typeof exchangeSessionSchema>;

/** Performance figures for one group (portfolio, strategy, version, instrument). */
export const paperPerformanceSchema = z.object({
  group: z.string(),
  closedTrades: z.number().int(),
  unresolvedTrades: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  breakeven: z.number().int(),
  winRate: z.number().nullable(),
  winRateLow95: z.number().nullable(),
  winRateHigh95: z.number().nullable(),
  averageWinPaise: z.number().int().nullable(),
  averageLossPaise: z.number().int().nullable(),
  profitFactor: z.number().nullable(),
  expectancyPaise: z.number().int().nullable(),
  expectancyTimesRisked: z.number().nullable(),
  target1HitRate: z.number().nullable(),
  target2HitRate: z.number().nullable(),
  stopHitRate: z.number().nullable(),
  averageHoldingMs: z.number().int().nullable(),
  grossPaise: z.number().int().safe(),
  chargesPaise: z.number().int().safe(),
  netPaise: z.number().int().safe(),
  sampleSize: z.enum(['TOO_FEW', 'EARLY', 'OK']),
});
export type PaperPerformance = z.infer<typeof paperPerformanceSchema>;

/** `config/nse-calendar.yaml`: operator-verified from NSE's published circulars. */
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM');
export const calendarConfigSchema = z
  .object({
    exchange: z.literal('NSE'),
    /** The last date this file was checked against the exchange's list. */
    verifiedThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timings: z.object({
      open: hhmm,
      close: hhmm,
      entryCutoff: hhmm,
      squareOff: hhmm,
    }),
    holidays: z.array(
      z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string() }),
    ),
    specialSessions: z.array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        kind: z.enum(['SPECIAL', 'MUHURAT']),
        name: z.string(),
        open: hhmm,
        close: hhmm,
        entryCutoff: hhmm,
        squareOff: hhmm,
      }),
    ),
  })
  .strict();
export type CalendarConfig = z.infer<typeof calendarConfigSchema>;

// ---------------------------------------------------------------------------
// Page contracts (`/api/paper/*`, docs/planning/paper-trading-plan.md §8)

export const paperStrategyInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  revision: z.number().int(),
  timeframe: z.string(),
  strength: z.string(),
  rules: z.array(z.string()),
  parameters: z.record(z.union([z.number(), z.string(), z.boolean()])),
});
export type PaperStrategyInfo = z.infer<typeof paperStrategyInfoSchema>;

export const paperLevelsSchema = z.object({
  reference: paiseSchema,
  stop: paiseSchema,
  target1: paiseSchema,
  target2: paiseSchema,
});

/** A live paper trade as the page shows it: the position plus its marks and levels. */
export const paperOpenTradeSchema = paperPositionSchema.extend({
  decidedShares: z.number().int().nonnegative(),
  levels: paperLevelsSchema,
  lastPrice: paiseSchema.nullable(),
  quoteAt: z.number().int().nullable(),
  /** Realised legs plus the remainder marked at `lastPrice`; null without a mark. */
  markNetPaise: z.number().int().safe().nullable(),
  squareOffAt: z.number().int().nullable(),
});
export type PaperOpenTrade = z.infer<typeof paperOpenTradeSchema>;

export const paperBalancesSchema = z.object({
  cashPaise: z.number().int().safe().nonnegative(),
  reservedPaise: z.number().int().safe().nonnegative(),
  lockedPaise: z.number().int().safe().nonnegative(),
  unrealisedPaise: z.number().int().safe().nullable(),
  equityPaise: z.number().int().safe().nullable(),
  exposurePaise: z.number().int().safe().nonnegative(),
  peakEquityPaise: z.number().int().safe().nonnegative(),
  drawdownPaise: z.number().int().safe().nullable(),
  marksComplete: z.boolean(),
});
export type PaperBalances = z.infer<typeof paperBalancesSchema>;

export const paperFeedModeSchema = z.enum(['LIVE', 'STALE', 'CLOSED', 'UNAVAILABLE']);
export const paperPhaseSchema = z.enum([
  'PRE_OPEN',
  'OPENING_RANGE',
  'SESSION',
  'AFTER_ENTRIES',
  'SQUARE_OFF',
  'CLOSED',
]);
export type PaperPhase = z.infer<typeof paperPhaseSchema>;

export const paperRiskEventDtoSchema = z.object({
  id: z.number().int(),
  at: z.number().int(),
  kind: z.string(),
  detail: z.record(z.unknown()),
  resolvedAt: z.number().int().nullable(),
});
export type PaperRiskEventDto = z.infer<typeof paperRiskEventDtoSchema>;

export const paperOverviewSchema = z.object({
  serverNow: z.number().int(),
  sessionDate: z.string(),
  portfolio: z.object({
    startingCapitalPaise: paiseSchema,
    createdAt: z.number().int(),
  }),
  settings: paperSettingsSchema,
  assignments: z.array(paperStrategyAssignmentSchema),
  strategies: z.array(paperStrategyInfoSchema),
  session: exchangeSessionSchema,
  phase: paperPhaseSchema,
  feed: z.object({
    name: z.string(),
    mode: paperFeedModeSchema,
    lastQuoteAt: z.number().int().nullable(),
    /** The paper monitor's last completed cycle; null before its first. */
    workerCycleAt: z.number().int().nullable(),
    workerDelayed: z.boolean(),
  }),
  balances: paperBalancesSchema,
  today: z.object({
    realisedPaise: z.number().int().safe(),
    unrealisedPaise: z.number().int().safe().nullable(),
    netPaise: z.number().int().safe().nullable(),
    trades: z.number().int().nonnegative(),
    open: z.number().int().nonnegative(),
    decided: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }),
  openTrades: z.array(paperOpenTradeSchema),
  /** Unresolved halts and alerts for this portfolio. */
  halts: z.array(paperRiskEventDtoSchema),
  simulation: z.object({ tier: z.string(), chargesVersion: z.string() }),
});
export type PaperOverview = z.infer<typeof paperOverviewSchema>;

export const paperSettingsUpdateSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(64),
    enabled: z.boolean().optional(),
    entriesPaused: z.boolean().optional(),
  })
  .merge(paperLimitsSchema.partial())
  .strict();
export type PaperSettingsUpdate = z.infer<typeof paperSettingsUpdateSchema>;

export const paperStrategyUpdateSchema = z
  .object({ idempotencyKey: z.string().min(8).max(64) })
  .merge(paperStrategyAssignmentSchema)
  .strict();
export const paperEmergencyStopSchema = z
  .object({ paused: z.boolean(), idempotencyKey: z.string().min(8).max(64) })
  .strict();

export const paperSettingsResponseSchema = z.object({
  settings: paperSettingsSchema,
  assignments: z.array(paperStrategyAssignmentSchema),
  strategies: z.array(paperStrategyInfoSchema),
});
export type PaperSettingsResponse = z.infer<typeof paperSettingsResponseSchema>;

export const paperDecisionDtoSchema = z.object({
  orderId: z.number().int(),
  intentId: z.number().int(),
  strategyId: z.string(),
  strategyVersionId: z.number().int(),
  instrumentId: z.number().int(),
  symbol: z.string(),
  direction: intradayDirectionSchema,
  status: paperOrderStatusSchema,
  reasonCode: paperReasonCodeSchema.nullable(),
  reasonText: z.string(),
  requestedShares: z.number().int().nonnegative(),
  decidedAt: z.number().int(),
  signalAt: z.number().int(),
  sizing: paperSizingSnapshotSchema.nullable(),
  counts: z.object({ openPositions: z.number().int(), tradesToday: z.number().int() }),
  levels: paperLevelsSchema,
});
export type PaperDecisionDto = z.infer<typeof paperDecisionDtoSchema>;

export const paperEventDtoSchema = z.object({
  positionId: z.number().int(),
  symbol: z.string(),
  sequence: z.number().int(),
  kind: paperPositionEventKindSchema,
  at: z.number().int(),
  pricePaise: paiseSchema.nullable(),
  shares: z.number().int().nullable(),
  explanation: z.string(),
});
export type PaperEventDto = z.infer<typeof paperEventDtoSchema>;

export const paperActivitySchema = z.object({
  sessionDate: z.string(),
  decisions: z.array(paperDecisionDtoSchema),
  events: z.array(paperEventDtoSchema),
  trades: z.array(paperOpenTradeSchema),
});
export type PaperActivity = z.infer<typeof paperActivitySchema>;

export const paperTradesPageSchema = z.object({
  trades: z.array(paperOpenTradeSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type PaperTradesPage = z.infer<typeof paperTradesPageSchema>;

export const paperRangeSchema = z.enum(['7d', '30d', '90d', 'all']);
export type PaperRange = z.infer<typeof paperRangeSchema>;
export const paperPerformanceReportSchema = z.object({
  range: paperRangeSchema,
  from: z.string().nullable(),
  portfolio: paperPerformanceSchema,
  byStrategy: z.array(paperPerformanceSchema),
  byVersion: z.array(paperPerformanceSchema),
  byInstrument: z.array(paperPerformanceSchema),
  byExitReason: z.array(paperPerformanceSchema),
  equityCurve: z.array(
    z.object({ at: z.number().int(), equityPaise: z.number().int().safe().nullable() }),
  ),
  dailyNet: z.array(
    z.object({
      tradingDate: z.string(),
      netPaise: z.number().int().safe(),
      trades: z.number().int(),
    }),
  ),
  maxDrawdown: z.object({ paise: z.number().int().safe(), bps: z.number().nullable() }),
  startingCapitalPaise: paiseSchema,
});
export type PaperPerformanceReport = z.infer<typeof paperPerformanceReportSchema>;

export const paperAuditDtoSchema = z.object({
  at: z.number().int(),
  event: z.string(),
  detail: z.record(z.unknown()),
});
export const paperAuditResponseSchema = z.object({ events: z.array(paperAuditDtoSchema) });

export const paperHealthSchema = z.object({
  serverNow: z.number().int(),
  session: exchangeSessionSchema,
  calendar: z.object({ verifiedThrough: z.string(), expiresSoon: z.boolean() }),
  feed: z.object({ mode: paperFeedModeSchema, lastQuoteAt: z.number().int().nullable() }),
  portfolios: z.object({
    total: z.number().int(),
    enabled: z.number().int(),
    withLiveTrades: z.number().int(),
  }),
  openAfterCutoff: z.number().int(),
  unresolvedRiskEvents: z.array(z.object({ kind: z.string(), count: z.number().int() })),
  lastCycles: z.record(
    z.object({ at: z.number().int(), cursor: z.record(z.unknown()) }).nullable(),
  ),
  ledgerMismatches: z.number().int(),
});
export type PaperHealth = z.infer<typeof paperHealthSchema>;
