import { rupeesToPaise } from '@signal/shared';
import { z } from 'zod';

/**
 * Fyers wire formats and the normalised shapes we expose.
 *
 * Nothing outside this package sees a raw Fyers field name. Everything crossing
 * the boundary is converted here: prices to integer paise, epochs to `Date`,
 * symbols to our internal form.
 */

// ---------------------------------------------------------------------------
// Normalised domain types
// ---------------------------------------------------------------------------

export type InstrumentKind = 'equity' | 'index';

/** A tradeable (or trackable) NSE instrument. */
export interface Instrument {
  /** Fyers' stable identifier. Survives symbol renames. */
  readonly fyToken: string;
  /** Our internal symbol: `RELIANCE`, `NIFTY50`. */
  readonly symbol: string;
  /** Fyers' symbol: `NSE:RELIANCE-EQ`, `NSE:NIFTY50-INDEX`. */
  readonly fyersSymbol: string;
  readonly name: string;
  readonly kind: InstrumentKind;
  readonly exchange: 'NSE';
  /** Null for indices, which have no ISIN. */
  readonly isin: string | null;
  readonly lotSize: number;
  /** Minimum price increment, in paise. */
  readonly tickSize: number;
  /** Exchange token. */
  readonly scripCode: number;
  /** `YYYY-MM-DD` as published in the symbol master. */
  readonly lastUpdated: string;
}

/**
 * One OHLCV candle.
 *
 * `timestamp` is the instant the candle OPENS. All prices are integer paise.
 */
export interface Candle {
  readonly timestamp: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  /** Shares traded. A count, not money — stays a plain integer. */
  readonly volume: number;
  /** Only present when requested with `oi_flag=1`. */
  readonly openInterest?: number;
}

/** A live price update from the data socket in lite mode. */
export interface Tick {
  readonly fyersSymbol: string;
  /** Internal symbol, or the Fyers symbol if it does not map. */
  readonly symbol: string;
  /** Last traded price, in paise. */
  readonly ltp: number;
  readonly lastTradedAt: Date | null;
  readonly exchangeFeedAt: Date | null;
  readonly volumeToday: number | null;
}

// ---------------------------------------------------------------------------
// Raw response schemas
// ---------------------------------------------------------------------------

/** Every Fyers REST response carries this envelope. */
export const fyersEnvelopeSchema = z.object({
  s: z.string(),
  code: z.number().optional(),
  message: z.string().optional(),
});

export type FyersEnvelope = z.infer<typeof fyersEnvelopeSchema>;

/**
 * A candle as it arrives: a positional array `[epoch, o, h, l, c, v]`, with an
 * optional 7th element for open interest.
 *
 * Parsed defensively — the API has been observed returning integers where the
 * docs promise floats, and `z.tuple` with a rest element tolerates the OI
 * variant without a second schema.
 */
export const rawCandleSchema = z
  .tuple([
    z.number().int().nonnegative(), // epoch seconds
    z.number(), // open
    z.number(), // high
    z.number(), // low
    z.number(), // close
    z.number(), // volume
  ])
  .rest(z.number());

export type RawCandle = z.infer<typeof rawCandleSchema>;

export const historyResponseSchema = fyersEnvelopeSchema.extend({
  candles: z.array(rawCandleSchema).nullable().optional(),
});

export type HistoryResponse = z.infer<typeof historyResponseSchema>;

export const validateAuthCodeResponseSchema = fyersEnvelopeSchema.extend({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
});

export const profileResponseSchema = fyersEnvelopeSchema.extend({
  data: z
    .object({
      fy_id: z.string().optional(),
      name: z.string().optional(),
      totp: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Lite-mode socket payload.
 *
 * Equity feeds (`type: "sf"`) carry `ltp`; index feeds (`type: "if"`) carry the
 * value in `iv` instead. Both are accepted here and reconciled in `toTick`.
 */
export const rawLiteTickSchema = z.object({
  symbol: z.string().min(1),
  type: z.string().optional(),
  ltp: z.number().optional(),
  iv: z.number().optional(),
  ltt: z.number().optional(),
  last_traded_time: z.number().optional(),
  tvalue: z.number().optional(),
  exch_feed_time: z.number().optional(),
  v: z.number().optional(),
  vol_traded_today: z.number().optional(),
});

export type RawLiteTick = z.infer<typeof rawLiteTickSchema>;

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/** Epoch seconds to a UTC `Date`, or null for the 0/absent sentinel. */
function epochToDate(seconds: number | undefined): Date | null {
  if (seconds === undefined || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

/**
 * Converts a positional raw candle into our normalised shape.
 *
 * Prices go straight to integer paise here — a rupee float never escapes this
 * function (CLAUDE.md hard rule 3).
 */
export function toCandle(raw: RawCandle): Candle {
  const [epoch, open, high, low, close, volume, openInterest] = raw;

  const timestamp = epochToDate(epoch);
  if (timestamp === null) {
    throw new RangeError(`toCandle: invalid epoch ${String(epoch)}`);
  }
  if (!Number.isFinite(volume) || volume < 0) {
    throw new RangeError(`toCandle: invalid volume ${String(volume)}`);
  }

  const candle: Candle = {
    timestamp,
    open: rupeesToPaise(open),
    high: rupeesToPaise(high),
    low: rupeesToPaise(low),
    close: rupeesToPaise(close),
    volume: Math.round(volume),
  };

  return openInterest === undefined
    ? candle
    : { ...candle, openInterest: Math.round(openInterest) };
}

/**
 * Converts a lite-mode socket payload into a `Tick`.
 *
 * Returns null when the payload carries no usable price — the socket also emits
 * subscription acknowledgements through the same channel.
 */
export function toTick(
  raw: RawLiteTick,
  resolveSymbol: (fyersSymbol: string) => string,
): Tick | null {
  const price = raw.ltp ?? raw.iv;
  if (price === undefined || !Number.isFinite(price)) return null;

  return {
    fyersSymbol: raw.symbol,
    symbol: resolveSymbol(raw.symbol),
    ltp: rupeesToPaise(price),
    lastTradedAt: epochToDate(raw.last_traded_time ?? raw.ltt),
    exchangeFeedAt: epochToDate(raw.exch_feed_time ?? raw.tvalue),
    volumeToday: raw.vol_traded_today ?? raw.v ?? null,
  };
}
