import { describe, expect, it } from 'vitest';
import type { DealDto, FiiDiiDayDto } from '@/lib/disclosure-types';
import {
  aggregateByClient,
  cumulativeSeries,
  type DealFilters,
  filterDeals,
  netSeries,
} from './flow-analytics';

function day(date: string, fiiNet: number | null, diiNet: number | null): FiiDiiDayDto {
  return {
    tradingDate: date,
    fii: fiiNet === null ? null : { buy: 0, sell: 0, net: fiiNet },
    dii: diiNet === null ? null : { buy: 0, sell: 0, net: diiNet },
  };
}

function deal(partial: Partial<DealDto>): DealDto {
  return {
    id: 1,
    dealType: 'bulk',
    tradingDate: '2026-09-11',
    instrumentId: null,
    symbol: 'ACME',
    companyName: 'Acme',
    clientName: 'Someone',
    side: 'buy',
    quantity: 100,
    price: 10_000,
    value: 1_000_000,
    exchange: 'NSE',
    onWatchlist: false,
    ...partial,
  };
}

describe('netSeries', () => {
  it('reverses to oldest→newest and skips absent participants', () => {
    // Input is newest-first.
    const fiiDii = [day('2026-09-12', 200, null), day('2026-09-11', 100, -50)];
    const fii = netSeries(fiiDii, 'fii');
    expect(fii.map((p) => p.date)).toEqual(['2026-09-11', '2026-09-12']);
    expect(fii.map((p) => p.value)).toEqual([100, 200]);

    const dii = netSeries(fiiDii, 'dii');
    // Only 09-11 has a DII row.
    expect(dii).toEqual([{ date: '2026-09-11', value: -50 }]);
  });
});

describe('cumulativeSeries', () => {
  it('accumulates the running total', () => {
    const out = cumulativeSeries([
      { date: 'a', value: 100 },
      { date: 'b', value: -30 },
      { date: 'c', value: 50 },
    ]);
    expect(out.map((p) => p.value)).toEqual([100, 70, 120]);
  });
});

describe('aggregateByClient', () => {
  it('nets buys against sells and groups case/space-insensitively', () => {
    const result = aggregateByClient([
      deal({ clientName: 'LIC of India', side: 'buy', value: 300 }),
      deal({ clientName: 'lic of  india', side: 'sell', value: 100 }),
      deal({ clientName: 'Morgan Stanley', side: 'sell', value: 500 }),
    ]);
    expect(result).toHaveLength(2);
    // Sorted by net desc: LIC net +200 first, Morgan Stanley -500 next.
    expect(result[0]?.client).toBe('LIC of India');
    expect(result[0]?.net).toBe(200);
    expect(result[0]?.deals).toBe(2);
    expect(result[1]?.net).toBe(-500);
  });
});

describe('filterDeals', () => {
  const deals = [
    deal({ id: 1, side: 'buy', dealType: 'bulk', value: 2_000_000, tradingDate: '2026-09-11' }),
    deal({ id: 2, side: 'sell', dealType: 'block', value: 500_000, tradingDate: '2026-09-10' }),
    deal({ id: 3, side: 'buy', dealType: 'block', value: 9_000_000, tradingDate: '2026-09-12' }),
  ];
  const base: DealFilters = { side: 'all', type: 'all', minValue: 0, since: null };

  it('filters by side', () => {
    expect(filterDeals(deals, { ...base, side: 'sell' }).map((d) => d.id)).toEqual([2]);
  });
  it('filters by type', () => {
    expect(filterDeals(deals, { ...base, type: 'block' }).map((d) => d.id)).toEqual([2, 3]);
  });
  it('filters by minimum value', () => {
    expect(filterDeals(deals, { ...base, minValue: 1_000_000 }).map((d) => d.id)).toEqual([1, 3]);
  });
  it('filters by since date', () => {
    expect(filterDeals(deals, { ...base, since: '2026-09-11' }).map((d) => d.id)).toEqual([1, 3]);
  });
});
