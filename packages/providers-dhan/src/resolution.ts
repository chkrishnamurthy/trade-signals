import type { DhanResolution } from '@equitywise/dhan';
import type { Resolution } from '@equitywise/market-data';

/**
 * Our timeframes to what is actually fetched from Dhan.
 *
 * Only two things are ever requested: 1-minute bars and daily bars. Every
 * other intraday resolution is derived from 1m on the 09:15 IST grid, and
 * weekly from daily — the same derivation rule the database applies (hard
 * rule 4: store 1m and 1d, derive the rest).
 *
 * Dhan does publish 5/15/25/60-minute endpoints, and they are deliberately
 * not used: verified 2026-09-17, they mishandle datetime ranges (a same-day
 * `09:14→15:30` window returns nothing; a `15 Sep→17 Sep` window returns only
 * the 15th) while the 1-minute endpoint honours them. Deriving from 1m costs a
 * larger response (375 bars a session instead of 25) and buys bars that agree
 * with the stored ones to the minute.
 */
export interface ResolutionPlan {
  readonly fetch: DhanResolution;
  /** Minutes per output bar for intraday; 0 for daily/weekly. */
  readonly minutes: number;
  readonly derived: 'none' | 'minutes-from-1m' | '1w-from-1d';
}

const INTRADAY_MINUTES: Readonly<Partial<Record<Resolution, number>>> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
};

export function planResolution(resolution: Resolution): ResolutionPlan {
  const minutes = INTRADAY_MINUTES[resolution];
  if (minutes === 1) return { fetch: '1', minutes: 1, derived: 'none' };
  if (minutes !== undefined) return { fetch: '1', minutes, derived: 'minutes-from-1m' };
  if (resolution === '1d') return { fetch: 'D', minutes: 0, derived: 'none' };
  return { fetch: 'D', minutes: 0, derived: '1w-from-1d' };
}

/** Resolutions this provider serves, natively or derived. */
export const SUPPORTED_RESOLUTIONS: readonly Resolution[] = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '1d',
  '1w',
];
