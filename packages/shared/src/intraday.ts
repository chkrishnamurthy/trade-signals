import { z } from 'zod';

/**
 * Contracts for the single intraday strategy: Opening Range Breakout with VWAP
 * and volume confirmation (ORB-VC). Plan: docs/planning/intraday-strategy-dhan-plan.md.
 *
 * Vocabulary is deliberate (CLAUDE.md): BUY/SELL name a direction and nothing
 * else. Every price is a technical *level*; shares are simulated; a "trade" is
 * a paper record in our own database. Nothing here is shaped for an order.
 */
/** Money is integer paise (hard rule 3); a bar's timestamp is the instant it opens. */
export const paiseSchema = z.number().int().safe().positive();
export const barSchema = z.object({
  timestamp: z.number().int().safe(),
  open: paiseSchema,
  high: paiseSchema,
  low: paiseSchema,
  close: paiseSchema,
  volume: z.number().int().safe().nonnegative(),
});

export const ORB_STRATEGY_NAME = 'Opening Range Breakout with VWAP and volume confirmation';
export const ORB_STRATEGY_SHORT_NAME = 'ORB-VC';

export const intradayDirectionSchema = z.enum(['BUY', 'SELL']);
export type IntradayDirection = z.infer<typeof intradayDirectionSchema>;

/** What the page shows. `UNAVAILABLE` is a resolution, not a status (see projection). */
export const intradayStatusSchema = z.enum([
  'PENDING',
  'ACTIVE',
  'TARGET_1_HIT',
  'TARGET_2_HIT',
  'STOPPED_OUT',
  'CLOSED_EOD',
  'SKIPPED',
]);
export type IntradayStatus = z.infer<typeof intradayStatusSchema>;
export const terminalIntradayStatuses: readonly IntradayStatus[] = [
  'TARGET_2_HIT',
  'STOPPED_OUT',
  'CLOSED_EOD',
  'SKIPPED',
];

/**
 * Why a fired signal was not simulated as a trade. `ENTRY_SLIPPED` ends the
 * signal (status SKIPPED); the others keep tracking the signal's levels with
 * zero simulated shares so the page still shows what it did.
 */
export const intradaySkipReasonSchema = z.enum([
  'ENTRY_SLIPPED',
  'DAILY_LIMIT',
  'OPEN_LIMIT',
  'LOSS_HALT',
  'TOO_EXPENSIVE',
]);
export type IntradaySkipReason = z.infer<typeof intradaySkipReasonSchema>;

export const intradayExitReasonSchema = z.enum([
  'TARGET_1',
  'TARGET_2',
  'STOP',
  'BREAKEVEN_STOP',
  'EOD',
]);
export type IntradayExitReason = z.infer<typeof intradayExitReasonSchema>;

/** Every way the evaluator declines to publish. Persisted per stock per candle. */
export const intradayRejectReasonSchema = z.enum([
  'NO_BARS',
  'INCOHERENT_BARS',
  'WARMUP',
  'OUTSIDE_WINDOW',
  'LATE',
  'ALREADY_SIGNALLED',
  'HISTORY_INCOMPLETE',
  'PRICE_TOO_LOW',
  'ILLIQUID',
  'GAP',
  'INDEX_UNAVAILABLE',
  'INDEX_SHOCK',
  'OR_INCOMPLETE',
  'OR_RANGE',
  'VOLUME_UNAVAILABLE',
  'VOLUME',
  'BODY',
  'NO_BREAKOUT',
  'EXTENDED',
  'STOP_TOO_WIDE',
]);
export type IntradayRejectReason = z.infer<typeof intradayRejectReasonSchema>;

export const intradayLevelsSchema = z
  .object({
    /** The signal candle's close — every other level is measured from it. */
    ref: paiseSchema,
    stop: paiseSchema,
    target1: paiseSchema,
    target2: paiseSchema,
    /** |ref − stop|: the most the trade should lose per share. Plain words: "risk distance". */
    riskDistance: paiseSchema,
    tickSize: paiseSchema,
  })
  .strict();
export type IntradayLevels = z.infer<typeof intradayLevelsSchema>;

export function coherentIntradayLevels(
  direction: IntradayDirection,
  levels: IntradayLevels,
): boolean {
  const sign = direction === 'BUY' ? 1 : -1;
  const onTick = [levels.ref, levels.stop, levels.target1, levels.target2].every(
    (p) => p % levels.tickSize === 0,
  );
  return (
    onTick &&
    levels.riskDistance === sign * (levels.ref - levels.stop) &&
    sign * (levels.target1 - levels.ref) >= levels.riskDistance &&
    sign * (levels.target2 - levels.ref) >= 2 * levels.riskDistance &&
    // Favourable tick rounding may add at most one tick per target.
    sign * (levels.target1 - levels.ref) < levels.riskDistance + levels.tickSize &&
    sign * (levels.target2 - levels.ref) < 2 * levels.riskDistance + levels.tickSize
  );
}

export const intradayCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  required: z.string(),
  actual: z.string(),
});
export type IntradayCheck = z.infer<typeof intradayCheckSchema>;

export const openingRangeSchema = z.object({
  high: paiseSchema,
  low: paiseSchema,
  mid: paiseSchema,
  /** (high − low) / mid in basis points; a ratio, so a float is fine. */
  rangeBps: z.number().finite().nonnegative(),
  /** Instant the range is complete (09:30 IST), ms UTC. */
  completeAt: z.number().int(),
});
export type OpeningRange = z.infer<typeof openingRangeSchema>;

/** Frozen at publication. The page never recomputes any of it. */
export const intradayEvidenceSchema = z
  .object({
    strategyName: z.literal(ORB_STRATEGY_NAME),
    strategyRevision: z.number().int().positive(),
    direction: intradayDirectionSchema,
    sessionDate: z.string(),
    /** The signal candle (closed) and the instant it closed. */
    candle: barSchema,
    signalAt: z.number().int(),
    openingRange: openingRangeSchema,
    vwap: paiseSchema,
    relativeVolume: z.number().finite().positive(),
    bodyRatio: z.number().finite().min(0).max(1),
    extensionBps: z.number().finite().nonnegative(),
    levels: intradayLevelsSchema,
    checks: z.array(intradayCheckSchema).min(1),
  })
  .superRefine((e, ctx) => {
    if (!coherentIntradayLevels(e.direction, e.levels))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Incoherent or off-tick levels.' });
    if (e.checks.some((c) => !c.passed))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Published signals pass every check.' });
    if (e.candle.timestamp >= e.signalAt)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Signal must follow the candle.' });
  });
export type IntradayEvidence = z.infer<typeof intradayEvidenceSchema>;

export const intradayExitSchema = z.object({
  at: z.number().int(),
  price: paiseSchema,
  shares: z.number().int().nonnegative(),
  reason: intradayExitReasonSchema,
});
export type IntradayExit = z.infer<typeof intradayExitSchema>;

/**
 * Mutable current state of one published signal, rebuilt from append-only
 * events. `taken` says whether the shared paper book simulated shares for it.
 */
export const intradayProjectionSchema = z.object({
  status: intradayStatusSchema,
  /** Last observation instant applied; older observations are ignored. */
  cursor: z.number().int(),
  taken: z.boolean(),
  skipReason: intradaySkipReasonSchema.nullable(),
  shares: z.number().int().nonnegative(),
  remainingShares: z.number().int().nonnegative(),
  fill: paiseSchema.nullable(),
  fillAt: z.number().int().nullable(),
  /** The stop currently in force: the published stop, or the fill after Target 1. */
  effectiveStop: paiseSchema.nullable(),
  exits: z.array(intradayExitSchema),
  target1At: z.number().int().nullable(),
  endedAt: z.number().int().nullable(),
  resolution: z.enum(['OBSERVED', 'UNAVAILABLE']),
  reason: z.string(),
});
export type IntradayProjection = z.infer<typeof intradayProjectionSchema>;

export const intradayEventSchema = z.object({
  sequence: z.number().int(),
  status: intradayStatusSchema,
  effectiveAt: z.number().int(),
  recordedAt: z.number().int(),
  reason: z.string(),
  price: paiseSchema.nullable(),
  shares: z.number().int().nonnegative().nullable(),
  resolution: z.enum(['OBSERVED', 'UNAVAILABLE']),
});
export type IntradayEvent = z.infer<typeof intradayEventSchema>;

/** One row on the signals card; the same row is a trade when `projection.taken`. */
export const intradaySignalDtoSchema = z.object({
  dataOrigin: z.enum(['MARKET', 'SIMULATED']).default('MARKET'),
  id: z.number().int().positive(),
  instrumentId: z.number().int(),
  symbol: z.string(),
  companyName: z.string(),
  strategyVersionId: z.number().int(),
  publishedAt: z.number().int(),
  evidence: intradayEvidenceSchema,
  projection: intradayProjectionSchema,
  lastPrice: paiseSchema.nullable(),
  quoteAt: z.number().int().nullable(),
  /** Net simulated result of closed legs; null until the first exit. */
  realisedNetPaise: z.number().int().safe().nullable(),
  /** Realised plus the open remainder marked at `lastPrice`; null without a mark. */
  markNetPaise: z.number().int().safe().nullable(),
  /** The most this trade could lose at the published stop, for "× amount risked". */
  initialRiskPaise: z.number().int().safe().nonnegative().nullable(),
});
export type IntradaySignalDto = z.infer<typeof intradaySignalDtoSchema>;

export const intradayScannerSchema = z.object({
  checkedAt: z.number().int(),
  phase: z.string(),
  requested: z.number().int(),
  evaluated: z.number().int(),
  published: z.number().int(),
  reasons: z.record(z.number()),
  message: z.string(),
});
export type IntradayScannerSnapshot = z.infer<typeof intradayScannerSchema>;

export const intradayBookSchema = z.object({
  capitalPaise: paiseSchema,
  riskBps: z.number().int().positive(),
  tradesToday: z.number().int().nonnegative(),
  openTrades: z.number().int().nonnegative(),
  maxTradesPerDay: z.number().int().positive(),
  maxOpenTrades: z.number().int().positive(),
  realisedNetPaise: z.number().int().safe(),
  markNetPaise: z.number().int().safe().nullable(),
  lossHalted: z.boolean(),
});
export type IntradayBook = z.infer<typeof intradayBookSchema>;

/** Rendered from the same frozen config the engine runs; the rules card reads this. */
export const intradayRulesSchema = z.object({
  strategyName: z.string(),
  shortName: z.string(),
  revision: z.number().int(),
  timeframe: z.string(),
  universe: z.string(),
  parameters: z.record(z.union([z.number(), z.string(), z.boolean()])),
});
export type IntradayRules = z.infer<typeof intradayRulesSchema>;

export const intradayTodaySchema = z.object({
  serverNow: z.number().int(),
  sessionDate: z.string(),
  phase: z.enum(['PRE_OPEN', 'OPENING_RANGE', 'SESSION', 'AFTER_ENTRIES', 'CLOSED']),
  source: z.object({
    name: z.string(),
    mode: z.enum(['LIVE', 'STALE', 'CLOSED', 'UNAVAILABLE']),
    lastQuoteAt: z.number().int().nullable(),
  }),
  scanner: intradayScannerSchema.nullable(),
  rules: intradayRulesSchema,
  signals: z.array(intradaySignalDtoSchema),
  book: intradayBookSchema,
  /** Stocks with no signal today and the day-level reason. */
  exclusions: z.array(
    z.object({ symbol: z.string(), reason: z.string(), detail: z.string().nullable() }),
  ),
});
export type IntradayToday = z.infer<typeof intradayTodaySchema>;
