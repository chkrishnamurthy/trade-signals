import type { ScoreCategory, SessionRegime, SignalQuality } from './types.js';

/**
 * Intraday strategy configuration.
 *
 * Every threshold the engine consults lives here, in data, so that changing
 * one is a config edit rather than a code edit — and so that a change can be
 * versioned (CLAUDE.md hard rule 7) rather than silently altering the meaning
 * of signals already stored. `config/intraday.yaml` overlays these defaults.
 *
 * The weights below are the framework's starting point, not a validated
 * optimum. They were chosen so that no single category can carry a signal:
 * the largest is 20 of 100, and the surfacing floor is 60, so at least four
 * independent categories must contribute before anything reaches the screen.
 * Tuning them against real outcomes is what the stored signal history is for.
 */

export interface ScoreWeights extends Record<ScoreCategory, number> {
  readonly trend: number;
  readonly priceAction: number;
  readonly momentum: number;
  readonly volume: number;
  readonly vwap: number;
  readonly marketContext: number;
  readonly volatility: number;
  readonly multiTimeframe: number;
}

/** Per-regime adjustments. Multipliers on thresholds, not on scores. */
export interface RegimeProfile {
  /**
   * Scales the relative-volume requirement.
   *
   * The opening is loud by construction, so the bar for "unusual volume" has
   * to be higher there or every symbol qualifies at 09:20.
   */
  readonly volumeMultiplier: number;
  /** Adds to the minimum score before a signal is surfaced at all. */
  readonly scorePenalty: number;
  /** False stops the engine emitting anything new in this regime. */
  readonly allowNewSignals: boolean;
}

export interface IntradayConfig {
  /** Timeframes, in minutes. All derived from stored 1m bars (hard rule 4). */
  readonly timeframes: {
    /** Sets the bias. Nothing trades against it without a reversal setup. */
    readonly trend: number;
    /** Where the structure is read. */
    readonly setup: number;
    /** Where the trigger must close. */
    readonly trigger: number;
  };

  readonly ema: { readonly fast: number; readonly medium: number; readonly slow: number };
  readonly rsiPeriod: number;
  readonly macd: { readonly fast: number; readonly slow: number; readonly signal: number };
  readonly atrPeriod: number;
  readonly adxPeriod: number;
  readonly roc: { readonly fast: number; readonly slow: number };

  /** Minutes of the session that form the opening range. */
  /**
   * Prior sessions prepended to the bar series when warming indicators.
   *
   * Three covers a 15m EMA-50 (50 bars ≈ 750 minutes ≈ two sessions) with
   * slack for a holiday.
   */
  readonly warmupSessions: number;

  readonly openingRangeMinutes: number;
  /** Bars either side of a pivot for it to count as a swing point. */
  readonly swingLookback: number;
  /** Bars scanned for structure and range detection on the setup timeframe. */
  readonly structureLookback: number;

  readonly volume: {
    /** Cumulative relative volume above this counts as participation. */
    readonly participationThreshold: number;
    /** Bar relative volume above this counts as a spike. */
    readonly spikeThreshold: number;
    /** Below this, the move has no volume behind it and is discounted. */
    readonly dryThreshold: number;
    /**
     * Prior sessions averaged into the intraday volume profile.
     *
     * Five, not twenty: the profile is a shape, not a precise estimate, and
     * every extra session is 375 more one-minute rows per symbol to read on the
     * first cycle of the day — the cycle whose latency actually matters,
     * because it is the one deciding whether there are signals at 09:40.
     */
    readonly profileSessions: number;
  };

  readonly liquidity: {
    /** Minimum average daily volume, in shares, to be eligible at all. */
    readonly minAverageDailyVolume: number;
    /** Minimum price in paise. Sub-₹20 names behave differently. */
    readonly minPrice: number;
    /** Minimum turnover so far today, in paise. */
    readonly minSessionTurnover: number;
  };

  readonly volatility: {
    /** ATR% below this means the setup has no room to travel. */
    readonly minAtrPercent: number;
    /** ATR% above this means the move is disorderly. */
    readonly maxAtrPercent: number;
    /** ADX above this counts as a real trend. */
    readonly trendingAdx: number;
    /** ADX below this counts as chop. */
    readonly choppyAdx: number;
  };

  readonly levels: {
    /**
     * How far past a level price must close for the break to count, as a
     * fraction of ATR. A close one paise past a level is noise.
     */
    readonly breakBufferAtr: number;
    /** Within this fraction of ATR counts as "at" a level. */
    readonly proximityAtr: number;
  };

  readonly targets: {
    /** Invalidation distance from entry, in ATR multiples. */
    readonly stopAtr: number;
    readonly target1Atr: number;
    readonly target2Atr: number;
    /** Setups below this reward-to-risk are not surfaced. */
    readonly minRiskReward: number;
  };

  readonly rsi: {
    /** Healthy bullish range — momentum without exhaustion. */
    readonly bullBand: { readonly min: number; readonly max: number };
    readonly bearBand: { readonly min: number; readonly max: number };
    readonly overbought: number;
    readonly oversold: number;
  };

  readonly weights: ScoreWeights;

  /** Score bands. Values are the inclusive lower bound of each band. */
  readonly quality: Record<SignalQuality, number>;
  /** Nothing below this reaches the UI at all. */
  readonly minScore: number;

  readonly lifecycle: {
    /**
     * Evaluations a triggered signal must survive to become confirmed.
     *
     * One, by design: a trigger is a closed bar doing the thing, and a
     * confirmation is the NEXT closed bar not taking it back.
     */
    readonly confirmationBars: number;
    /** Minutes without a re-score before a live signal is treated as stale. */
    readonly staleAfterMinutes: number;
    /** Minutes a signal may sit in `watching`/`forming` before expiring. */
    readonly setupTimeoutMinutes: number;
    /**
     * Minutes before the same symbol + kind may produce a NEW signal after one
     * ends. Prevents the same failing setup re-firing every cycle.
     */
    readonly cooldownMinutes: number;
    /**
     * Score change needed before a live signal's score is re-recorded.
     *
     * Without a band, a score drifting by a point every cycle writes a
     * timeline entry every cycle and buries the events that matter.
     */
    readonly scoreChangeThreshold: number;
    /** Concurrent live signals allowed per symbol. */
    readonly maxLiveSignalsPerSymbol: number;
  };

  readonly data: {
    /** Minimum 1m bars in the session before anything is evaluated. */
    readonly minSessionBars: number;
    /** Minimum prior daily bars, for previous-day levels and liquidity. */
    readonly minDailyBars: number;
    /** Last closed bar older than this and the data is stale. */
    readonly maxStalenessMinutes: number;
  };

  readonly session: {
    /** Minutes after the open before the engine will emit anything. */
    readonly warmupMinutes: number;
    /**
     * Minutes before the close after which no NEW signal is emitted.
     *
     * An intraday setup needs room to work, and the position must be closed
     * before the session ends. A breakout at 15:20 has neither.
     */
    readonly noNewSignalsBeforeCloseMinutes: number;
    /** Minutes before the close at which live signals expire. */
    readonly forceExitBeforeCloseMinutes: number;
  };

  readonly regimes: Record<Exclude<SessionRegime, 'pre_open' | 'closed'>, RegimeProfile>;

  /**
   * Where one regime ends and the next begins, in minutes since the 09:15 open.
   *
   * Config rather than constants because the shape of the Indian session day
   * is an empirical claim, not a fact: if the mid-session lull turns out to
   * start at 11:00 rather than 11:30, that is a number to change, not code.
   */
  readonly regimeBoundaries: {
    /** Default 30 → the opening regime runs 09:15-09:45. */
    readonly openingEnds: number;
    /** Default 135 → early session runs to 11:30. */
    readonly earlyEnds: number;
    /** Default 255 → mid session runs to 13:30. */
    readonly midEnds: number;
    /** Default 345 → afternoon runs to 15:00, then closing. */
    readonly afternoonEnds: number;
  };
}

export const DEFAULT_INTRADAY_CONFIG: IntradayConfig = {
  timeframes: { trend: 15, setup: 5, trigger: 3 },

  ema: { fast: 9, medium: 20, slow: 50 },
  rsiPeriod: 14,
  macd: { fast: 12, slow: 26, signal: 9 },
  atrPeriod: 14,
  adxPeriod: 14,
  roc: { fast: 5, slow: 15 },

  warmupSessions: 3,
  openingRangeMinutes: 15,
  swingLookback: 3,
  structureLookback: 20,

  volume: {
    participationThreshold: 1.2,
    spikeThreshold: 1.8,
    dryThreshold: 0.7,
    profileSessions: 5,
  },

  liquidity: {
    minAverageDailyVolume: 200_000,
    minPrice: 2_000,
    minSessionTurnover: 5_000_000_000,
  },

  volatility: {
    minAtrPercent: 0.05,
    maxAtrPercent: 2.5,
    trendingAdx: 20,
    choppyAdx: 15,
  },

  levels: { breakBufferAtr: 0.15, proximityAtr: 0.35 },

  targets: { stopAtr: 1.2, target1Atr: 1.6, target2Atr: 2.8, minRiskReward: 1.2 },

  rsi: {
    bullBand: { min: 50, max: 78 },
    bearBand: { min: 22, max: 50 },
    overbought: 78,
    oversold: 22,
  },

  weights: {
    trend: 20,
    priceAction: 20,
    momentum: 15,
    volume: 15,
    vwap: 10,
    marketContext: 10,
    volatility: 5,
    multiTimeframe: 5,
  },

  quality: { exceptional: 90, strong: 80, good: 70, watch: 60 },
  minScore: 60,

  lifecycle: {
    confirmationBars: 1,
    staleAfterMinutes: 12,
    setupTimeoutMinutes: 45,
    cooldownMinutes: 30,
    scoreChangeThreshold: 4,
    maxLiveSignalsPerSymbol: 2,
  },

  data: { minSessionBars: 25, minDailyBars: 20, maxStalenessMinutes: 10 },

  session: {
    warmupMinutes: 20,
    noNewSignalsBeforeCloseMinutes: 35,
    forceExitBeforeCloseMinutes: 10,
  },

  regimes: {
    // Loud, wide, and mean-reverting. Demand more volume and a higher score.
    opening: { volumeMultiplier: 1.6, scorePenalty: 8, allowNewSignals: true },
    // Trends form here. This is the engine's best window.
    early: { volumeMultiplier: 1.0, scorePenalty: 0, allowNewSignals: true },
    // Volume dries up and ranges compress; breakouts fail more often.
    mid: { volumeMultiplier: 0.85, scorePenalty: 5, allowNewSignals: true },
    // Continuation and reversal both live here; normal thresholds.
    afternoon: { volumeMultiplier: 1.0, scorePenalty: 2, allowNewSignals: true },
    // Nothing new: an intraday setup needs time, and there is none left.
    closing: { volumeMultiplier: 1.3, scorePenalty: 15, allowNewSignals: false },
  },

  regimeBoundaries: { openingEnds: 30, earlyEnds: 135, midEnds: 255, afternoonEnds: 345 },
};

/** Maps a score to its band. Returns null below the surfacing floor. */
export function qualityFor(score: number, config: IntradayConfig): SignalQuality | null {
  const { quality } = config;
  if (score >= quality.exceptional) return 'exceptional';
  if (score >= quality.strong) return 'strong';
  if (score >= quality.good) return 'good';
  if (score >= quality.watch) return 'watch';
  return null;
}

/** Total of every category weight. 100 with the defaults, but never assumed. */
export function totalWeight(weights: ScoreWeights): number {
  return (
    weights.trend +
    weights.priceAction +
    weights.momentum +
    weights.volume +
    weights.vwap +
    weights.marketContext +
    weights.volatility +
    weights.multiTimeframe
  );
}
