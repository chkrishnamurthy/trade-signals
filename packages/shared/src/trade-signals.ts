import { z } from 'zod';

export const STRATEGY_NAME = 'Confirmed VWAP Trend Pullback';
export const signalStateSchema = z.enum([
  'ENTRY_PENDING',
  'ACTIVE',
  'TARGET_1_HIT',
  'TARGET_2_HIT',
  'STOP_LOSS_HIT',
  'EXPIRED',
  'INVALIDATED',
  'SQUARED_OFF',
]);
export type SignalState = z.infer<typeof signalStateSchema>;
export const terminalSignalStates: readonly SignalState[] = [
  'TARGET_2_HIT',
  'STOP_LOSS_HIT',
  'EXPIRED',
  'INVALIDATED',
  'SQUARED_OFF',
];
export const paiseSchema = z.number().int().safe().positive();
export const barSchema = z.object({
  timestamp: z.number().int().safe(),
  open: paiseSchema,
  high: paiseSchema,
  low: paiseSchema,
  close: paiseSchema,
  volume: z.number().int().safe().nonnegative(),
});
export const conditionSchema = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  requiredValue: z.string(),
  actualValue: z.string(),
  explanation: z.string(),
});
export const factorSchema = z.object({
  id: z.string(),
  label: z.string(),
  earned: z.number().int().nonnegative(),
  max: z.number().int().positive(),
});
export const levelsSchema = z.object({
  trigger: paiseSchema,
  invalidation: paiseSchema,
  target1: paiseSchema,
  target2: paiseSchema,
  risk: paiseSchema,
  tickSize: paiseSchema,
});
export const overlaySchema = z.object({
  timestamp: z.number().int(),
  vwap: paiseSchema.nullable(),
  ema9: paiseSchema.nullable(),
  ema21: paiseSchema.nullable(),
});
export const evidenceSchema = z
  .object({
    strategyName: z.literal(STRATEGY_NAME),
    direction: z.enum(['BUY', 'SELL']),
    confirmationAt: z.number().int(),
    sessionDate: z.string(),
    levels: levelsSchema,
    score: z.number().int().min(70).max(100),
    factors: z.array(factorSchema),
    conditions: z.array(conditionSchema),
    indicators: z.object({
      vwap: paiseSchema,
      ema9: paiseSchema,
      ema21: paiseSchema,
      atr: paiseSchema,
      adx: z.number().finite(),
      relativeVolume: z.number().finite(),
      openingHigh: paiseSchema,
      openingLow: paiseSchema,
      openingMid: paiseSchema,
    }),
    benchmark: z.object({
      symbol: z.literal('NIFTY50'),
      volumeBasis: z.literal('constituent_volume'),
      close: paiseSchema,
      vwap: paiseSchema,
      ema9: paiseSchema,
      ema21: paiseSchema,
    }),
    // Derived candles are reconstructed from the immutable 1m store; only indicator evidence is frozen.
    overlays: z.array(overlaySchema),
    sourceFrom: z.number().int(),
  })
  .superRefine((e, ctx) => {
    const sign = e.direction === 'BUY' ? 1 : -1;
    const levels = e.levels;
    if (
      e.factors.length !== 7 ||
      new Set(e.factors.map((f) => f.id)).size !== 7 ||
      e.factors.some((f) => f.earned > f.max) ||
      e.factors.reduce((sum, f) => sum + f.earned, 0) !== e.score ||
      e.factors.reduce((sum, f) => sum + f.max, 0) !== 100
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Quality must equal its complete factor breakdown.',
      });
    if (e.conditions.length === 0 || e.conditions.some((c) => !c.passed))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Published signals require every mandatory gate.',
      });
    if (
      levels.risk !== sign * (levels.trigger - levels.invalidation) ||
      sign * (levels.target1 - levels.trigger) < 1.5 * levels.risk ||
      sign * (levels.target2 - levels.target1) <= 0 ||
      [levels.trigger, levels.invalidation, levels.target1, levels.target2].some(
        (p) => p % levels.tickSize !== 0,
      )
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Incoherent or off-tick technical levels.',
      });
  });
export type SignalEvidence = z.infer<typeof evidenceSchema>;
export type SignalLevels = z.infer<typeof levelsSchema>;
export type SignalCondition = z.infer<typeof conditionSchema>;
export type SignalFactor = z.infer<typeof factorSchema>;
export const projectionSchema = z.object({
  state: signalStateSchema,
  cursor: z.number().int(),
  fill: paiseSchema.nullable(),
  exit: paiseSchema.nullable(),
  target1At: z.number().int().nullable(),
  endedAt: z.number().int().nullable(),
  resolution: z.enum(['OBSERVED', 'UNAVAILABLE']),
  reason: z.string(),
});
export type SignalProjection = z.infer<typeof projectionSchema>;
export const eventSchema = z.object({
  sequence: z.number().int(),
  state: signalStateSchema,
  effectiveAt: z.number().int(),
  recordedAt: z.number().int(),
  reason: z.string(),
  price: paiseSchema.nullable(),
  resolution: z.enum(['OBSERVED', 'UNAVAILABLE']),
});
export const signalDtoSchema = z.object({
  dataOrigin: z.enum(['MARKET', 'SIMULATED']).default('MARKET'),
  id: z.number().int().positive(),
  instrumentId: z.number().int(),
  symbol: z.string(),
  companyName: z.string(),
  sector: z.string().nullable(),
  strategyVersionId: z.number().int(),
  publishedAt: z.number().int(),
  expiresAt: z.number().int(),
  evidence: evidenceSchema,
  projection: projectionSchema,
  lastPrice: paiseSchema.nullable(),
  quoteAt: z.number().int().nullable(),
});
export type SignalDto = z.infer<typeof signalDtoSchema>;
export const scannerSchema = z.object({
  checkedAt: z.number().int(),
  phase: z.string(),
  requested: z.number().int(),
  evaluated: z.number().int(),
  published: z.number().int(),
  benchmarkReady: z.boolean(),
  benchmark: z
    .object({
      at: z.number().int(),
      close: paiseSchema,
      vwap: paiseSchema,
      ema9: paiseSchema,
      ema21: paiseSchema,
      adx: z.number(),
      direction: z.enum(['Bullish', 'Bearish', 'Mixed']),
      regime: z.enum(['Trending', 'Range / weak trend']),
    })
    .nullable()
    .optional(),
  reasons: z.record(z.number()),
  message: z.string(),
});
export type ScannerSnapshot = z.infer<typeof scannerSchema>;
export const signalQuerySchema = z
  .object({
    symbol: z.string().max(40).default(''),
    direction: z.enum(['BUY', 'SELL']).optional(),
    status: signalStateSchema.optional(),
    sector: z.string().max(80).optional(),
    watchlistId: z.coerce.number().int().positive().optional(),
    minimumScore: z.coerce.number().min(0).max(100).default(0),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(24),
    sortBy: z.enum(['publishedAt', 'score', 'symbol']).default('publishedAt'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'From must precede to.' });
export type SignalQuery = z.infer<typeof signalQuerySchema>;
export const signalListSchema = z.object({
  signals: z.array(signalDtoSchema),
  total: z.number().int(),
  scanner: scannerSchema.nullable(),
  asOf: z.number().int(),
  watchlists: z.array(z.object({ id: z.number().int(), name: z.string() })),
});
export type SignalList = z.infer<typeof signalListSchema>;
export const signalDetailSchema = z.object({
  signal: signalDtoSchema,
  events: z.array(eventSchema),
  bars: z.array(barSchema),
});
export type SignalDetail = z.infer<typeof signalDetailSchema>;
export const paperRequestSchema = z
  .object({
    signalId: z.number().int().positive(),
    capitalPaise: paiseSchema.max(1_000_000_000_000),
    riskBps: z.number().int().min(1).max(500),
    moveToBreakeven: z.boolean().default(false),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type PaperRequest = z.infer<typeof paperRequestSchema>;
export const paperSizingSchema = z.object({
  shares: z.number().int().nonnegative(),
  capitalRequired: z.number().int().safe().nonnegative(),
  maxLoss: z.number().int().safe().nonnegative(),
  charges: z.number().int().safe().nonnegative(),
  target1Net: z.number().int().safe(),
  target2Net: z.number().int().safe(),
});
export type PaperSizing = z.infer<typeof paperSizingSchema>;
export const paperDtoSchema = z.object({
  id: z.number().int(),
  signalId: z.number().int(),
  symbol: z.string(),
  createdAt: z.number().int(),
  sizing: paperSizingSchema,
  projection: projectionSchema,
  netPaise: z.number().int().safe().nullable(),
  initialRisk: z.number().int().positive(),
  markNetPaise: z.number().int().safe().nullable(),
});
export type PaperDto = z.infer<typeof paperDtoSchema>;
export const performanceSchema = z.object({
  sampleSize: z.number().int(),
  winners: z.number().int(),
  losers: z.number().int(),
  breakeven: z.number().int(),
  winRate: z.number().nullable(),
  averageWin: z.number().int().nullable(),
  averageLoss: z.number().int().nullable(),
  expectancyR: z.number().nullable(),
  profitFactor: z.number().nullable(),
  netPaise: z.number().int().safe(),
  maxDrawdownPaise: z.number().int().safe().nullable(),
  openMarksComplete: z.boolean(),
});
export const signalSummarySchema = z.object({
  asOf: z.number().int(),
  total: z.number().int(),
  active: z.number().int(),
  closed: z.number().int(),
  targetHits: z.number().int(),
  pending: z.number().int().default(0),
  triggered: z.number().int().default(0),
  stopHits: z.number().int().default(0),
  papers: z.array(paperDtoSchema),
  performance: performanceSchema,
});
export type SignalSummary = z.infer<typeof signalSummarySchema>;
