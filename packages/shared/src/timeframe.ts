import { MARKET_OPEN_MINUTES } from './time.js';

/**
 * Candle timeframes, stored as SMALLINT.
 *
 * The numeric value IS the timeframe's length in minutes. That makes the column
 * self-describing, sorts correctly, and turns bucket arithmetic into plain
 * multiplication. Every value fits comfortably inside a signed SMALLINT
 * (max 32767).
 *
 * Only `M1` and `D1` are ever persisted (CLAUDE.md hard rule 4). The rest are
 * derived on read — intraday via `time_bucket` with its origin aligned to the
 * 09:15 IST open, weekly from daily.
 */
export enum Timeframe {
  M1 = 1,
  M5 = 5,
  M15 = 15,
  M30 = 30,
  H1 = 60,
  D1 = 1440,
  W1 = 10080,
}

/** Every timeframe, ascending by length. */
export const ALL_TIMEFRAMES: readonly Timeframe[] = [
  Timeframe.M1,
  Timeframe.M5,
  Timeframe.M15,
  Timeframe.M30,
  Timeframe.H1,
  Timeframe.D1,
  Timeframe.W1,
];

/** The two timeframes that exist as rows in `candles`. */
export const PERSISTED_TIMEFRAMES: readonly Timeframe[] = [Timeframe.M1, Timeframe.D1];

/** Human/API label, e.g. `Timeframe.M15` -> `"15m"`. */
export const TIMEFRAME_LABELS: Readonly<Record<Timeframe, string>> = {
  [Timeframe.M1]: '1m',
  [Timeframe.M5]: '5m',
  [Timeframe.M15]: '15m',
  [Timeframe.M30]: '30m',
  [Timeframe.H1]: '1h',
  [Timeframe.D1]: '1d',
  [Timeframe.W1]: '1w',
};

const LABEL_TO_TIMEFRAME = new Map<string, Timeframe>(
  ALL_TIMEFRAMES.map((timeframe) => [TIMEFRAME_LABELS[timeframe], timeframe]),
);

/** Narrows an arbitrary number — a SMALLINT off the wire — to a known timeframe. */
export function isTimeframe(value: number): value is Timeframe {
  return ALL_TIMEFRAMES.includes(value as Timeframe);
}

/** Parses a stored SMALLINT into a timeframe. */
export function timeframeFromCode(code: number): Timeframe {
  if (!isTimeframe(code)) {
    throw new RangeError(`timeframeFromCode: ${String(code)} is not a known timeframe`);
  }
  return code;
}

/** Parses a label such as `"15m"`. */
export function timeframeFromLabel(label: string): Timeframe {
  const timeframe = LABEL_TO_TIMEFRAME.get(label);
  if (timeframe === undefined) {
    throw new RangeError(`timeframeFromLabel: ${JSON.stringify(label)} is not a known timeframe`);
  }
  return timeframe;
}

/** Length of one candle, in minutes. */
export function timeframeMinutes(timeframe: Timeframe): number {
  return timeframe;
}

/** True for the timeframes stored as rows rather than derived on read. */
export function isPersistedTimeframe(timeframe: Timeframe): boolean {
  return timeframe === Timeframe.M1 || timeframe === Timeframe.D1;
}

/**
 * The persisted timeframe a derived one is built from.
 *
 * Intraday buckets come from 1m; weekly comes from daily. The two persisted
 * timeframes map to themselves.
 */
export function derivationSource(timeframe: Timeframe): Timeframe {
  return timeframe === Timeframe.W1 || timeframe === Timeframe.D1 ? Timeframe.D1 : Timeframe.M1;
}

/**
 * Minutes past IST midnight that intraday buckets are aligned to.
 *
 * 09:15, the continuous-session open — so a 15m candle covers 09:15-09:30, not
 * 09:00-09:15 (CLAUDE.md hard rule 4). This is the `origin` argument to
 * `time_bucket`, expressed in IST wall-clock minutes.
 */
export const BUCKET_ORIGIN_IST_MINUTES = MARKET_OPEN_MINUTES;
