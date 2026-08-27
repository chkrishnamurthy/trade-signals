import { rupeesToPaise } from '@equitywise/shared';
import { z } from 'zod';
import { FYERS_DATA_BASE, type FyersHttpClient } from './http.js';
import { fyersEnvelopeSchema } from './types.js';

/**
 * Live quotes.
 *
 * `GET /data/quotes` returns a full snapshot per symbol. The documented cap is
 * 50 symbols per request, so anything larger is chunked here.
 */

/** Documented maximum symbols in a single quotes call. */
export const MAX_QUOTE_SYMBOLS = 50;

/**
 * Every price field is optional in practice.
 *
 * Before the first trade of the day an illiquid symbol comes back with `lp`
 * present but `open_price`/`high_price`/`low_price` absent or zero, and indices
 * never carry `volume`. Marking them optional is what stops one thin stock from
 * failing the whole batch.
 */
const quoteValueSchema = z.object({
  // Optional, despite being THE field that matters. Fyers reports a bad symbol
  // by nesting an error object inside `v` while still setting the entry's
  // `s` to "ok" — observed live on 2026-08-21 for a delisted symbol, which
  // returned { n, errmsg, code: -300, s: "error" } here. Requiring `lp` made
  // one dead symbol fail the entire 50-symbol batch.
  lp: z.number().optional(),
  /** Present only on the nested-error shape described above. */
  errmsg: z.string().optional(),
  /** `"error"` on the nested-error shape. */
  s: z.string().optional(),
  code: z.number().optional(),
  ch: z.number().optional(),
  chp: z.number().optional(),
  open_price: z.number().optional(),
  high_price: z.number().optional(),
  low_price: z.number().optional(),
  prev_close_price: z.number().optional(),
  atp: z.number().optional(),
  volume: z.number().optional(),
  bid: z.number().optional(),
  ask: z.number().optional(),
  short_name: z.string().optional(),
  exchange: z.string().optional(),
  description: z.string().optional(),
  symbol: z.string().optional(),
  fyToken: z.string().optional(),
  // Fyers returns this as a string in some responses and a number in others.
  tt: z.union([z.number(), z.string()]).optional(),
});

const quoteEntrySchema = z.object({
  n: z.string(),
  s: z.string(),
  v: quoteValueSchema.optional(),
});

export const quotesResponseSchema = fyersEnvelopeSchema.extend({
  d: z.array(quoteEntrySchema).nullable().optional(),
});

export type QuotesResponse = z.infer<typeof quotesResponseSchema>;

/**
 * A normalised quote. Every price is integer paise.
 *
 * `null` means Fyers did not supply the field — never a zero or a guess.
 */
export interface Quote {
  readonly fyersSymbol: string;
  readonly shortName: string | null;
  readonly description: string | null;
  readonly fyToken: string | null;
  /** Last traded price, paise. */
  readonly ltp: number;
  /** Absolute change vs previous close, paise. Signed. */
  readonly change: number | null;
  /** Percent change. A ratio, so it stays a float — not money. */
  readonly changePercent: number | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly previousClose: number | null;
  readonly averagePrice: number | null;
  readonly volume: number | null;
  /** Exchange feed time. */
  readonly timestamp: Date | null;
}

/** Paise, or null when the field is missing or a zero placeholder. */
function optionalPaise(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value === 0) return null;
  return rupeesToPaise(value);
}

function optionalTimestamp(tt: number | string | undefined): Date | null {
  if (tt === undefined) return null;
  const seconds = typeof tt === 'string' ? Number(tt) : tt;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

/** Splits a symbol list into batches within the documented per-request cap. */
export function chunkSymbols(symbols: readonly string[], size = MAX_QUOTE_SYMBOLS): string[][] {
  if (size < 1) throw new RangeError('chunkSymbols: size must be at least 1');
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += size) {
    chunks.push([...symbols.slice(i, i + size)]);
  }
  return chunks;
}

/** Converts one raw quote entry, or null when Fyers reported it as failed. */
export function toQuote(entry: z.infer<typeof quoteEntrySchema>): Quote | null {
  if (entry.s !== 'ok' || entry.v === undefined) return null;
  const v = entry.v;

  // The nested-error shape: the envelope and the entry both say "ok", but the
  // value object is an error. Trust the innermost signal.
  if (v.s === 'error' || v.errmsg !== undefined) return null;

  if (v.lp === undefined || !Number.isFinite(v.lp) || v.lp <= 0) return null;

  return {
    fyersSymbol: entry.n,
    shortName: v.short_name ?? null,
    description: v.description ?? null,
    fyToken: v.fyToken ?? null,
    ltp: rupeesToPaise(v.lp),
    // `ch` is signed, so it must not go through the zero-stripping helper —
    // a genuinely flat stock has ch === 0 and that is meaningful.
    change: v.ch === undefined || !Number.isFinite(v.ch) ? null : rupeesToPaise(v.ch),
    changePercent: v.chp === undefined || !Number.isFinite(v.chp) ? null : v.chp,
    open: optionalPaise(v.open_price),
    high: optionalPaise(v.high_price),
    low: optionalPaise(v.low_price),
    previousClose: optionalPaise(v.prev_close_price),
    averagePrice: optionalPaise(v.atp),
    volume: v.volume === undefined || !Number.isFinite(v.volume) ? null : Math.round(v.volume),
    timestamp: optionalTimestamp(v.tt),
  };
}

export interface QuoteFetcher {
  readonly http: FyersHttpClient;
  /** `appId:accessToken`. */
  readonly authorization: string;
}

export interface FetchQuotesResult {
  readonly quotes: Map<string, Quote>;
  /** Symbols Fyers accepted the request for but returned no usable quote. */
  readonly missing: string[];
}

/**
 * Fetches quotes for any number of symbols, chunking to the documented cap.
 *
 * Symbols that come back unusable are reported in `missing` rather than being
 * silently dropped or filled with zeros.
 */
export async function fetchQuotes(
  fetcher: QuoteFetcher,
  fyersSymbols: readonly string[],
): Promise<FetchQuotesResult> {
  const quotes = new Map<string, Quote>();
  const seen = new Set<string>();

  for (const batch of chunkSymbols(fyersSymbols)) {
    const response = await fetcher.http.request(`${FYERS_DATA_BASE}/quotes`, quotesResponseSchema, {
      method: 'GET',
      headers: { Authorization: fetcher.authorization },
      // Fyers expects a comma-separated list; the ':' and '-' must survive, so
      // the list is joined before the URL layer encodes it as one value.
      query: { symbols: batch.join(',') },
    });

    for (const entry of response.d ?? []) {
      seen.add(entry.n);
      const quote = toQuote(entry);
      if (quote !== null) quotes.set(entry.n, quote);
    }
  }

  const missing = fyersSymbols.filter((symbol) => !quotes.has(symbol));
  return { quotes, missing };
}

// ---------------------------------------------------------------------------
// Market status
// ---------------------------------------------------------------------------

/** Statuses `/data/marketStatus` can report, per the v3 spec. */
export type FyersMarketStatus =
  | 'PREOPEN'
  | 'OPEN'
  | 'CLOSE'
  | 'POSTCLOSE_START'
  | 'CTS_CLOSE'
  | 'CAS_START'
  | 'CAS_MKT_ORD_RESTRICT'
  | 'CAS_END';

export const marketStatusResponseSchema = fyersEnvelopeSchema.extend({
  marketStatus: z
    .array(
      z.object({
        exchange: z.number(),
        segment: z.number(),
        market_type: z.string().optional(),
        status: z.string(),
      }),
    )
    .nullable()
    .optional(),
});

/** NSE = 10, Capital Market segment = 10 (v3 spec, Appendix). */
const NSE_EXCHANGE = 10;
const CAPITAL_MARKET_SEGMENT = 10;

export interface MarketStatus {
  /** True only for continuous trading. */
  readonly isOpen: boolean;
  readonly status: FyersMarketStatus | 'UNKNOWN';
  readonly checkedAt: Date;
}

/**
 * Authoritative market status for NSE cash.
 *
 * Preferred over inferring from the clock, because only the exchange knows
 * about trading holidays and unscheduled halts.
 */
export async function fetchMarketStatus(fetcher: QuoteFetcher): Promise<MarketStatus> {
  const response = await fetcher.http.request(
    `${FYERS_DATA_BASE}/marketStatus`,
    marketStatusResponseSchema,
    { method: 'GET', headers: { Authorization: fetcher.authorization } },
  );

  const entry = (response.marketStatus ?? []).find(
    (row) => row.exchange === NSE_EXCHANGE && row.segment === CAPITAL_MARKET_SEGMENT,
  );

  const status = (entry?.status ?? 'UNKNOWN') as FyersMarketStatus | 'UNKNOWN';
  return { isOpen: status === 'OPEN', status, checkedAt: new Date() };
}
