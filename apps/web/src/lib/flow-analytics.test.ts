import { describe, expect, it } from 'vitest';
import type { DealDto, FiiDiiDayDto } from '@/lib/disclosure-types';
import {
  aggregateByClient,
  type DealFilters,
  filterDeals,
  monthBars,
  sessionBars,
} from './flow-analytics';

/** A session whose gross buy is 100 and sell is 100 − net, so sums are checkable. */
function day(date: string, fiiNet: number | null, diiNet: number | null): FiiDiiDayDto {
  return {
    tradingDate: date,
    fii: fiiNet === null ? null : { buy: 100, sell: 100 - fiiNet, net: fiiNet },
    dii: diiNet === null ? null : { buy: 100, sell: 100 - diiNet, net: diiNet },
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

describe('sessionBars', () => {
  // Newest-first, as the server sends it.
  const fiiDii = [day('2026-09-14', 30, 3), day('2026-09-11', 20, null), day('2026-09-10', 10, -1)];

  it('takes the latest sessions and orders them oldest → newest', () => {
    const bars = sessionBars(fiiDii, 2);
    expect(bars.map((b) => b.key)).toEqual(['2026-09-11', '2026-09-14']);
    expect(bars.map((b) => b.fii?.net)).toEqual([20, 30]);
    expect(bars.every((b) => b.sessions === 1)).toBe(true);
  });

  it('keeps an absent participant as null, not zero', () => {
    expect(sessionBars(fiiDii, 3)[1]?.dii).toBeNull();
  });
});

describe('monthBars', () => {
  // Newest-first: two September sessions, one October.
  const fiiDii = [day('2026-10-01', 40, 4), day('2026-09-30', 30, null), day('2026-09-29', 20, -2)];

  it('sums buy, sell and net per calendar month, oldest first', () => {
    const months = monthBars(fiiDii);
    expect(months.map((m) => m.key)).toEqual(['2026-09', '2026-10']);
    expect(months[0]).toMatchObject({
      firstDate: '2026-09-29',
      lastDate: '2026-09-30',
      sessions: 2,
      // FII: buys 100 + 100, sells (100 − 20) + (100 − 30), net 20 + 30.
      fii: { buy: 200, sell: 150, net: 50 },
      // DII reported only on 29 Sep.
      dii: { buy: 100, sell: 102, net: -2 },
    });
    expect(months[1]?.sessions).toBe(1);
  });

  it('is null for a participant with no session in the month', () => {
    expect(monthBars([day('2026-09-30', 30, null)])[0]?.dii).toBeNull();
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
