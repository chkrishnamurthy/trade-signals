/**
 * Alert rules on closed daily data.
 *
 * An alert states a technical condition was met. It never says what to do about
 * it. Rules are evaluated on a CLOSED session's numbers only (CLAUDE.md rule 2) —
 * never on a forming candle — so a rule that fired in live use fires identically
 * in a replay.
 *
 * Both rule kinds are crossings, not levels: "close crosses above ₹1,500" fires
 * on the session the close moved from at-or-below the level to above it, and not
 * again while it stays above. That is what stops a stock sitting over a level
 * from firing every night.
 */

export const ALERT_METRICS = ['close', 'rsi14'] as const;
export type AlertMetric = (typeof ALERT_METRICS)[number];

export const ALERT_COMPARATORS = ['crosses_above', 'crosses_below'] as const;
export type AlertComparator = (typeof ALERT_COMPARATORS)[number];

export interface AlertCondition {
  readonly metric: AlertMetric;
  readonly comparator: AlertComparator;
  /** Integer paise for `close`; 0–100 for `rsi14`. */
  readonly threshold: number;
}

/** One closed session's values. A null metric means it could not be computed. */
export interface AlertObservation {
  /** `YYYY-MM-DD`, the exchange's trading date. */
  readonly tradingDate: string;
  readonly closePaise: number | null;
  readonly rsi14: number | null;
}

export type AlertVerdict =
  | { readonly fired: true; readonly observed: number }
  | {
      readonly fired: false;
      readonly reason: 'no_data' | 'no_previous_session' | 'not_crossed';
    };

/** Why a condition is not acceptable, or null when it is. */
export function validateAlertCondition(condition: AlertCondition): string | null {
  if (!ALERT_METRICS.includes(condition.metric)) return 'Unknown metric.';
  if (!ALERT_COMPARATORS.includes(condition.comparator)) return 'Unknown comparator.';
  if (!Number.isFinite(condition.threshold)) return 'The level must be a number.';
  if (condition.metric === 'close') {
    if (!Number.isInteger(condition.threshold) || condition.threshold <= 0) {
      return 'A price level must be a positive whole number of paise.';
    }
  } else if (condition.threshold <= 0 || condition.threshold >= 100) {
    return 'An RSI level must be between 0 and 100.';
  }
  return null;
}

function metricValue(metric: AlertMetric, observation: AlertObservation): number | null {
  return metric === 'close' ? observation.closePaise : observation.rsi14;
}

/** Is the value on the far side of the level, in the rule's direction? */
function beyond(comparator: AlertComparator, value: number, threshold: number): boolean {
  return comparator === 'crosses_above' ? value > threshold : value < threshold;
}

/**
 * Did the session `current` cross the level, given the session before it?
 *
 * Needs both sessions. With no previous session there is nothing to cross from,
 * so the answer is "no" — a brand-new rule on a stock already past the level
 * waits for its next crossing rather than firing on creation.
 */
export function evaluateAlert(
  condition: AlertCondition,
  current: AlertObservation,
  previous: AlertObservation | null,
): AlertVerdict {
  const now = metricValue(condition.metric, current);
  if (now === null) return { fired: false, reason: 'no_data' };
  if (previous === null) return { fired: false, reason: 'no_previous_session' };
  const before = metricValue(condition.metric, previous);
  if (before === null) return { fired: false, reason: 'no_previous_session' };

  const nowBeyond = beyond(condition.comparator, now, condition.threshold);
  const beforeBeyond = beyond(condition.comparator, before, condition.threshold);
  return nowBeyond && !beforeBeyond
    ? { fired: true, observed: now }
    : { fired: false, reason: 'not_crossed' };
}
