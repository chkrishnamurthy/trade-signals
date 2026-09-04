import 'server-only';
import type { Quote } from '@equitywise/market-data';
import type { DashboardDto, HeadlineIndexDto, MoverDto } from '@/lib/dashboard-types';
import {
  computeBreadth,
  computeSectors,
  computeSentiment,
  mostActive,
  toMover,
  topGainers,
  topLosers,
  unusualVolume,
} from './analytics';
import { MarketDataError, toMarketError } from './errors';
import { getHeadlineIndices, getIndex, type ResolvedIndex } from './indices';
import { getMarketStatus } from './market-status';
import { getProvider } from './provider';
import { getIndicatorCache } from './signals';

/**
 * Assembles the dashboard snapshot.
 *
 * Cost: two quotes calls regardless of how many cards the UI renders — quotes
 * are batched 50 per request and everything else (breadth, sentiment, sectors,
 * movers) is computed locally from the same payload. Market status adds a third
 * call at most once a minute. Indicator-derived fields are read from a separate,
 * slower cache rather than fetched here.
 */

/**
 * Refresh cadence.
 *
 * 15s rather than the 5s this used to run at. `/data/quotes` sits behind a
 * Cloudflare edge rule far tighter than the documented 200/min, and a 5s poll
 * costs 24 quotes calls a minute — enough to earn a ~22 minute ban. The product
 * screens daily-candle setups; nothing it renders is meaningfully fresher at 5s.
 */
const OPEN_TTL_MS = 15_000;
const CLOSED_TTL_MS = 120_000;

interface CacheEntry {
  readonly snapshot: DashboardDto;
  readonly expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<DashboardDto>>();

/**
 * How long a FAILED build is remembered before another upstream attempt.
 *
 * `inFlight` already coalesces concurrent callers, but a failure it does not
 * cache: without this, every poll that lands after the previous one settled —
 * across every open tab and every device, since this cache is module-level —
 * makes a fresh `/data/quotes` call that fails again. A dead credential
 * therefore becomes a slow request storm, and that volume is exactly what earns
 * a Cloudflare edge ban on the quotes path (the "blocked upstream" the whole app
 * then shows). Remembering the failure briefly means one failed build backs off
 * the entire app, and the upstream failure rate stays independent of tab count.
 *
 * Short on purpose: long enough to collapse a storm, short enough that the app
 * recovers within seconds of the credential being restored. A real upstream
 * deadline (a rate-limit ban's `Retry-After`) overrides it — see below.
 */
const FAILURE_TTL_MS = 30_000;

interface FailureEntry {
  readonly error: MarketDataError;
  readonly expiresAt: number;
}

const failureCache = new Map<string, FailureEntry>();

function headlineDto(
  meta: { symbol: string; name: string; display: 'index' | 'volatility' },
  quote: Quote,
  sparkline: readonly number[],
): HeadlineIndexDto {
  return {
    symbol: meta.symbol,
    name: meta.name,
    display: meta.display,
    ltp: quote.ltp,
    change: quote.change,
    changePercent: quote.changePercent,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    previousClose: quote.previousClose,
    sparkline,
  };
}

async function build(index: ResolvedIndex): Promise<DashboardDto> {
  const provider = await getProvider();
  const headlines = await getHeadlineIndices();
  const refs = [...headlines, ...index.constituents];

  // A missing status must not fail the whole snapshot; it degrades to
  // `unknown`, which the UI renders as "session state unavailable".
  const [statusResult, quotesResult] = await Promise.all([
    getMarketStatus(),
    provider.fetchQuotes(refs),
  ]);

  const { quotes, missing } = quotesResult;
  const indicators = getIndicatorCache(index.key);

  const indices: HeadlineIndexDto[] = [];
  for (const headline of headlines) {
    const quote = quotes.get(headline.symbol);
    if (quote === undefined) continue;
    indices.push(headlineDto(headline, quote, indicators?.sparklines.get(headline.symbol) ?? []));
  }

  const movers: MoverDto[] = [];
  for (const constituent of index.constituents) {
    const quote = quotes.get(constituent.symbol);
    if (quote === undefined) continue;
    // Relative volume needs the 20-day average, which only exists once the
    // indicator pass has run. Until then it stays null rather than being faked.
    const snapshot = indicators?.snapshots.get(constituent.symbol);
    const relativeVolume =
      snapshot?.averageVolume != null && snapshot.averageVolume > 0 && quote.volume !== null
        ? quote.volume / snapshot.averageVolume
        : null;
    movers.push(toMover({ constituent, quote }, relativeVolume));
  }

  const breadth = computeBreadth(movers);
  if (indicators !== null) {
    Object.assign(breadth, {
      aboveEma20: indicators.aboveEma20,
      aboveEma50: indicators.aboveEma50,
      aboveEma200: indicators.aboveEma200,
      withIndicators: indicators.snapshots.size,
    });
  }

  const isOpen = statusResult?.isOpen ?? false;
  const totalVolume = movers.reduce((sum, m) => sum + (m.volume ?? 0), 0);
  const turnovers = movers.map((m) => m.turnover).filter((t): t is number => t !== null);

  let nearHigh52w: number | null = null;
  let nearLow52w: number | null = null;
  if (indicators !== null) {
    nearHigh52w = 0;
    nearLow52w = 0;
    for (const mover of movers) {
      const snap = indicators.snapshots.get(mover.symbol);
      if (snap?.high52w != null && mover.ltp >= snap.high52w * 0.98) nearHigh52w += 1;
      if (snap?.low52w != null && mover.ltp <= snap.low52w * 1.02) nearLow52w += 1;
    }
  }

  return {
    indices,
    sentiment: computeSentiment(movers, breadth),
    sectors: computeSectors(movers),
    gainers: topGainers(movers),
    losers: topLosers(movers),
    mostActive: mostActive(movers),
    unusualVolume: unusualVolume(movers),
    quotes: movers,
    quickStats: {
      totalVolume,
      totalTurnover: turnovers.length === 0 ? null : turnovers.reduce((s, t) => s + t, 0),
      advancing: breadth.advancing,
      declining: breadth.declining,
      nearHigh52w,
      nearLow52w,
    },
    market: { isOpen, phase: statusResult?.phase ?? 'unknown' },
    fetchedAt: new Date().toISOString(),
    cached: false,
    missing,
    refreshAfterSeconds: isOpen ? OPEN_TTL_MS / 1000 : CLOSED_TTL_MS / 1000,
    indicatorsReady: indicators !== null,
  };
}

export async function getDashboard(indexKey: string): Promise<DashboardDto> {
  const index = await getIndex(indexKey);
  if (index === null) {
    throw new MarketDataError(`Unknown index "${indexKey}".`, {
      code: 'UNKNOWN_INDEX',
      status: 404,
      remedy: 'Add it to config/indices.yaml.',
    });
  }

  const cached = cache.get(index.key);
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    return { ...cached.snapshot, cached: true };
  }

  // A recent build failure short-circuits here rather than hitting upstream
  // again. This is what stops a dead credential (or any upstream fault) from
  // turning every poll into another failed `/data/quotes` call and earning a
  // Cloudflare ban. The same MarketDataError is re-thrown, so the route still
  // serves stale where it can and reports the same remedy and Retry-After.
  const failed = failureCache.get(index.key);
  if (failed !== undefined && failed.expiresAt > Date.now()) {
    throw failed.error;
  }

  const existing = inFlight.get(index.key);
  if (existing !== undefined) return existing;

  const pending = build(index)
    .then((snapshot) => {
      cache.set(index.key, {
        snapshot,
        expiresAt: Date.now() + (snapshot.market.isOpen ? OPEN_TTL_MS : CLOSED_TTL_MS),
      });
      // A success clears any remembered failure so recovery is immediate.
      failureCache.delete(index.key);
      return snapshot;
    })
    .catch((error: unknown) => {
      const marketError = toMarketError(error);
      // Honour a real upstream deadline (a rate-limit ban's Retry-After);
      // otherwise back off for the short default so the storm cannot re-form.
      const cooldownMs =
        marketError.retryAfterSeconds !== undefined
          ? marketError.retryAfterSeconds * 1_000
          : FAILURE_TTL_MS;
      failureCache.set(index.key, {
        error: marketError,
        expiresAt: Date.now() + cooldownMs,
      });
      throw marketError;
    })
    .finally(() => {
      inFlight.delete(index.key);
    });

  inFlight.set(index.key, pending);
  return pending;
}

/**
 * Drops the cached snapshot for an index.
 *
 * Called when the indicator pass completes: the cached snapshot was assembled
 * without indicator data, and without this it would keep serving
 * `indicatorsReady: false` for the rest of its TTL even though the data is now
 * available.
 */
export function invalidateDashboard(indexKey: string): void {
  cache.delete(indexKey.toLowerCase());
  failureCache.delete(indexKey.toLowerCase());
}

export function getStaleDashboard(indexKey: string): DashboardDto | null {
  const entry = cache.get(indexKey.toLowerCase());
  return entry === undefined ? null : { ...entry.snapshot, cached: true };
}
