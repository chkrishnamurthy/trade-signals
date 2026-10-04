import 'server-only';
import type { InstrumentRef, MarketStatus, Quote } from '@equitywise/market-data';
import type { IndexSnapshotDto, IndexStripDto } from '@/lib/market-types';
import { MarketDataError, toMarketError } from './errors';
import { getHeadlineIndices, type HeadlineIndex } from './indices';
import { getMarketStatus } from './market-status';
import { getProvider } from './provider';

/**
 * The market indices strip — the row of index cards under every page header.
 *
 * Every signed-in page mounts the strip, so this is the most-requested
 * snapshot in the app and must be the cheapest: one `fetchQuotes` for all the
 * headline indices, cached process-wide for a few seconds so a burst of page
 * loads costs the provider one request, not one per user
 * (`docs/planning/market-data-scaling-plan.md`: load scales with distinct
 * instruments, never with users).
 *
 * The last good snapshot is kept so a provider blip does not blank the market
 * from the top of every page. That memory is derived, reproducible data —
 * never a stored price.
 */

/** How long one quote snapshot serves every caller. */
const SNAPSHOT_TTL_MS = 5_000;

export interface IndexStripInput {
  readonly headlines: readonly HeadlineIndex[];
  readonly quotes: ReadonlyMap<string, Quote>;
  readonly market: MarketStatus | null;
  readonly now: Date;
}

/**
 * Pure: shapes provider output into the wire DTO. An index the provider
 * returned no quote for is dropped rather than rendered as zeros — six honest
 * cells beat seven with a lie in one.
 */
export function buildIndexStrip(input: IndexStripInput): IndexStripDto {
  const indices: IndexSnapshotDto[] = [];
  for (const headline of input.headlines) {
    const quote = input.quotes.get(headline.symbol);
    if (quote === undefined) continue;
    indices.push({
      symbol: headline.symbol,
      name: headline.name,
      exchange: headline.exchange,
      display: headline.display,
      ltp: quote.ltp,
      change: quote.change,
      changePercent: quote.changePercent,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      previousClose: quote.previousClose,
      at: quote.timestamp?.toISOString() ?? null,
    });
  }
  return {
    indices,
    market: {
      isOpen: input.market?.isOpen ?? false,
      phase: input.market?.phase ?? 'unknown',
    },
    asOf: input.now.toISOString(),
  };
}

let snapshot: { readonly value: IndexStripDto; readonly expiresAt: number } | null = null;
let lastGood: IndexStripDto | null = null;
let inFlight: Promise<IndexStripDto> | null = null;

/** The index refs the live route subscribes — the same set the snapshot quotes. */
export async function getIndexStripRefs(): Promise<readonly InstrumentRef[]> {
  return (await getHeadlineIndices()).map((h) => ({
    symbol: h.symbol,
    kind: 'index' as const,
    exchange: h.exchange,
  }));
}

/**
 * The strip, at most `SNAPSHOT_TTL_MS` old. Concurrent callers share one
 * upstream request. Throws `MarketDataError`; the route decides whether the
 * stale copy may stand in.
 */
export async function getIndexStrip(now = new Date()): Promise<IndexStripDto> {
  if (snapshot !== null && snapshot.expiresAt > now.getTime()) return snapshot.value;
  if (inFlight !== null) return inFlight;

  inFlight = (async () => {
    try {
      const value = await fetchIndexStrip(now);
      snapshot = { value, expiresAt: now.getTime() + SNAPSHOT_TTL_MS };
      lastGood = value;
      return value;
    } catch (error) {
      throw error instanceof MarketDataError ? error : toMarketError(error);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** The last snapshot that succeeded, flagged stale. Null before the first success. */
export function getStaleIndexStrip(reason: string): IndexStripDto | null {
  return lastGood === null ? null : { ...lastGood, stale: { reason } };
}

async function fetchIndexStrip(now: Date): Promise<IndexStripDto> {
  const headlines = await getHeadlineIndices();
  const refs = await getIndexStripRefs();
  const provider = await getProvider();

  const [result, market] = await Promise.all([provider.fetchQuotes(refs), getMarketStatus()]);

  // A configured index with no quote is dropped from the strip (six honest
  // cells beat seven with a lie in one) — but silently dropping it is how a
  // wrong ticker in config/indices.yaml goes unnoticed for a week. Name it.
  const dropped = refs.filter((ref) => !result.quotes.has(ref.symbol)).map((ref) => ref.symbol);
  if (dropped.length > 0) {
    console.warn(
      `[index-strip] no quote for ${dropped.join(', ')} — check the ticker in config/indices.yaml against the provider's symbol master`,
    );
  }

  return buildIndexStrip({ headlines, quotes: result.quotes, market, now });
}

/** Test seam. */
export function resetIndexStripCache(): void {
  snapshot = null;
  lastGood = null;
  inFlight = null;
}
