import { istDateKey, istParts } from '@equitywise/shared';
import { authHeaders, DHAN_API_BASE, type DhanHttpClient, type DhanSession } from './http.js';
import { FUTURES_INSTRUMENT, instrumentTypeFor } from './symbols.js';
import {
  type Candle,
  chartsResponseSchema,
  type FuturesCandle,
  type FuturesContract,
  type InstrumentKind,
  type SecurityRef,
  toCandles,
  toFuturesCandles,
} from './types.js';

/**
 * Historical candles, with automatic chunking.
 *
 * Two endpoints: `/charts/historical` for daily bars and `/charts/intraday`
 * for minute bars. The caller passes any range and gets the whole thing back,
 * in order, deduplicated.
 */

/** Intraday intervals the v2 API serves, in minutes, plus `D` for daily. */
export type DhanResolution = '1' | '5' | '15' | '25' | '60' | 'D';

export const INTRADAY_RESOLUTIONS: readonly DhanResolution[] = ['1', '5', '15', '25', '60'];

/**
 * Days of data one request may span.
 *
 *   - Intraday: "only 90 days of data can be polled at once" (v2 docs).
 *   - Daily: no documented window. Bounded here anyway so a "since inception"
 *     backfill is a handful of predictable responses rather than one 25-year
 *     body, and so a limit introduced upstream later cannot break the caller.
 */
export const CHUNK_DAYS = {
  intraday: 90,
  daily: 366,
} as const;

/**
 * Earliest data Dhan serves.
 *
 * Daily: "from the stock's inception". Intraday: "last 5 years" — a rolling
 * horizon, so it is a function of the clock rather than a constant.
 */
export const DAILY_HISTORY_START = new Date('1990-01-01T00:00:00.000Z');
export const INTRADAY_HISTORY_YEARS = 5;

/** The earliest instant intraday bars can exist for, as of `now`. */
export function intradayHistoryStart(now: Date): Date {
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - INTRADAY_HISTORY_YEARS);
  return start;
}

export function chunkDaysFor(resolution: DhanResolution): number {
  return resolution === 'D' ? CHUNK_DAYS.daily : CHUNK_DAYS.intraday;
}

export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

const MS_PER_DAY = 86_400_000;

/**
 * Splits `[from, to]` into consecutive spans no longer than the resolution's
 * documented limit. Both endpoints inclusive; chunks never overlap.
 */
export function chunkRange(range: DateRange, resolution: DhanResolution): DateRange[] {
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
    const chunkEnd = Math.min(cursor + (spanDays - 1) * MS_PER_DAY, end);
    chunks.push({ from: new Date(cursor), to: new Date(chunkEnd) });
    cursor = chunkEnd + MS_PER_DAY;
  }
  return chunks;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD HH:MM:SS` in IST — the intraday endpoint's datetime format. */
export function istDateTimeKey(date: Date): string {
  const p = istParts(date);
  return `${istDateKey(date)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/**
 * Request dates for one chunk, in Dhan's formats.
 *
 * Our ranges are inclusive at both ends. Dhan's are not, and the intraday
 * endpoint reads its two dates differently (all verified live, 2026-09-16/17):
 *
 *   - daily:    `fromDate` inclusive, `toDate` exclusive, both `YYYY-MM-DD`.
 *   - intraday: `fromDate` may carry a time and is exclusive at that instant
 *               (`09:15:00` returns 09:16 first; `09:14:00` returns 09:15).
 *               `toDate` is read at DATE granularity and is exclusive — a
 *               same-day `… 15:30:00` returns nothing for a past day, and so
 *               does `next-day 00:00:00`; only a bare next-day date works.
 *               (A datetime `toDate` only ever worked for the current day,
 *               which is the "designed for today's chart" path Dhan's own
 *               staff describe.)
 *
 * So the start is pushed a minute early, the end is the bare date after the
 * range, and the caller clips the result back to what it asked for.
 */
export function requestDates(
  chunk: DateRange,
  resolution: DhanResolution,
): { fromDate: string; toDate: string } {
  const dayAfterEnd = istDateKey(new Date(chunk.to.getTime() + MS_PER_DAY));
  if (resolution === 'D') {
    return { fromDate: istDateKey(chunk.from), toDate: dayAfterEnd };
  }
  return {
    fromDate: istDateTimeKey(new Date(chunk.from.getTime() - 60_000)),
    toDate: dayAfterEnd,
  };
}

export interface CandleFetcher {
  readonly http: DhanHttpClient;
  readonly session: DhanSession;
}

/**
 * Fetches every candle in `[from, to]` for one instrument, chunking as needed.
 *
 * Results are concatenated in ascending timestamp order and deduplicated —
 * chunk boundaries are exclusive by construction, but a boundary candle
 * echoed in both neighbours must not become two bars.
 *
 * Timestamps are whatever Dhan's epoch says: bar-open for intraday (09:15 IST
 * first), IST midnight of the trading date for daily. Mapping the latter onto
 * the product's daily-bar convention is the adapter's job.
 */
export async function fetchCandles(
  fetcher: CandleFetcher,
  ref: SecurityRef,
  kind: InstrumentKind,
  resolution: DhanResolution,
  range: DateRange,
): Promise<Candle[]> {
  const chunks = chunkRange(range, resolution);
  const byTimestamp = new Map<number, Candle>();
  const endpoint = resolution === 'D' ? 'historical' : 'intraday';

  for (const chunk of chunks) {
    const dates = requestDates(chunk, resolution);
    const response = await fetcher.http.request(
      `${DHAN_API_BASE}/charts/${endpoint}`,
      chartsResponseSchema,
      {
        method: 'POST',
        headers: authHeaders(fetcher.session),
        body: {
          securityId: ref.securityId,
          exchangeSegment: ref.segment,
          instrument: instrumentTypeFor(kind),
          ...(resolution === 'D' ? { expiryCode: 0 } : { interval: resolution }),
          oi: false,
          ...dates,
        },
      },
    );

    for (const candle of toCandles(response)) {
      // Clip to the inclusive range asked for: the request over-reaches by a
      // unit at each exclusive end (see `requestDates`) and must not leak it.
      const at = candle.timestamp.getTime();
      if (at < range.from.getTime() || at > range.to.getTime()) continue;
      byTimestamp.set(at, candle);
    }
  }

  return [...byTimestamp.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * Daily bars WITH open interest for one stock-futures contract.
 *
 * Same endpoint and chunking as the daily branch of {@link fetchCandles},
 * with `oi: true` and the `FUTSTK` instrument type. `expiryCode` is 0 because
 * the contract is already named by its own security id; the code is only
 * meaningful when a request names an underlying instead.
 */
export async function fetchFuturesCandles(
  fetcher: CandleFetcher,
  contract: FuturesContract,
  range: DateRange,
): Promise<FuturesCandle[]> {
  const byTimestamp = new Map<number, FuturesCandle>();

  for (const chunk of chunkRange(range, 'D')) {
    const response = await fetcher.http.request(
      `${DHAN_API_BASE}/charts/historical`,
      chartsResponseSchema,
      {
        method: 'POST',
        headers: authHeaders(fetcher.session),
        body: {
          securityId: contract.securityId,
          exchangeSegment: contract.segment,
          instrument: FUTURES_INSTRUMENT,
          expiryCode: 0,
          oi: true,
          ...requestDates(chunk, 'D'),
        },
      },
    );

    for (const candle of toFuturesCandles(response)) {
      const at = candle.timestamp.getTime();
      if (at < range.from.getTime() || at > range.to.getTime()) continue;
      byTimestamp.set(at, candle);
    }
  }

  return [...byTimestamp.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
