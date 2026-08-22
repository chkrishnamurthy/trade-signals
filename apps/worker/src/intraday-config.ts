import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEFAULT_INTRADAY_CONFIG, type IntradayConfig } from '@signal/core';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * Intraday strategy configuration, read from `config/intraday.yaml`.
 *
 * The file overlays the defaults in `packages/core` rather than replacing
 * them, so a partial file is valid and a new tunable added to the engine does
 * not require every deployment's YAML to be edited before the worker will
 * start.
 *
 * Validated with Zod at the boundary: a typo in a threshold must fail loudly
 * at startup, not silently become `undefined` and let a filter pass everything.
 */

const positive = z.number().positive();

const regimeProfileSchema = z.object({
  volumeMultiplier: positive,
  scorePenalty: z.number().min(0).max(100),
  allowNewSignals: z.boolean(),
});

const fileSchema = z.object({
  universe: z
    .object({
      index: z.string().min(1).optional(),
      benchmark: z.string().min(1).optional(),
      bankingIndex: z.string().min(1).optional(),
      volatilityIndex: z.string().min(1).optional(),
    })
    .optional(),
  engine: z
    .object({
      timeframes: z
        .object({ trend: z.number().int(), setup: z.number().int(), trigger: z.number().int() })
        .optional(),
      ema: z
        .object({ fast: z.number().int(), medium: z.number().int(), slow: z.number().int() })
        .optional(),
      rsiPeriod: z.number().int().optional(),
      macd: z
        .object({ fast: z.number().int(), slow: z.number().int(), signal: z.number().int() })
        .optional(),
      atrPeriod: z.number().int().optional(),
      adxPeriod: z.number().int().optional(),
      roc: z.object({ fast: z.number().int(), slow: z.number().int() }).optional(),
      warmupSessions: z.number().int().positive().optional(),
      openingRangeMinutes: z.number().int().optional(),
      swingLookback: z.number().int().optional(),
      structureLookback: z.number().int().optional(),
    })
    .optional(),
  volume: z
    .object({
      participationThreshold: positive,
      spikeThreshold: positive,
      dryThreshold: positive,
      profileSessions: z.number().int().positive(),
    })
    .partial()
    .optional(),
  liquidity: z
    .object({
      minAverageDailyVolume: z.number().nonnegative(),
      minPrice: z.number().nonnegative(),
      minSessionTurnover: z.number().nonnegative(),
    })
    .partial()
    .optional(),
  volatility: z
    .object({
      minAtrPercent: z.number().nonnegative(),
      maxAtrPercent: positive,
      trendingAdx: z.number().nonnegative(),
      choppyAdx: z.number().nonnegative(),
    })
    .partial()
    .optional(),
  levels: z
    .object({ breakBufferAtr: z.number().nonnegative(), proximityAtr: z.number().nonnegative() })
    .partial()
    .optional(),
  targets: z
    .object({
      stopAtr: positive,
      target1Atr: positive,
      target2Atr: positive,
      minRiskReward: z.number().nonnegative(),
    })
    .partial()
    .optional(),
  rsi: z
    .object({
      bullBand: z.object({ min: z.number(), max: z.number() }),
      bearBand: z.object({ min: z.number(), max: z.number() }),
      overbought: z.number(),
      oversold: z.number(),
    })
    .partial()
    .optional(),
  weights: z
    .object({
      trend: z.number().nonnegative(),
      priceAction: z.number().nonnegative(),
      momentum: z.number().nonnegative(),
      volume: z.number().nonnegative(),
      vwap: z.number().nonnegative(),
      marketContext: z.number().nonnegative(),
      volatility: z.number().nonnegative(),
      multiTimeframe: z.number().nonnegative(),
    })
    .partial()
    .optional(),
  quality: z
    .object({
      exceptional: z.number(),
      strong: z.number(),
      good: z.number(),
      watch: z.number(),
    })
    .partial()
    .optional(),
  minScore: z.number().min(0).max(100).optional(),
  lifecycle: z
    .object({
      confirmationBars: z.number().int().nonnegative(),
      staleAfterMinutes: positive,
      setupTimeoutMinutes: positive,
      cooldownMinutes: z.number().nonnegative(),
      scoreChangeThreshold: z.number().nonnegative(),
      maxLiveSignalsPerSymbol: z.number().int().positive(),
    })
    .partial()
    .optional(),
  data: z
    .object({
      minSessionBars: z.number().int().positive(),
      minDailyBars: z.number().int().nonnegative(),
      maxStalenessMinutes: positive,
    })
    .partial()
    .optional(),
  session: z
    .object({
      warmupMinutes: z.number().nonnegative(),
      noNewSignalsBeforeCloseMinutes: z.number().nonnegative(),
      forceExitBeforeCloseMinutes: z.number().nonnegative(),
    })
    .partial()
    .optional(),
  regimeBoundaries: z
    .object({
      openingEnds: z.number().int(),
      earlyEnds: z.number().int(),
      midEnds: z.number().int(),
      afternoonEnds: z.number().int(),
    })
    .partial()
    .optional(),
  regimes: z
    .object({
      opening: regimeProfileSchema,
      early: regimeProfileSchema,
      mid: regimeProfileSchema,
      afternoon: regimeProfileSchema,
      closing: regimeProfileSchema,
    })
    .partial()
    .optional(),
  cycleMinutes: z.number().int().positive().optional(),
});

export interface IntradaySettings {
  readonly config: IntradayConfig;
  readonly universe: {
    readonly index: string;
    readonly benchmark: string;
    readonly bankingIndex: string | null;
    readonly volatilityIndex: string | null;
  };
  readonly cycleMinutes: number;
}

/**
 * Resolved from this module, not from `process.cwd()`.
 *
 * pnpm starts the worker in `apps/worker`; the verification script starts it
 * from the repo root. A cwd-relative path resolves outside the repo in one of
 * those two cases and then silently falls back to the built-in defaults.
 */
const CONFIG_PATH = fileURLToPath(new URL('../../../config/intraday.yaml', import.meta.url));

let cached: IntradaySettings | null = null;

export async function loadIntradaySettings(path = CONFIG_PATH): Promise<IntradaySettings> {
  if (cached !== null) return cached;

  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    // A missing file is a valid state: the engine's own defaults are complete
    // and documented, and refusing to start would be worse than running them.
    cached = {
      config: DEFAULT_INTRADAY_CONFIG,
      universe: {
        index: 'nifty50',
        benchmark: 'NIFTY50',
        bankingIndex: 'NIFTYBANK',
        volatilityIndex: 'INDIAVIX',
      },
      cycleMinutes: 3,
    };
    return cached;
  }

  const parsed = fileSchema.safeParse(parse(raw));
  if (!parsed.success) {
    throw new Error(
      `config/intraday.yaml is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  const file = parsed.data;
  const base = DEFAULT_INTRADAY_CONFIG;
  const engine = file.engine ?? {};

  const config: IntradayConfig = {
    timeframes: engine.timeframes ?? base.timeframes,
    ema: engine.ema ?? base.ema,
    rsiPeriod: engine.rsiPeriod ?? base.rsiPeriod,
    macd: engine.macd ?? base.macd,
    atrPeriod: engine.atrPeriod ?? base.atrPeriod,
    adxPeriod: engine.adxPeriod ?? base.adxPeriod,
    roc: engine.roc ?? base.roc,
    warmupSessions: engine.warmupSessions ?? base.warmupSessions,
    openingRangeMinutes: engine.openingRangeMinutes ?? base.openingRangeMinutes,
    swingLookback: engine.swingLookback ?? base.swingLookback,
    structureLookback: engine.structureLookback ?? base.structureLookback,
    volume: merge(base.volume, file.volume),
    liquidity: merge(base.liquidity, file.liquidity),
    volatility: merge(base.volatility, file.volatility),
    levels: merge(base.levels, file.levels),
    targets: merge(base.targets, file.targets),
    rsi: merge(base.rsi, file.rsi),
    weights: merge(base.weights, file.weights),
    quality: merge(base.quality, file.quality),
    minScore: file.minScore ?? base.minScore,
    lifecycle: merge(base.lifecycle, file.lifecycle),
    data: merge(base.data, file.data),
    session: merge(base.session, file.session),
    regimes: merge(base.regimes, file.regimes),
    regimeBoundaries: merge(base.regimeBoundaries, file.regimeBoundaries),
  };

  assertCoherent(config);

  cached = {
    config,
    universe: {
      index: file.universe?.index ?? 'nifty50',
      benchmark: file.universe?.benchmark ?? 'NIFTY50',
      bankingIndex: file.universe?.bankingIndex ?? null,
      volatilityIndex: file.universe?.volatilityIndex ?? null,
    },
    cycleMinutes: file.cycleMinutes ?? 3,
  };
  return cached;
}

/**
 * Overlays only the keys the file actually set.
 *
 * A plain spread would not do: Zod's `.partial()` produces objects whose keys
 * exist with the value `undefined`, and under `exactOptionalPropertyTypes` that
 * would overwrite a perfectly good default with nothing.
 */
function merge<T extends object>(base: T, override: object | undefined): T {
  if (override === undefined) return base;
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) result[key] = value;
  }
  return result as T;
}

/**
 * Cross-field checks Zod cannot express.
 *
 * Each of these would otherwise produce a silently useless engine rather than
 * an error: a trigger timeframe longer than the trend timeframe inverts the
 * whole hierarchy, and a target inside the stop makes every reward-to-risk
 * figure meaningless while the filter happily passes them.
 */
function assertCoherent(config: IntradayConfig): void {
  const problems: string[] = [];
  const { trend, setup, trigger } = config.timeframes;

  if (!(trigger <= setup && setup <= trend)) {
    problems.push(
      `timeframes must widen: trigger (${trigger}) ≤ setup (${setup}) ≤ trend (${trend})`,
    );
  }
  if (config.ema.fast >= config.ema.medium || config.ema.medium >= config.ema.slow) {
    problems.push('ema periods must increase: fast < medium < slow');
  }
  if (config.macd.fast >= config.macd.slow) {
    problems.push('macd.fast must be shorter than macd.slow');
  }
  if (config.roc.fast >= config.roc.slow) {
    problems.push('roc.fast must be shorter than roc.slow');
  }
  if (config.targets.target1Atr <= config.targets.stopAtr * 0.5) {
    problems.push('targets.target1Atr is too close to the stop to express any reward');
  }
  if (config.targets.target2Atr <= config.targets.target1Atr) {
    problems.push('targets.target2Atr must be beyond target1Atr');
  }
  if (config.volatility.choppyAdx >= config.volatility.trendingAdx) {
    problems.push('volatility.choppyAdx must be below trendingAdx');
  }
  const { exceptional, strong, good, watch } = config.quality;
  if (!(exceptional > strong && strong > good && good > watch)) {
    problems.push('quality bands must decrease: exceptional > strong > good > watch');
  }
  if (config.minScore < watch) {
    problems.push('minScore must be at least the `watch` band, or nothing filters');
  }
  const { openingEnds, earlyEnds, midEnds, afternoonEnds } = config.regimeBoundaries;
  if (!(openingEnds < earlyEnds && earlyEnds < midEnds && midEnds < afternoonEnds)) {
    problems.push('regimeBoundaries must increase through the session');
  }

  if (problems.length > 0) {
    throw new Error(`config/intraday.yaml is incoherent: ${problems.join('; ')}`);
  }
}

/** Test seam. Clears the module cache so a second file can be loaded. */
export function resetIntradaySettings(): void {
  cached = null;
}
