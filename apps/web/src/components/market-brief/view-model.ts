import type { DailyMarketBrief } from '@/lib/market-brief';
import type { LeaderDto, MarketBreadthDto } from '@/server/market-breadth';
import type { PersonalMoverDto } from '@/server/market-brief';

export type Industry = MarketBreadthDto['industries'][number];
export type IndustryMetric = 'change1d' | 'ret1w' | 'ret1m' | 'ret3m';

export const INDUSTRY_METRICS: readonly { id: IndustryMetric; label: string }[] = [
  { id: 'change1d', label: '1D' },
  { id: 'ret1w', label: '1W' },
  { id: 'ret1m', label: '1M' },
  { id: 'ret3m', label: '3M' },
];

export function signed(value: number | null, digits = 1, suffix = '%'): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(digits)}${suffix}`;
}

export function rankIndustries(
  industries: readonly Industry[],
  metric: IndustryMetric,
): { readonly leaders: readonly Industry[]; readonly laggards: readonly Industry[] } {
  const ranked = [...industries]
    .filter((row) => row[metric] !== null)
    .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0));
  const leaders = ranked.slice(0, 5);
  const laggards = ranked
    .slice(-5)
    .reverse()
    .filter((row) => !leaders.includes(row));
  return { leaders, laggards };
}

export interface PersonalItem extends PersonalMoverDto {
  readonly reasons: readonly string[];
}

export function buildPersonalItems(
  movers: readonly PersonalMoverDto[],
  changes: DailyMarketBrief['watchlists']['items'],
): readonly PersonalItem[] {
  const bySymbol = new Map<string, PersonalItem>();
  for (const mover of movers) bySymbol.set(mover.symbol, { ...mover, reasons: [] });
  for (const change of changes) {
    const prior = bySymbol.get(change.symbol);
    if (prior === undefined) {
      bySymbol.set(change.symbol, {
        instrumentId: change.instrumentId,
        symbol: change.symbol,
        name: change.name,
        closePaise: change.closePaise,
        sessionReturn: change.sessionReturn,
        watchlists: change.watchlists,
        reasons: [change.explanation],
      });
    } else if (!prior.reasons.includes(change.explanation)) {
      bySymbol.set(change.symbol, { ...prior, reasons: [...prior.reasons, change.explanation] });
    }
  }
  return [...bySymbol.values()]
    .sort((a, b) => {
      if (a.reasons.length !== b.reasons.length) return b.reasons.length - a.reasons.length;
      return Math.abs(b.sessionReturn ?? 0) - Math.abs(a.sessionReturn ?? 0);
    })
    .slice(0, 8);
}

export interface MarketAttentionCategory {
  readonly id: 'volume' | 'delivery' | 'highs' | 'lows' | 'buildup';
  readonly label: string;
  readonly rows: readonly LeaderDto[];
  readonly count?: number | null;
  readonly format: (value: number | null) => string;
}

export function marketAttentionCategories(
  breadth: MarketBreadthDto,
): readonly MarketAttentionCategory[] {
  const categories: readonly MarketAttentionCategory[] = [
    {
      id: 'volume',
      label: 'Unusual volume',
      rows: breadth.leaders.volume,
      format: (value) => (value === null ? '—' : `${value.toFixed(1)}×`),
    },
    {
      id: 'delivery',
      label: 'Delivery spikes',
      rows: breadth.leaders.delivery,
      count: breadth.deliverySpikes,
      format: (value) => (value === null ? '—' : `${value.toFixed(1)}% delivery`),
    },
    {
      id: 'highs',
      label: '52W highs',
      rows: breadth.leaders.highs,
      format: (value) => (value === null ? '—' : `${value.toFixed(1)}× volume`),
    },
    {
      id: 'lows',
      label: '52W lows',
      rows: breadth.leaders.lows,
      format: (value) => (value === null ? '—' : `${value.toFixed(1)}× volume`),
    },
    {
      id: 'buildup',
      label: 'Long build-up',
      rows: breadth.leaders.buildup,
      format: (value) => `OI ${signed(value)}`,
    },
  ];
  return categories.filter((category) => category.rows.length > 0);
}
