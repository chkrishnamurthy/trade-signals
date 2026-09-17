import { fromIstParts, rupeesToPaise } from '@equitywise/shared';
import { authHeaders, DHAN_API_BASE, type DhanHttpClient, type DhanSession } from './http.js';
import {
  EXCHANGE_SEGMENTS,
  type ExchangeSegment,
  type QuoteValue,
  quoteResponseSchema,
  type SecurityRef,
  securityKey,
} from './types.js';

/**
 * Snapshot quotes.
 *
 * `POST /marketfeed/quote` takes up to 1,000 instruments in one body, keyed by
 * segment, at one call per second. That single fact is most of why Dhan is
 * here: the whole watched universe is one request, not `ceil(N/50)`.
 */

/** Documented maximum instruments in a single quote call. */
export const MAX_QUOTE_INSTRUMENTS = 1_000;

/** Dhan's placeholder for "has not traded": the Unix-ish epoch of its own choosing. */
const NULL_TRADE_TIME_PREFIX = '01/01/1980';

/**
 * A normalised quote. Every price is integer paise.
 *
 * `null` means Dhan did not supply the field — never a zero or a guess.
 */
export interface Quote {
  readonly ref: SecurityRef;
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
  readonly bid: number | null;
  readonly ask: number | null;
  readonly volume: number | null;
  /** Last trade time, UTC. */
  readonly timestamp: Date | null;
}

/** Paise, or null when the field is missing or a zero placeholder. */
function optionalPaise(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return null;
  return rupeesToPaise(value);
}

/** `16/09/2026 15:29:58` (IST) → UTC instant; Dhan's 1980 placeholder → null. */
export function parseTradeTime(text: string | undefined): Date | null {
  if (text === undefined || text.startsWith(NULL_TRADE_TIME_PREFIX)) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(text.trim());
  if (match === null) return null;
  const [, d, mo, y, h, mi, s] = match;
  if (
    d === undefined ||
    mo === undefined ||
    y === undefined ||
    h === undefined ||
    mi === undefined ||
    s === undefined
  )
    return null;
  const date = fromIstParts({
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
    second: Number(s),
  });
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Best bid / ask from the depth ladder, or null when the top level is empty. */
function topOfBook(depth: QuoteValue['depth'], side: 'buy' | 'sell'): number | null {
  const level = depth?.[side][0];
  if (level === undefined || level.quantity <= 0) return null;
  return optionalPaise(level.price);
}

/** Converts one raw quote entry, or null when it carries no usable price. */
export function toQuote(ref: SecurityRef, v: QuoteValue): Quote | null {
  if (v.last_price === undefined || !Number.isFinite(v.last_price) || v.last_price <= 0) {
    return null;
  }
  const ltp = rupeesToPaise(v.last_price);
  const previousClose = optionalPaise(v.ohlc?.close);

  // Derived from the previous close rather than read from `net_change`:
  // observed 2026-09-16, `net_change` is `0` for every instrument after hours
  // while `ohlc.close` (the previous close) is correct. Integer paise minus
  // integer paise is exact, so nothing is lost. `net_change` is signed and a
  // genuinely flat stock has 0, so when it is the only signal it is used as-is.
  let change: number | null = null;
  if (previousClose !== null) {
    change = ltp - previousClose;
  } else if (v.net_change !== undefined && Number.isFinite(v.net_change)) {
    change = rupeesToPaise(v.net_change);
  }
  const changePercent =
    change !== null && previousClose !== null && previousClose > 0
      ? (change / previousClose) * 100
      : null;

  return {
    ref,
    ltp,
    change,
    changePercent,
    open: optionalPaise(v.ohlc?.open),
    high: optionalPaise(v.ohlc?.high),
    low: optionalPaise(v.ohlc?.low),
    previousClose,
    averagePrice: optionalPaise(v.average_price),
    bid: topOfBook(v.depth, 'buy'),
    ask: topOfBook(v.depth, 'sell'),
    volume: v.volume === undefined || !Number.isFinite(v.volume) ? null : Math.round(v.volume),
    timestamp: parseTradeTime(v.last_trade_time),
  };
}

/** Splits refs into batches within the documented per-request cap. */
export function chunkRefs(
  refs: readonly SecurityRef[],
  size = MAX_QUOTE_INSTRUMENTS,
): SecurityRef[][] {
  if (size < 1) throw new RangeError('chunkRefs: size must be at least 1');
  const chunks: SecurityRef[][] = [];
  for (let i = 0; i < refs.length; i += size) {
    chunks.push([...refs.slice(i, i + size)]);
  }
  return chunks;
}

/** `{ NSE_EQ: [2885, 11536], IDX_I: [13] }` — the request body shape. */
export function toQuoteRequestBody(refs: readonly SecurityRef[]): Record<string, number[]> {
  const body: Record<string, number[]> = {};
  for (const ref of refs) {
    const ids = body[ref.segment] ?? [];
    ids.push(Number(ref.securityId));
    body[ref.segment] = ids;
  }
  return body;
}

export interface QuoteFetcher {
  readonly http: DhanHttpClient;
  readonly session: DhanSession;
}

export interface FetchQuotesResult {
  /** Keyed by {@link securityKey}. */
  readonly quotes: Map<string, Quote>;
  /** Refs Dhan accepted but returned no usable quote for. */
  readonly missing: SecurityRef[];
}

function isSegment(value: string): value is ExchangeSegment {
  return (EXCHANGE_SEGMENTS as readonly string[]).includes(value);
}

/**
 * Fetches quotes for any number of instruments, chunking to the documented cap.
 *
 * Refs that come back unusable are reported in `missing` rather than being
 * silently dropped or filled with zeros.
 */
export async function fetchQuotes(
  fetcher: QuoteFetcher,
  refs: readonly SecurityRef[],
): Promise<FetchQuotesResult> {
  const quotes = new Map<string, Quote>();

  for (const batch of chunkRefs(refs)) {
    const response = await fetcher.http.request(
      `${DHAN_API_BASE}/marketfeed/quote`,
      quoteResponseSchema,
      {
        method: 'POST',
        headers: authHeaders(fetcher.session),
        body: toQuoteRequestBody(batch),
        bucket: 'quote',
      },
    );

    for (const [segment, bySecurity] of Object.entries(response.data ?? {})) {
      if (!isSegment(segment)) continue;
      for (const [securityId, value] of Object.entries(bySecurity)) {
        const ref: SecurityRef = { segment, securityId };
        const quote = toQuote(ref, value);
        if (quote !== null) quotes.set(securityKey(ref), quote);
      }
    }
  }

  const missing = refs.filter((ref) => !quotes.has(securityKey(ref)));
  return { quotes, missing };
}
