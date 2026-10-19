import { describe, expect, it } from 'vitest';
import type { MarketBreadthDto } from '@/server/market-breadth';
import {
  buildPersonalItems,
  marketAttentionCategories,
  rankIndustries,
  signed,
} from './view-model';

const industry = (name: string, value: number | null) => ({
  industry: name,
  stocks: 10,
  change1d: value,
  ret1w: value,
  ret1m: value,
  ret3m: value,
  above50Pct: 50,
});

const leader = (symbol: string) => ({
  symbol,
  name: symbol,
  industry: 'Test',
  changePct: 1,
  metric: 2,
});

function breadth(overrides: Partial<MarketBreadthDto> = {}): MarketBreadthDto {
  return {
    universe: 'all',
    session: '2026-10-09',
    builtAt: '2026-10-09T13:00:00.000Z',
    stale: false,
    history: [],
    industries: [],
    deliverySpikes: 12,
    leaders: {
      volume: [leader('VOLUME')],
      delivery: [leader('DELIVERY')],
      highs: [leader('HIGH')],
      lows: [leader('LOW')],
      buildup: [leader('BUILDUP')],
    },
    ...overrides,
  };
}

describe('Market Brief view model', () => {
  it('ranks the selected industry timeframe and excludes unavailable values', () => {
    const rows = [
      industry('Flat', 0),
      industry('Leader', 4),
      industry('Unavailable', null),
      industry('Laggard', -3),
    ];
    const result = rankIndustries(rows, 'ret1m');
    expect(result.leaders.map((row) => row.industry)).toEqual(['Leader', 'Flat', 'Laggard']);
    expect(result.laggards).toEqual([]);
  });

  it('keeps all five market-attention categories, including 52-week lows', () => {
    const categories = marketAttentionCategories(breadth());
    expect(categories.map((category) => category.id)).toEqual([
      'volume',
      'delivery',
      'highs',
      'lows',
      'buildup',
    ]);
    expect(categories[1]?.count).toBe(12);
  });

  it('omits empty attention categories instead of rendering empty tabs', () => {
    const categories = marketAttentionCategories(
      breadth({ leaders: { volume: [], delivery: [], highs: [], lows: [], buildup: [] } }),
    );
    expect(categories).toEqual([]);
  });

  it('merges personal movers with distinct watchlist reasons and prioritises changed names', () => {
    const watchlists = [{ watchlistId: 1, name: 'Core' }];
    const items = buildPersonalItems(
      [
        {
          instrumentId: 1,
          symbol: 'AAA',
          name: 'AAA Ltd',
          closePaise: 10_000,
          sessionReturn: 5,
          watchlists,
        },
        {
          instrumentId: 2,
          symbol: 'BBB',
          name: 'BBB Ltd',
          closePaise: 20_000,
          sessionReturn: 8,
          watchlists,
        },
      ],
      [
        {
          instrumentId: 1,
          symbol: 'AAA',
          name: 'AAA Ltd',
          eventType: 'crossed_above_ma20',
          direction: 'bullish',
          explanation: 'Crossed above its 20-day average.',
          closePaise: 10_000,
          sessionReturn: 5,
          watchlists,
        },
      ],
    );
    expect(items.map((item) => item.symbol)).toEqual(['AAA', 'BBB']);
    expect(items[0]?.reasons).toEqual(['Crossed above its 20-day average.']);
  });

  it('formats signed values without implying precision for unavailable data', () => {
    expect(signed(1.25, 2)).toBe('+1.25%');
    expect(signed(-1.25, 1, ' pp')).toBe('−1.3 pp');
    expect(signed(null)).toBe('—');
  });
});
