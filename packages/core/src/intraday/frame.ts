import { istDateKey } from '@equitywise/shared';
import {
  adx as computeAdx,
  atr as computeAtr,
  macd as computeMacd,
  roc as computeRoc,
  rsi as computeRsi,
  vwap as computeVwap,
  ema,
  vwapSlopePercent,
} from '../indicators/index.js';
import { type Bar, latest, type Series } from '../types.js';
import {
  bucketBars,
  countMissingMinutes,
  groupBySession,
  isCoherent,
  openingRange,
  sessionBars,
  stalenessMinutes,
} from './bars.js';
import type { IntradayConfig } from './config.js';
import { buildLevels } from './levels.js';
import { detectPatterns, type PatternMatch } from './patterns.js';
import { sessionRegime } from './session.js';
import {
  findSwings,
  gapPercent,
  type RangeRead,
  readRange,
  readStructure,
  type StructureRead,
} from './structure.js';
import { readTrend } from './trend.js';
import type {
  DataQuality,
  IntradaySnapshot,
  MarketContext,
  PriceLevel,
  SessionRegime,
  SymbolBars,
} from './types.js';
import { assessLiquidity, type LiquidityVerdict, readVolume, type VolumeRead } from './volume.js';

/**
 * One symbol, fully measured, at one instant.
 *
 * Every strategy reads this frame rather than recomputing indicators for
 * itself. That is not only cheaper — six strategies each running their own
 * EMA pass would be six chances for them to disagree about what the 20 EMA is,
 * and a signal whose reasons contradict each other is worse than no signal.
 *
 * Pure throughout: bars and an instant in, measurements out. No clock, no I/O
 * (CLAUDE.md hard rule 1).
 *
 * ## The evaluation cutoff
 *
 * Everything is truncated to the end of the last CLOSED trigger-timeframe bar,
 * not to the wall clock. Two consequences, both wanted:
 *
 *   - No forming bar can reach any indicator (hard rule 2).
 *   - The result depends only on the bars, never on when the poll happened.
 *     Evaluating at 09:33:40 and at 09:34:10 produces byte-identical output,
 *     which is what lets a backtest reproduce a live signal exactly.
 */

const MS_PER_MINUTE = 60_000;

export interface EvaluationFrame {
  readonly symbol: string;
  /** The instant evaluation was requested. */
  readonly at: Date;
  /** End of the last closed trigger bar. Nothing later was read. */
  readonly cutoff: number;
  readonly regime: SessionRegime;
  readonly config: IntradayConfig;

  /** Session 1m bars up to the cutoff. */
  readonly minuteBars: readonly Bar[];
  /**
   * Derived timeframes, warmed with prior sessions.
   *
   * These are what indicators read: a 15m EMA-20 that only ever sees today's
   * eleven bars is `null` until mid-afternoon, and a trend filter that is null
   * all morning is a trend filter that does not exist.
   */
  readonly triggerBars: readonly Bar[];
  readonly setupBars: readonly Bar[];
  readonly trendBars: readonly Bar[];
  /**
   * The same timeframes, restricted to today.
   *
   * Structure is what these are for. "The high of the last twenty bars" must
   * not reach into yesterday at 09:40 — an intraday breakout is a break of a
   * level formed today or of a named previous-session level, never of an
   * arbitrary bar from an unrelated session.
   */
  readonly sessionTriggerBars: readonly Bar[];
  readonly sessionSetupBars: readonly Bar[];

  readonly vwapSeries: Series;
  /** RSI on the trigger timeframe, kept for divergence detection. */
  readonly rsiSeries: Series;
  /** MACD histogram on the trigger timeframe, kept for expansion checks. */
  readonly macdHistogramSeries: Series;
  /**
   * ATR on the TRIGGER timeframe. Used for break buffers, level proximity and
   * pattern scale — the places where fine granularity is what is wanted.
   */
  readonly atrValue: number | null;
  /**
   * ATR on the TREND timeframe, for sizing stops and targets.
   *
   * Deliberately a different, wider measurement than `atrValue`, because the
   * two answer different questions. "Has price cleared this level decisively?"
   * is a 3-minute question. "How far might this move run, and is that far
   * enough to be worth the round trip?" is not.
   *
   * Measured on NIFTY 50 constituents, the median trigger-timeframe ATR is
   * 0.088% of price. Sizing a target at 1.6x that gives 0.140%, against a
   * round-trip cost of about 0.146% — the target was, at the median, smaller
   * than the cost of reaching it, so every such setup was a structural loser
   * however good the pattern behind it looked. The trend-timeframe ATR is
   * 0.246%, which puts the same multiple at 0.393%, or 2.7x costs.
   */
  readonly atrLevels: number | null;
  readonly snapshot: IntradaySnapshot;
  readonly patterns: readonly PatternMatch[];
  readonly structure: StructureRead;
  readonly range: RangeRead | null;
  readonly levels: readonly PriceLevel[];
  readonly volume: VolumeRead;
  readonly liquidity: LiquidityVerdict;
  readonly dataQuality: DataQuality;
  readonly context: MarketContext;
}

export interface FrameInput {
  readonly symbol: string;
  readonly bars: SymbolBars;
  readonly context: MarketContext;
  readonly at: Date;
}

/** A frame that could not be built, with the reason. */
export interface FrameFailure {
  readonly ok: false;
  readonly dataQuality: DataQuality;
  readonly regime: SessionRegime;
}

export type FrameResult = { readonly ok: true; readonly frame: EvaluationFrame } | FrameFailure;

export function buildFrame(input: FrameInput, config: IntradayConfig): FrameResult {
  const { symbol, bars, context, at } = input;
  const regime = sessionRegime(at, config);

  const issues: string[] = [];
  // Bars whose own minute has not finished by `at` are discarded before
  // anything looks at them. The provider is not trusted to have done this:
  // a single future bar reaching an indicator is lookahead bias, it does not
  // throw, and it makes every backtest built on this path look better than the
  // market ever was (hard rule 2).
  const allSessionMinutes = sessionBars(bars.minute, at).filter(
    (bar) => bar.timestamp + MS_PER_MINUTE <= at.getTime(),
  );
  const invalidBars = allSessionMinutes.filter((bar) => !isCoherent(bar)).length;
  if (invalidBars > 0) issues.push(`${invalidBars} bars have incoherent OHLC and were discarded`);
  const coherent = allSessionMinutes.filter(isCoherent);

  const triggerAll = bucketBars(coherent, config.timeframes.trigger, { now: at });
  const lastTrigger = triggerAll.at(-1);

  const fail = (extra: string[]): FrameFailure => ({
    ok: false,
    regime,
    dataQuality: {
      usable: false,
      barsAvailable: coherent.length,
      barsRequired: config.data.minSessionBars,
      stalenessMinutes: stalenessMinutes(coherent.at(-1), at),
      missingBars: countMissingMinutes(coherent),
      invalidBars,
      issues: [...issues, ...extra],
    },
  });

  if (lastTrigger === undefined) return fail(['No closed bars on the trigger timeframe yet']);
  if (coherent.length < config.data.minSessionBars) {
    return fail([`Only ${coherent.length} session bars; ${config.data.minSessionBars} required`]);
  }
  if (bars.daily.length < config.data.minDailyBars) {
    return fail([`Only ${bars.daily.length} prior sessions; ${config.data.minDailyBars} required`]);
  }

  // The cutoff: nothing at or after this instant is read by anything below.
  const cutoff = lastTrigger.timestamp + config.timeframes.trigger * MS_PER_MINUTE;
  const cutoffDate = new Date(cutoff);
  const minuteBars = coherent.filter((bar) => bar.timestamp < cutoff);

  // Prior sessions, prepended purely to warm the indicators. Bucketing is
  // anchored to each bar's OWN session open, so a bucket never spans the
  // overnight gap and no synthetic candle is invented across it.
  const sessionStart = minuteBars[0]?.timestamp ?? cutoff;
  const warmup = groupBySession(bars.history.filter(isCoherent))
    .slice(-config.warmupSessions)
    .flat()
    .filter((bar) => bar.timestamp < sessionStart);
  const warmMinute = [...warmup, ...minuteBars];

  const triggerBars = bucketBars(warmMinute, config.timeframes.trigger, { now: cutoffDate });
  const setupBars = bucketBars(warmMinute, config.timeframes.setup, { now: cutoffDate });
  const trendBars = bucketBars(warmMinute, config.timeframes.trend, { now: cutoffDate });

  const today = istDateKey(at);
  const isToday = (bar: Bar): boolean => istDateKey(new Date(bar.timestamp)) === today;
  const sessionTriggerBars = triggerBars.filter(isToday);
  const sessionSetupBars = setupBars.filter(isToday);

  const staleness = stalenessMinutes(minuteBars.at(-1), at);
  const missingBars = countMissingMinutes(minuteBars);
  if (staleness > config.data.maxStalenessMinutes) {
    issues.push(`Last bar is ${staleness.toFixed(0)} minutes old`);
  }
  // A tenth of the session absent is a feed problem, not thin trading.
  if (missingBars > Math.max(5, minuteBars.length * 0.1)) {
    issues.push(`${missingBars} one-minute bars missing from the session`);
  }

  // --- Indicators, all on the trigger timeframe unless noted ---------------
  const triggerCloses = triggerBars.map((bar) => bar.close);
  const vwapSeries = computeVwap(minuteBars);
  const vwapValue = latest(vwapSeries);
  const atrValue = latest(computeAtr(triggerBars, config.atrPeriod));
  const atrLevels = latest(computeAtr(trendBars, config.atrPeriod)) ?? atrValue;
  const price = lastTrigger.close;

  const macdResult = computeMacd(triggerCloses, config.macd);
  const adxResult = computeAdx(triggerBars, config.adxPeriod);
  const rsiSeries = computeRsi(triggerCloses, config.rsiPeriod);

  const previousDaily = bars.daily.at(-1) ?? null;
  const dayOpen = minuteBars[0]?.open ?? null;
  const dayHigh = minuteBars.length === 0 ? null : Math.max(...minuteBars.map((b) => b.high));
  const dayLow = minuteBars.length === 0 ? null : Math.min(...minuteBars.map((b) => b.low));
  const range15 = openingRange(minuteBars, config.openingRangeMinutes);

  // Structure is read from TODAY's bars only. A swing high from yesterday is
  // not intraday resistance; it is either a named previous-session level (which
  // `buildLevels` already carries) or noise.
  const swings = findSwings(sessionSetupBars, config.swingLookback);
  const structure = readStructure(sessionSetupBars, config.swingLookback);
  const rangeRead = readRange(sessionSetupBars, config.structureLookback, atrValue);
  const patterns = detectPatterns(triggerBars, atrValue);
  const volume = readVolume(minuteBars, bars.volumeProfile, lastTrigger, config.timeframes.trigger);
  const liquidity = assessLiquidity(bars.daily, price, volume.sessionTurnover, config);

  const levels = buildLevels({
    previousClose: previousDaily?.close ?? null,
    previousHigh: previousDaily?.high ?? null,
    previousLow: previousDaily?.low ?? null,
    dayOpen,
    dayHigh,
    dayLow,
    openingRangeHigh: range15?.high ?? null,
    openingRangeLow: range15?.low ?? null,
    vwap: vwapValue,
    swings,
    price,
  });

  const trends = [
    readTrend(trendBars, config.timeframes.trend, config),
    readTrend(setupBars, config.timeframes.setup, config),
    readTrend(triggerBars, config.timeframes.trigger, config),
  ];

  const previousClose = previousDaily?.close ?? null;
  const snapshot: IntradaySnapshot = {
    price,
    lastBarAt: lastTrigger.timestamp,
    lastBarHigh: lastTrigger.high,
    lastBarLow: lastTrigger.low,
    dayOpen,
    dayHigh,
    dayLow,
    previousClose,
    previousHigh: previousDaily?.high ?? null,
    previousLow: previousDaily?.low ?? null,
    openingRangeHigh: range15?.high ?? null,
    openingRangeLow: range15?.low ?? null,
    vwap: vwapValue,
    vwapSlopePercent: vwapSlopePercent(vwapSeries, config.timeframes.trigger * 3),
    vwapDistancePercent:
      vwapValue === null || vwapValue === 0 ? null : ((price - vwapValue) / vwapValue) * 100,
    ema9: latest(ema(triggerCloses, config.ema.fast)),
    ema20: latest(ema(triggerCloses, config.ema.medium)),
    ema50: latest(ema(triggerCloses, config.ema.slow)),
    rsi: latest(rsiSeries),
    macdHistogram: macdResult.histogram.at(-1) ?? null,
    adx: latest(adxResult.adx),
    plusDi: latest(adxResult.plusDi),
    minusDi: latest(adxResult.minusDi),
    atr: atrValue,
    atrPercent: atrValue === null || price === 0 ? null : (atrValue / price) * 100,
    rocFast: latest(computeRoc(triggerCloses, config.roc.fast)),
    rocSlow: latest(computeRoc(triggerCloses, config.roc.slow)),
    relativeVolume: volume.relativeVolume,
    barRelativeVolume: volume.barRelativeVolume,
    sessionVolume: volume.sessionVolume,
    gapPercent: gapPercent(dayOpen, previousClose),
    changePercent:
      previousClose === null || previousClose === 0
        ? null
        : ((price - previousClose) / previousClose) * 100,
    trends,
    levels,
  };

  const dataQuality: DataQuality = {
    usable: staleness <= config.data.maxStalenessMinutes && atrValue !== null,
    barsAvailable: minuteBars.length,
    barsRequired: config.data.minSessionBars,
    stalenessMinutes: staleness,
    missingBars,
    invalidBars,
    issues: atrValue === null ? [...issues, 'ATR has not warmed up'] : issues,
  };

  return {
    ok: true,
    frame: {
      symbol,
      at,
      cutoff,
      regime,
      config,
      minuteBars,
      triggerBars,
      setupBars,
      trendBars,
      sessionTriggerBars,
      sessionSetupBars,
      vwapSeries,
      rsiSeries,
      macdHistogramSeries: macdResult.histogram,
      atrValue,
      atrLevels,
      snapshot,
      patterns,
      structure,
      range: rangeRead,
      levels,
      volume,
      liquidity,
      dataQuality,
      context,
    },
  };
}
