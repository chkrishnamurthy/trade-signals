/**
 * Small derivations over quote fields, shared by the server analytics layer and
 * the client.
 *
 * Lives in `lib` rather than `server` because the drawer and the stocks table
 * need the same arithmetic the breadth counters use, and `server/analytics.ts`
 * is `server-only`. Two copies of "where in the day's range is this" is how the
 * drawer ended up with a version missing the thin-range guard.
 *
 * Pure. No I/O, no clock. Prices in, ratios out — nothing here formats.
 */

/**
 * Where in the day's range a price must sit to count as "near" an extreme.
 *
 * Expressed as a position in the range rather than a percentage of price. A
 * fixed 1%-of-price threshold double-counts every stock whose whole day range
 * is under 2% — on a quiet day that was most of the index, making "near high"
 * and "near low" both fire for the same stock.
 */
export const NEAR_HIGH_POSITION = 0.8;
export const NEAR_LOW_POSITION = 0.2;

/**
 * Minimum day range, as a fraction of price, for positioning to mean anything.
 * Below this the stock has effectively not moved and is neither near high nor low.
 */
export const MIN_MEANINGFUL_RANGE = 0.005;

/** Position of `ltp` within [low, high], 0–1. Null when the range is too thin. */
export function rangePosition(ltp: number, low: number | null, high: number | null): number | null {
  if (low === null || high === null || high <= low || high <= 0) return null;
  if ((high - low) / high < MIN_MEANINGFUL_RANGE) return null;
  return (ltp - low) / (high - low);
}

/**
 * Where `ltp` sits between the 52-week low and high, 0–1.
 *
 * A separate function from `rangePosition` despite the identical shape: the
 * thin-range guard is wrong here. A 52-week range narrower than 0.5% would be a
 * genuinely remarkable stock, not noise to be suppressed.
 */
export function yearRangePosition(
  ltp: number,
  low: number | null,
  high: number | null,
): number | null {
  if (low === null || high === null || high <= low) return null;
  return (ltp - low) / (high - low);
}
