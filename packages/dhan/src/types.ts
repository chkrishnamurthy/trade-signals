import { rupeesToPaise } from '@equitywise/shared';
import { z } from 'zod';

/**
 * Raw Dhan shapes and their Zod schemas.
 *
 * Every response crosses one of these schemas before anything downstream sees
 * it (CLAUDE.md: Zod at every boundary). A shape change upstream fails loudly
 * here, not three layers up as an unexplained `undefined`.
 */

export type InstrumentKind = 'equity' | 'index';

/**
 * The three exchange segments this product speaks.
 *
 * Dhan addresses everything by `(exchangeSegment, securityId)`; there is no
 * ticker-string form. NSE equities live in `NSE_EQ`; every index — NSE or
 * BSE — lives in the pseudo-segment `IDX_I`; NSE stock futures (the one
 * derivative the product reads, for open interest) live in `NSE_FNO`.
 */
export type ExchangeSegment = 'NSE_EQ' | 'IDX_I' | 'NSE_FNO';

export const EXCHANGE_SEGMENTS: readonly ExchangeSegment[] = ['NSE_EQ', 'IDX_I', 'NSE_FNO'];

/** Dhan's `instrument` enum, restricted to what the product uses. */
export type InstrumentType = 'EQUITY' | 'INDEX' | 'FUTSTK';

/** How a request names one instrument. */
export interface SecurityRef {
  readonly segment: ExchangeSegment;
  /** Dhan's numeric id, carried as a string because the API takes it as one. */
  readonly securityId: string;
}

/** `NSE_EQ:2885` — the key both quotes and instruments are indexed by. */
export function securityKey(ref: SecurityRef): string {
  return `${ref.segment}:${ref.securityId}`;
}

/** An instrument from the scrip master. Prices in paise. */
export interface Instrument {
  /** Dhan's stable identifier. */
  readonly securityId: string;
  readonly segment: ExchangeSegment;
  /** Our internal symbol: `RELIANCE`, `NIFTY50`. */
  readonly symbol: string;
  /** Dhan's ticker as published: `RELIANCE`, `NIFTY`, `BANKNIFTY`. */
  readonly dhanSymbol: string;
  readonly name: string;
  readonly kind: InstrumentKind;
  readonly exchange: 'NSE';
  /** Null for indices, which have no ISIN. */
  readonly isin: string | null;
  readonly lotSize: number;
  /** Minimum price increment, in paise. */
  readonly tickSize: number;
  /** `EQ`, `BE`, … for equities; null for indices. */
  readonly series: string | null;
}

/**
 * One stock-futures contract from the scrip master.
 *
 * A stock has up to three listed at once (near, next, far month). The
 * underlying is named by OUR symbol so a caller never touches a Dhan ticker.
 */
export interface FuturesContract {
  readonly securityId: string;
  readonly segment: 'NSE_FNO';
  /** Our symbol for the underlying: `RELIANCE`. */
  readonly underlyingSymbol: string;
  /** The underlying's own `NSE_EQ` security id. */
  readonly underlyingSecurityId: string;
  /** `YYYY-MM-DD`. */
  readonly expiry: string;
  readonly lotSize: number;
  /** `RELIANCE-Oct2026-FUT`, for logs. */
  readonly name: string;
}

/** One OHLCV bar. `timestamp` is the bar's open instant. Prices in paise. */
export interface Candle {
  readonly timestamp: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  /** Shares traded. A count, not money — stays a plain integer. */
  readonly volume: number;
}

/** A derivatives bar: a candle plus the contract's open interest at the close. */
export interface FuturesCandle extends Candle {
  /** Open interest in the exchange's unit (shares for stock futures). A count. */
  readonly openInterest: number;
}

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

/**
 * The error shape, which Dhan is not consistent about.
 *
 * Trading-layer errors come as `{ errorType, errorCode: "DH-901", errorMessage }`;
 * data-layer ones as `{ status: "failure", remarks: { error_code, error_message } }`
 * or `{ errorCode: 807, ... }`; the auth host answers `{ status: "error", message }`
 * (observed 2026-09-16: "Token can be generated once every 2 minutes."). Everything
 * is optional and every spelling is read, so whichever variant arrives still
 * yields a message and, where Dhan sent one, a code.
 */
export const errorEnvelopeSchema = z.object({
  status: z.string().optional(),
  message: z.string().optional(),
  errorType: z.string().optional(),
  errorCode: z.union([z.string(), z.number()]).optional(),
  errorMessage: z.string().optional(),
  remarks: z
    .union([
      z.string(),
      z.object({
        error_code: z.union([z.string(), z.number()]).optional(),
        error_message: z.string().optional(),
      }),
    ])
    .optional(),
});

export interface EnvelopeError {
  readonly code: string | undefined;
  readonly message: string | undefined;
}

/** Extracts an error code and message from any of the envelope variants, if present. */
export function envelopeError(payload: unknown): EnvelopeError | null {
  const parsed = errorEnvelopeSchema.safeParse(payload);
  if (!parsed.success) return null;
  const body = parsed.data;

  const remarks = typeof body.remarks === 'object' ? body.remarks : undefined;
  const rawCode = body.errorCode ?? remarks?.error_code;
  const code = rawCode === undefined ? undefined : String(rawCode);
  const message =
    body.errorMessage ??
    remarks?.error_message ??
    (typeof body.remarks === 'string' ? body.remarks : undefined) ??
    body.message;

  const isFailure =
    body.status === 'failure' ||
    body.status === 'error' ||
    body.errorType !== undefined ||
    code !== undefined;
  if (!isFailure) return null;
  return { code, message };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const generateTokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  /** `2026-09-17T23:01:04.777` — local (IST) wall clock, no zone designator. */
  expiryTime: z.string().min(1),
  dhanClientId: z.union([z.string(), z.number()]).optional(),
});

export const renewTokenResponseSchema = generateTokenResponseSchema;

export const profileResponseSchema = z.object({
  dhanClientId: z.union([z.string(), z.number()]),
  /** `17/09/2026 23:01` — DD/MM/YYYY HH:mm, IST. */
  tokenValidity: z.string().optional(),
  /** `Active` when the Data API subscription is live. */
  dataPlan: z.string().optional(),
  /** `2026-10-15 22:46:27.0` — IST. */
  dataValidity: z.string().optional(),
  activeSegment: z.string().optional(),
});

export type ProfileResponse = z.infer<typeof profileResponseSchema>;

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/**
 * Columnar candles: parallel arrays rather than rows.
 *
 * `open_interest` is present only when requested and only for derivatives;
 * everything else is required, and the arrays must be the same length or the
 * response is rejected rather than zipped into nonsense.
 */
export const chartsResponseSchema = z
  .object({
    open: z.array(z.number()),
    high: z.array(z.number()),
    low: z.array(z.number()),
    close: z.array(z.number()),
    volume: z.array(z.number()),
    timestamp: z.array(z.number()),
    open_interest: z.array(z.number()).optional(),
  })
  .refine(
    (r) =>
      [r.high, r.low, r.close, r.volume, r.timestamp].every((col) => col.length === r.open.length),
    { message: 'candle columns differ in length' },
  );

export type ChartsResponse = z.infer<typeof chartsResponseSchema>;

/**
 * Zips the columnar response into futures candles: {@link toCandles} plus the
 * `open_interest` column, which must be present and the same length.
 */
export function toFuturesCandles(response: ChartsResponse): FuturesCandle[] {
  const oi = response.open_interest;
  if (oi === undefined || oi.length !== response.timestamp.length) {
    throw new RangeError('toFuturesCandles: open_interest column missing or ragged');
  }
  return toCandles(response).map((candle, i) => {
    const value = oi[i];
    if (value === undefined || !Number.isFinite(value) || value < 0) {
      throw new RangeError(
        `toFuturesCandles: invalid open interest ${String(value)} at index ${i}`,
      );
    }
    return { ...candle, openInterest: Math.round(value) };
  });
}

/** Zips the columnar response into candles, converting rupees to paise. */
export function toCandles(response: ChartsResponse): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < response.timestamp.length; i += 1) {
    const epoch = response.timestamp[i];
    const open = response.open[i];
    const high = response.high[i];
    const low = response.low[i];
    const close = response.close[i];
    const volume = response.volume[i];
    if (
      epoch === undefined ||
      open === undefined ||
      high === undefined ||
      low === undefined ||
      close === undefined ||
      volume === undefined
    ) {
      // Unreachable after the refine above, but `noUncheckedIndexedAccess` is
      // right to make us say so.
      throw new RangeError(`toCandles: ragged column at index ${i}`);
    }
    if (!Number.isFinite(epoch) || epoch <= 0) {
      throw new RangeError(`toCandles: invalid epoch ${String(epoch)} at index ${i}`);
    }
    if (!Number.isFinite(volume) || volume < 0) {
      throw new RangeError(`toCandles: invalid volume ${String(volume)} at index ${i}`);
    }
    candles.push({
      timestamp: new Date(epoch * 1_000),
      open: rupeesToPaise(open),
      high: rupeesToPaise(high),
      low: rupeesToPaise(low),
      close: rupeesToPaise(close),
      volume: Math.round(volume),
    });
  }
  return candles;
}

// ---------------------------------------------------------------------------
// Market quote
// ---------------------------------------------------------------------------

const ohlcSchema = z.object({
  open: z.number().optional(),
  high: z.number().optional(),
  low: z.number().optional(),
  /** Previous session's close, not today's. */
  close: z.number().optional(),
});

/**
 * One `/marketfeed/quote` entry. Everything but `last_price` is optional:
 * pre-open, an index, or a name that has not traded today all arrive with
 * fields missing or zeroed, and one of them must not fail a 1,000-name batch.
 */
export const quoteValueSchema = z.object({
  last_price: z.number().optional(),
  average_price: z.number().optional(),
  net_change: z.number().optional(),
  volume: z.number().optional(),
  buy_quantity: z.number().optional(),
  sell_quantity: z.number().optional(),
  last_quantity: z.number().optional(),
  /** `DD/MM/YYYY HH:MM:SS`, IST. `01/01/1980 00:00:00` is Dhan's null. */
  last_trade_time: z.string().optional(),
  lower_circuit_limit: z.number().optional(),
  upper_circuit_limit: z.number().optional(),
  ohlc: ohlcSchema.optional(),
  depth: z
    .object({
      buy: z.array(z.object({ price: z.number(), quantity: z.number(), orders: z.number() })),
      sell: z.array(z.object({ price: z.number(), quantity: z.number(), orders: z.number() })),
    })
    .optional(),
});

export type QuoteValue = z.infer<typeof quoteValueSchema>;

/** `{ data: { NSE_EQ: { "2885": {...} } }, status: "success" }`. */
export const quoteResponseSchema = z.object({
  status: z.string().optional(),
  data: z.record(z.string(), z.record(z.string(), quoteValueSchema)).optional(),
});

export type QuoteResponse = z.infer<typeof quoteResponseSchema>;
