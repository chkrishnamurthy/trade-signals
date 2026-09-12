/**
 * Daily Market Brief thresholds and weights.
 *
 * Versioned, reviewable constants — NOT an admin-editable database table
 * (CLAUDE.md: "config is versioned YAML / constants, not a DB-backed admin
 * panel"). Every classification boundary and attention weight the brief uses is
 * declared here so a reviewer can see, in one place, exactly what turns a
 * session "bullish" or a stock "high attention". Changing a number here is a
 * code change with a diff and a test, which is the point.
 *
 * `BRIEF_CONFIG_VERSION` is bumped whenever a threshold changes, so a stored or
 * cached brief can be told apart from one produced under different rules.
 */

export const BRIEF_CONFIG_VERSION = 1;

export interface MarketBriefThresholds {
  /**
   * Minimum fraction of the expected universe that must have data before the
   * session is classified at all. Below this the condition is
   * `insufficient_data` — the app must not print a market call on a handful of
   * names.
   */
  readonly coverageFloor: number;

  /** Minimum number of available breadth components to classify. */
  readonly minComponents: number;

  /** Score (−1…+1) at or above which the session leans bullish. */
  readonly bullishScore: number;
  /** Score at or below which the session leans bearish. */
  readonly bearishScore: number;
  /** |score| at or above which a leaning (not balanced) market is transitional. */
  readonly transitionalScore: number;
  /**
   * A component (−1…+1) counts as "clearly positive" / "clearly negative" for
   * transitional detection when it clears ±this.
   */
  readonly componentTilt: number;

  /** A move smaller than this in percent counts as "unchanged". */
  readonly unchangedBandPercent: number;

  /** Relative volume at or above which volume is "unusual". */
  readonly unusualVolume: number;
  /** Relative volume at or above which volume is "abnormal" (attention). */
  readonly abnormalVolume: number;

  /** A stored signal is treated as bullish at/above this direction rank. */
  readonly bullishStrength: number;
  /** A stored signal is treated as bearish at/below this direction rank. */
  readonly bearishStrength: number;

  /** Attention level cutoffs on the integer attention score. */
  readonly attentionHigh: number;
  readonly attentionMedium: number;

  /** Point contributions for each deterministic attention factor. */
  readonly attentionWeights: {
    readonly newSignal: number;
    readonly directionChanged: number;
    readonly breakoutOrBreakdown: number;
    readonly abnormalVolume: number;
    readonly maTransition: number;
    readonly momentumFlip: number;
    readonly alignedStrength: number;
    readonly inWatchlist: number;
  };

  /** Bounds on list sizes so the page stays scannable. */
  readonly maxChanges: number;
  readonly maxAttention: number;
  readonly maxSetupRows: number;
  readonly maxWatchlistItems: number;

  /**
   * How many completed sessions behind "now" the latest session may be before
   * the brief is flagged stale. 1 absorbs a single exchange holiday.
   */
  readonly staleSessionTolerance: number;
}

export const DEFAULT_BRIEF_THRESHOLDS: MarketBriefThresholds = {
  coverageFloor: 0.6,
  minComponents: 2,

  bullishScore: 0.3,
  bearishScore: -0.3,
  transitionalScore: 0.15,
  componentTilt: 0.1,

  unchangedBandPercent: 0.1,

  unusualVolume: 1.5,
  abnormalVolume: 2,

  // Signal strength is 0–100 with 50 neutral; ≥60 is bullish/strong_bullish
  // territory, ≤40 is bearish, from the engine's direction bands.
  bullishStrength: 60,
  bearishStrength: 40,

  attentionHigh: 6,
  attentionMedium: 3,

  attentionWeights: {
    newSignal: 2,
    directionChanged: 3,
    breakoutOrBreakdown: 3,
    abnormalVolume: 2,
    maTransition: 2,
    momentumFlip: 2,
    alignedStrength: 2,
    inWatchlist: 1,
  },

  maxChanges: 24,
  maxAttention: 10,
  maxSetupRows: 12,
  maxWatchlistItems: 20,

  staleSessionTolerance: 1,
};
