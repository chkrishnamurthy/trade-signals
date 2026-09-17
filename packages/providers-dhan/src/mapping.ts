import type {
  Candle as DhanCandle,
  Instrument as DhanInstrument,
  Quote as DhanQuote,
} from '@equitywise/dhan';
import type {
  Bar,
  Instrument,
  MarketPhase,
  MarketStatus,
  Quote,
  Resolution,
} from '@equitywise/market-data';
import {
  istDateKey,
  istMinutesOfDay,
  isWeekend,
  MARKET_CLOSE_MINUTES,
  MARKET_OPEN_MINUTES,
  minutesSinceOpen,
  PRE_OPEN_START_MINUTES,
} from '@equitywise/shared';

/**
 * Dhan shapes to product shapes.
 *
 * `@equitywise/dhan` has already Zod-parsed the wire format and converted every
 * price to integer paise. This layer strips what remains of the provider —
 * the `securityId`, the segment, Dhan's tickers — and settles two conventions
 * the product depends on that Dhan does not share: where a daily bar is
 * stamped, and which resolutions exist.
 */

const MS_PER_DAY = 86_400_000;

/**
 * The instant a daily bar is stamped at.
 *
 * Dhan stamps daily candles at IST midnight of the trading date (18:30 UTC
 * the day before). The product's daily candles — every row already in
 * `daily_candles`, all Fyers-sourced — are stamped at UTC midnight of the
 * trading date. The two must agree or the same session lands twice under
 * different keys, so Dhan's is moved onto the existing convention here.
 * Changing the convention itself is a migration, not an adapter's call.
 */
export function dailyBarTimestamp(candleAt: Date): number {
  const [y, m, d] = istDateKey(candleAt).split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function toBar(candle: DhanCandle, resolution: Resolution): Bar {
  return {
    timestamp:
      resolution === '1d' || resolution === '1w'
        ? dailyBarTimestamp(candle.timestamp)
        : candle.timestamp.getTime(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

export function toInstrument(instrument: DhanInstrument): Instrument {
  return {
    symbol: instrument.symbol,
    name: instrument.name,
    kind: instrument.kind,
    exchange: instrument.exchange,
    isin: instrument.isin,
    lotSize: instrument.lotSize,
    tickSize: instrument.tickSize,
    // Kept for rename-resilient ingestion; opaque above this line.
    providerRef: `${instrument.segment}:${instrument.securityId}`,
  };
}

export function toQuote(symbol: string, quote: DhanQuote): Quote {
  return {
    symbol,
    ltp: quote.ltp,
    change: quote.change,
    changePercent: quote.changePercent,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    previousClose: quote.previousClose,
    averagePrice: quote.averagePrice,
    bid: quote.bid,
    ask: quote.ask,
    volume: quote.volume,
    timestamp: quote.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Derived resolutions
// ---------------------------------------------------------------------------

function merge(group: readonly Bar[], timestamp: number): Bar {
  const first = group[0];
  const last = group[group.length - 1];
  if (first === undefined || last === undefined) {
    throw new RangeError('merge: empty group');
  }
  let high = first.high;
  let low = first.low;
  let volume = 0;
  for (const bar of group) {
    if (bar.high > high) high = bar.high;
    if (bar.low < low) low = bar.low;
    volume += bar.volume;
  }
  return { timestamp, open: first.open, high, low, close: last.close, volume };
}

/**
 * 1-minute bars into N-minute bars, aligned to the 09:15 IST session open.
 *
 * Buckets start at 09:15 and repeat every N minutes — the same origin the
 * database's `time_bucket` derivation uses (hard rule 4), so a chart drawn
 * from this and one drawn from stored 1m candles agree bar for bar. A bucket
 * is stamped at its own origin even when its first minute is missing, and a
 * partial bucket (the last one of a session Dhan cuts short at 15:14) is
 * still emitted: it is what the exchange printed, not a guess.
 */
export function aggregateMinutes(bars: readonly Bar[], minutes: number): Bar[] {
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new RangeError(`aggregateMinutes: minutes must be a positive integer, got ${minutes}`);
  }
  if (minutes === 1) return [...bars].sort((a, b) => a.timestamp - b.timestamp);

  const buckets = new Map<string, { origin: number; bars: Bar[] }>();
  for (const bar of bars) {
    const at = new Date(bar.timestamp);
    const slot = Math.floor(minutesSinceOpen(at) / minutes);
    const key = `${istDateKey(at)}#${slot}`;
    const bucket = buckets.get(key);
    if (bucket !== undefined) {
      bucket.bars.push(bar);
      continue;
    }
    const slotStart = MARKET_OPEN_MINUTES + slot * minutes;
    const origin = bar.timestamp - (istMinutesOfDay(at) - slotStart) * 60_000;
    buckets.set(key, { origin, bars: [bar] });
  }
  return [...buckets.values()]
    .map(({ origin, bars: group }) =>
      merge(
        [...group].sort((a, b) => a.timestamp - b.timestamp),
        origin,
      ),
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Daily bars into weekly bars: Monday-to-Friday in IST, stamped at the
 * week's first trading day (already on the daily convention, UTC midnight).
 */
export function aggregateWeekly(dailyBars: readonly Bar[]): Bar[] {
  const weeks = new Map<string, Bar[]>();
  for (const bar of dailyBars) {
    // Bars are at UTC midnight of the IST date; shift to Monday of that week.
    const at = new Date(bar.timestamp);
    const weekday = at.getUTCDay(); // 0 = Sunday
    const daysSinceMonday = (weekday + 6) % 7;
    const monday = new Date(bar.timestamp - daysSinceMonday * MS_PER_DAY);
    const key = monday.toISOString().slice(0, 10);
    const bucket = weeks.get(key) ?? [];
    bucket.push(bar);
    weeks.set(key, bucket);
  }
  return [...weeks.values()]
    .map((group) => {
      const first = group[0];
      if (first === undefined) throw new RangeError('aggregateWeekly: empty week');
      return merge(group, first.timestamp);
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// Market status — inferred, and declared as such
// ---------------------------------------------------------------------------

/**
 * Session phase from the clock and the standard NSE timetable.
 *
 * Dhan has no market-status endpoint, so this is the best the adapter can do
 * — and `capabilities.marketStatus` is `false` to say so. It knows nothing of
 * trading holidays, special sessions, or halts: on a holiday weekday it will
 * say `open` at 10:00. Anything that must know the truth routes the question
 * to a provider that has it (the router's job), or checks that recent bars
 * are actually arriving.
 */
export function inferMarketStatus(now: Date): MarketStatus {
  const phase = inferPhase(now);
  return { isOpen: phase === 'open', phase, checkedAt: now };
}

function inferPhase(now: Date): MarketPhase {
  if (isWeekend(now)) return 'closed';
  const minutes = istMinutesOfDay(now);
  if (minutes >= PRE_OPEN_START_MINUTES && minutes < MARKET_OPEN_MINUTES) return 'pre_open';
  if (minutes >= MARKET_OPEN_MINUTES && minutes < MARKET_CLOSE_MINUTES) return 'open';
  // The closing session (15:40–16:00) trades at the closing price only.
  if (minutes >= MARKET_CLOSE_MINUTES && minutes < 16 * 60) return 'post_close';
  return 'closed';
}
