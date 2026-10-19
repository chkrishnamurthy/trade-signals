/**
 * Daily Market Brief thresholds and weights.
 *
 * Versioned, reviewable constants — NOT an admin-editable database table
 * (CLAUDE.md: "config is versioned YAML / constants, not a DB-backed admin
 * panel"). Every classification boundary the brief uses is declared here so a
 * reviewer can see, in one place, exactly what turns a session "bullish". Changing a number here is a
 * code change with a diff and a test, which is the point.
 *
 * `BRIEF_CONFIG_VERSION` is bumped whenever a threshold changes, so a stored or
 * cached brief can be told apart from one produced under different rules.
 */

export const BRIEF_CONFIG_VERSION = 2;

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

  /** Bounds on list sizes so the page stays scannable. */
  readonly maxChanges: number;
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

  maxChanges: 24,
  maxWatchlistItems: 20,

  staleSessionTolerance: 1,
};
