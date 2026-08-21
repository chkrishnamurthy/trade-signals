/**
 * Core domain types.
 *
 * Everything here is pure data. No Date.now(), no I/O — see CLAUDE.md hard
 * rule 1. Prices are integer paise throughout (hard rule 3).
 */

/** One OHLCV bar. `timestamp` is the instant the candle OPENS. */
export interface Bar {
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/**
 * A series aligned to its input bars.
 *
 * `values[i]` corresponds to `bars[i]`. Leading entries are `null` where the
 * indicator has not yet warmed up — never 0, never a back-filled guess, because
 * a fabricated early value silently corrupts every downstream signal.
 */
export type Series = readonly (number | null)[];

/** The most recent non-null value of a series, or null if it never warmed up. */
export function latest(series: Series): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = series[i];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

/** The value `back` positions before the end, skipping nothing. */
export function at(series: Series, index: number): number | null {
  const value = series[index];
  return value === undefined ? null : value;
}
