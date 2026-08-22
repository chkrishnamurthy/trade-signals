import 'server-only';
import type { Quote } from '@wealthos/market-data';
import type { BreadthDto, MoverDto, SectorDto, SentimentDto } from '@/lib/dashboard-types';
import { NEAR_HIGH_POSITION, NEAR_LOW_POSITION, rangePosition } from '@/lib/market-math';
import type { ResolvedConstituent } from './indices';

/**
 * Market analytics derived from quote data.
 *
 * Pure functions over the quotes we already hold — no extra API calls, so the
 * whole breadth/sentiment/sector layer is free in rate-limit terms.
 *
 * The range arithmetic lives in `@/lib/market-math` rather than here, because
 * client components need the same positions this module counts with and cannot
 * import a `server-only` module.
 */

export interface EnrichedQuote {
  readonly constituent: ResolvedConstituent;
  readonly quote: Quote;
}

export function toMover(entry: EnrichedQuote, relativeVolume: number | null = null): MoverDto {
  const { constituent, quote } = entry;
  return {
    symbol: constituent.symbol,
    name: constituent.name,
    sector: constituent.sector,
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
    relativeVolume,
    // Turnover ≈ average traded price × volume. Paise × shares, so it stays an
    // integer; we compute in paise and let the UI format it.
    turnover:
      quote.averagePrice !== null && quote.volume !== null
        ? quote.averagePrice * quote.volume
        : null,
  };
}

/** Advance/decline and day-extreme counts. */
export function computeBreadth(movers: readonly MoverDto[]): BreadthDto {
  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let nearDayHigh = 0;
  let nearDayLow = 0;

  for (const m of movers) {
    const change = m.changePercent;
    if (change === null || change === 0) unchanged += 1;
    else if (change > 0) advancing += 1;
    else declining += 1;

    const position = rangePosition(m.ltp, m.low, m.high);
    if (position !== null) {
      if (position >= NEAR_HIGH_POSITION) nearDayHigh += 1;
      else if (position <= NEAR_LOW_POSITION) nearDayLow += 1;
    }
  }

  const total = movers.length;
  return {
    advancing,
    declining,
    unchanged,
    total,
    advanceDeclineRatio: declining === 0 ? null : advancing / declining,
    percentPositive: total === 0 ? 0 : (advancing / total) * 100,
    percentNegative: total === 0 ? 0 : (declining / total) * 100,
    nearDayHigh,
    nearDayLow,
    aboveEma20: null,
    aboveEma50: null,
    aboveEma200: null,
    withIndicators: 0,
  };
}

/**
 * Overall sentiment, 0–100.
 *
 * A weighted blend of three independent observations, each normalised to
 * 0–100 first so no single input can dominate:
 *
 *   - breadth      how many constituents are up rather than down
 *   - magnitude    the average move, capped at ±2% so one outlier cannot skew it
 *   - positioning  how many sit near the day's high rather than its low
 *
 * This is an analytical summary of today's tape, not a prediction.
 */
export function computeSentiment(movers: readonly MoverDto[], breadth: BreadthDto): SentimentDto {
  if (movers.length === 0) {
    return {
      label: 'Neutral',
      score: 50,
      breadth,
      drivers: [{ label: 'No data', detail: 'No constituent quotes available' }],
    };
  }

  const decided = breadth.advancing + breadth.declining;
  const breadthScore = decided === 0 ? 50 : (breadth.advancing / decided) * 100;

  const changes = movers.map((m) => m.changePercent).filter((c): c is number => c !== null);
  const meanChange = changes.length === 0 ? 0 : changes.reduce((s, c) => s + c, 0) / changes.length;
  const CAP = 2;
  const magnitudeScore = ((Math.max(-CAP, Math.min(CAP, meanChange)) + CAP) / (CAP * 2)) * 100;

  const positioned = breadth.nearDayHigh + breadth.nearDayLow;
  const positionScore = positioned === 0 ? 50 : (breadth.nearDayHigh / positioned) * 100;

  const score = Math.round(breadthScore * 0.45 + magnitudeScore * 0.35 + positionScore * 0.2);

  return {
    label: labelFor(score),
    score,
    breadth,
    drivers: [
      {
        label: 'Breadth',
        detail: `${breadth.advancing} advancing vs ${breadth.declining} declining`,
      },
      { label: 'Average move', detail: `${meanChange >= 0 ? '+' : ''}${meanChange.toFixed(2)}%` },
      {
        label: 'Day positioning',
        detail: `${breadth.nearDayHigh} near day high, ${breadth.nearDayLow} near day low`,
      },
    ],
  };
}

function labelFor(score: number): SentimentDto['label'] {
  if (score >= 70) return 'Bullish';
  if (score >= 57) return 'Mildly bullish';
  if (score <= 30) return 'Bearish';
  if (score <= 43) return 'Mildly bearish';
  return 'Neutral';
}

/** Mean change% per sector, strongest first. */
export function computeSectors(movers: readonly MoverDto[]): SectorDto[] {
  const groups = new Map<string, MoverDto[]>();
  for (const mover of movers) {
    const list = groups.get(mover.sector) ?? [];
    list.push(mover);
    groups.set(mover.sector, list);
  }

  const sectors: SectorDto[] = [];
  for (const [name, members] of groups) {
    const changes = members.map((m) => m.changePercent).filter((c): c is number => c !== null);
    if (changes.length === 0) continue;
    sectors.push({
      name,
      changePercent: changes.reduce((s, c) => s + c, 0) / changes.length,
      advancing: members.filter((m) => (m.changePercent ?? 0) > 0).length,
      declining: members.filter((m) => (m.changePercent ?? 0) < 0).length,
      count: members.length,
      symbols: members.map((m) => m.symbol),
    });
  }

  return sectors.sort((a, b) => b.changePercent - a.changePercent);
}

const byChangeDesc = (a: MoverDto, b: MoverDto): number =>
  (b.changePercent ?? 0) - (a.changePercent ?? 0);

export function topGainers(movers: readonly MoverDto[], limit = 8): MoverDto[] {
  return [...movers]
    .filter((m) => (m.changePercent ?? 0) > 0)
    .sort(byChangeDesc)
    .slice(0, limit);
}

export function topLosers(movers: readonly MoverDto[], limit = 8): MoverDto[] {
  return [...movers]
    .filter((m) => (m.changePercent ?? 0) < 0)
    .sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0))
    .slice(0, limit);
}

export function mostActive(movers: readonly MoverDto[], limit = 8): MoverDto[] {
  return [...movers]
    .filter((m) => m.turnover !== null)
    .sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0))
    .slice(0, limit);
}

/**
 * Stocks trading on unusually heavy volume.
 *
 * Requires the 20-day average, which comes from daily history — so this stays
 * empty until the indicator pass has run rather than guessing from turnover.
 */
export function unusualVolume(movers: readonly MoverDto[], threshold = 1.5, limit = 8): MoverDto[] {
  return [...movers]
    .filter((m) => m.relativeVolume !== null && m.relativeVolume >= threshold)
    .sort((a, b) => (b.relativeVolume ?? 0) - (a.relativeVolume ?? 0))
    .slice(0, limit);
}
