import 'server-only';
import { fetchMarketStatus, fetchQuotes, type Quote } from '@signal/fyers';
import type {
  IndexQuoteDto,
  MarketSnapshotDto,
  MarketStatusCode,
  QuoteDto,
} from '@/lib/market-types';
import { MarketDataError, toMarketError } from './errors';
import { getFyersFetcher } from './fyers-client';
import type { ResolvedIndex } from './indices';

/**
 * Single-index quote snapshot, backing /api/market/[index].
 *
 * Rate-limit discipline lives here. Fyers allows 200 requests/minute across the
 * whole account and blocks you for the rest of the day after three breaches; a
 * refresh costs two quote calls (51 symbols, capped at 50 per call). The cache
 * means twenty open tabs cost the same as one.
 */

const OPEN_TTL_MS = 5_000;
const CLOSED_TTL_MS = 120_000;

interface CacheEntry {
  readonly snapshot: MarketSnapshotDto;
  readonly expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<MarketSnapshotDto>>();

function toQuoteDto(
  constituent: { symbol: string; name: string; fyersSymbol: string },
  quote: Quote,
): QuoteDto {
  return {
    symbol: constituent.symbol,
    fyersSymbol: constituent.fyersSymbol,
    name: constituent.name,
    ltp: quote.ltp,
    change: quote.change,
    changePercent: quote.changePercent,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    previousClose: quote.previousClose,
    averagePrice: quote.averagePrice,
    volume: quote.volume,
    timestamp: quote.timestamp?.toISOString() ?? null,
  };
}

async function build(index: ResolvedIndex): Promise<MarketSnapshotDto> {
  const fetcher = getFyersFetcher();
  const symbols = [index.indexFyersSymbol, ...index.constituents.map((c) => c.fyersSymbol)];

  const [statusResult, quotesResult] = await Promise.all([
    fetchMarketStatus(fetcher).catch(() => null),
    fetchQuotes(fetcher, symbols),
  ]);

  const { quotes, missing } = quotesResult;
  const indexQuote = quotes.get(index.indexFyersSymbol);
  const indexDto: IndexQuoteDto | null =
    indexQuote === undefined
      ? null
      : {
          symbol: index.indexSymbol,
          fyersSymbol: index.indexFyersSymbol,
          name: index.name,
          ltp: indexQuote.ltp,
          change: indexQuote.change,
          changePercent: indexQuote.changePercent,
          open: indexQuote.open,
          high: indexQuote.high,
          low: indexQuote.low,
          previousClose: indexQuote.previousClose,
        };

  const constituents: QuoteDto[] = [];
  for (const constituent of index.constituents) {
    const quote = quotes.get(constituent.fyersSymbol);
    // No quote means no row. We never invent a price.
    if (quote !== undefined) constituents.push(toQuoteDto(constituent, quote));
  }

  const isOpen = statusResult?.isOpen ?? false;
  return {
    index: indexDto,
    constituents,
    market: { isOpen, status: (statusResult?.status ?? 'UNKNOWN') as MarketStatusCode },
    fetchedAt: new Date().toISOString(),
    cached: false,
    missing,
    refreshAfterSeconds: isOpen ? OPEN_TTL_MS / 1000 : CLOSED_TTL_MS / 1000,
  };
}

/**
 * Returns a snapshot, served from cache when one is still fresh.
 *
 * Concurrent callers share a single upstream request rather than each spending
 * from the rate-limit budget.
 */
export async function getMarketSnapshot(index: ResolvedIndex): Promise<MarketSnapshotDto> {
  const cached = cache.get(index.key);
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    return { ...cached.snapshot, cached: true };
  }

  const existing = inFlight.get(index.key);
  if (existing !== undefined) return existing;

  const pending = build(index)
    .then((snapshot) => {
      cache.set(index.key, {
        snapshot,
        expiresAt: Date.now() + (snapshot.market.isOpen ? OPEN_TTL_MS : CLOSED_TTL_MS),
      });
      return snapshot;
    })
    .catch((error: unknown) => {
      throw toMarketError(error);
    })
    .finally(() => {
      inFlight.delete(index.key);
    });

  inFlight.set(index.key, pending);
  return pending;
}

/** Last good snapshot, if any — used to keep showing data through a blip. */
export function getStaleSnapshot(key: string): MarketSnapshotDto | null {
  const entry = cache.get(key);
  return entry === undefined ? null : { ...entry.snapshot, cached: true };
}

export { MarketDataError };
