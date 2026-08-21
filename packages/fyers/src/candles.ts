import { istDateKey } from '@signal/shared';
import type { FyersHttpClient } from './http.js';
import { FYERS_DATA_BASE } from './http.js';
import { type Candle, historyResponseSchema, toCandle } from './types.js';

/**
 * Historical candles, with automatic chunking.
 *
 * Fyers caps the date range of a single /data/history call. The caller here
 * passes any range and gets the whole thing back, in order, deduplicated.
 */

/** Resolutions the history API accepts, as documented in the v3 spec. */
export type FyersResolution =
  | '5S'
  | '10S'
  | '15S'
  | '30S'
  | '45S'
  | '1'
  | '2'
  | '3'
  | '5'
  | '10'
  | '15'
  | '20'
  | '30'
  | '45'
  | '60'
  | '120'
  | '180'
  | '240'
  | 'D'
  | '1D'
  | '1W'
  | '1M';

/**
 * Maximum days of data per request, per the v3 spec's "Limits for History":
 *   - 100 days for minute resolutions (1..240)
 *   - 366 days for 1D / 1W / 1M
 *   - 30 trading days for seconds resolutions; we use 30 calendar days, which
 *     is strictly conservative.
 */
export const CHUNK_DAYS = {
  seconds: 30,
  minutes: 100,
  daily: 366,
} as const;

/** Earliest data Fyers serves. Documented as 3 July 2017. */
export const HISTORY_EPOCH_START = new Date('2017-07-03T00:00:00.000Z');

const SECONDS_RESOLUTIONS = new Set(['5S', '10S', '15S', '30S', '45S']);
const DAILY_RESOLUTIONS = new Set(['D', '1D', '1W', '1M']);

/** Days of history a single request may span, for a given resolution. */
export function chunkDaysFor(resolution: FyersResolution): number {
  if (SECONDS_RESOLUTIONS.has(resolution)) return CHUNK_DAYS.seconds;
  if (DAILY_RESOLUTIONS.has(resolution)) return CHUNK_DAYS.daily;
  return CHUNK_DAYS.minutes;
}

export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

const MS_PER_DAY = 86_400_000;

/**
 * Splits `[from, to]` into consecutive spans no longer than the resolution's
 * documented limit.
 *
 * Chunks are inclusive of both endpoints and never overlap: the next chunk
 * starts the day after the previous one ends, so a candle is never fetched
 * twice.
 */
export function chunkRange(range: DateRange, resolution: FyersResolution): DateRange[] {
  const { from, to } = range;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new RangeError('chunkRange: from and to must be valid Dates');
  }
  if (from.getTime() > to.getTime()) {
    throw new RangeError(
      `chunkRange: from (${from.toISOString()}) is after to (${to.toISOString()})`,
    );
  }

  const spanDays = chunkDaysFor(resolution);
  const chunks: DateRange[] = [];

  let cursor = from.getTime();
  const end = to.getTime();
  while (cursor <= end) {
    // spanDays - 1 because both endpoints are inclusive: a 100-day window
    // covering day 0 runs through day 99.
    const chunkEnd = Math.min(cursor + (spanDays - 1) * MS_PER_DAY, end);
    chunks.push({ from: new Date(cursor), to: new Date(chunkEnd) });
    cursor = chunkEnd + MS_PER_DAY;
  }

  return chunks;
}

export interface FetchCandlesOptions {
  /** `cont_flag=1` requests continuous data. See scripts/verify-adjustment.ts. */
  readonly contFlag?: 0 | 1;
  /** `oi_flag=1` adds open interest as a 7th candle element. */
  readonly oiFlag?: 0 | 1;
  /** Overrides the per-request day span. Only for testing the chunker. */
  readonly chunkDays?: number;
}

export interface CandleFetcher {
  readonly http: FyersHttpClient;
  /** `appId:accessToken`, the value of the Authorization header. */
  readonly authorization: string;
}

/**
 * Fetches every candle in `[from, to]`, chunking as needed.
 *
 * Results are concatenated in ascending timestamp order and deduplicated —
 * chunk boundaries are exclusive by construction, but the API has been seen to
 * echo a boundary candle in both neighbours.
 */
export async function fetchCandles(
  fetcher: CandleFetcher,
  fyersSymbol: string,
  resolution: FyersResolution,
  range: DateRange,
  options: FetchCandlesOptions = {},
): Promise<Candle[]> {
  const chunks = chunkRange(range, resolution);
  const byTimestamp = new Map<number, Candle>();

  for (const chunk of chunks) {
    const response = await fetcher.http.request(
      `${FYERS_DATA_BASE}/history`,
      historyResponseSchema,
      {
        method: 'GET',
        headers: { Authorization: fetcher.authorization },
        query: {
          // Raw, NOT pre-encoded: the URL layer percent-encodes query values
          // once. Encoding here too produced `NSE%253ARELIANCE-EQ`, which the
          // API rejects with -300 "Invalid symbol provided".
          symbol: fyersSymbol,
          resolution,
          date_format: 1,
          range_from: istDateKey(chunk.from),
          range_to: istDateKey(chunk.to),
          cont_flag: options.contFlag ?? 0,
          ...(options.oiFlag === undefined ? {} : { oi_flag: options.oiFlag }),
        },
      },
    );

    for (const raw of response.candles ?? []) {
      const candle = toCandle(raw);
      byTimestamp.set(candle.timestamp.getTime(), candle);
    }
  }

  return [...byTimestamp.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
