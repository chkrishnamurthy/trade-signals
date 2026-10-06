import { describe, expect, it } from 'vitest';
import { composeAnalysis, type HoldingRef } from './portfolio-analysis';
import { OTHER_SECTORS, UNCLASSIFIED_SECTOR } from './portfolio-facts';
import type { PortfolioDto, PortfolioHoldingDto } from './portfolio-types';

const holding = (
  id: number,
  valuePaise: number | null,
  costPaise: number,
  weight: number | null,
): PortfolioHoldingDto => ({
  instrumentId: id,
  symbol: `S${id}`,
  name: `Stock ${id}`,
  shares: 10,
  costPaise,
  avgCostPaise: costPaise / 10,
  ltpPaise: valuePaise === null ? null : valuePaise / 10,
  priceSource: valuePaise === null ? null : 'quote',
  priceAsOf: null,
  valuePaise,
  gainPaise: valuePaise === null ? null : valuePaise - costPaise,
  gainRatio: valuePaise === null ? null : (valuePaise - costPaise) / costPaise,
  dayChangePaise: null,
  dayChangeRatio: null,
  weight,
  adjustments: [],
  historyGapBefore: null,
});

const dto = (holdings: PortfolioHoldingDto[]): PortfolioDto => ({
  holdings,
  entries: [],
  entryCount: holdings.length,
  entryLimit: 5000,
  totals: {
    valuePaise: 0,
    costPaise: 0,
    pricedCostPaise: 0,
    gainPaise: 0,
    gainRatio: null,
    dayChangePaise: 0,
    dayChangeRatio: null,
    unpriced: 0,
  },
  pricesAsOf: null,
  pricesStale: false,
  problems: [],
  upcoming: [],
  returns: null,
  hasRemovals: false,
});

describe('composeAnalysis', () => {
  it('leaves unpriced holdings out, and says how many and what they cost', () => {
    const a = composeAnalysis(
      dto([holding(1, 1000, 800, 1), holding(2, null, 500, null)]),
      new Map(),
    );
    expect(a.holdings.map((h) => h.symbol)).toEqual(['S1']);
    expect(a.unpriced).toEqual({ count: 1, costPaise: 500 });
    expect(a.attention[0]).toBe('1 holding has no price yet and is left out of these figures.');
  });

  it('is empty, not broken, when nothing has a price', () => {
    const a = composeAnalysis(dto([holding(1, null, 500, null)]), new Map());
    expect(a.holdingCount).toBe(1);
    expect(a.holdings).toEqual([]);
    expect(a.sectors).toEqual([]);
    expect(a.concentration).toBeNull();
    expect(a.contributors).toEqual([]);
  });

  it('labels missing sectors honestly and maps index membership to size', () => {
    const ref = new Map<number, HoldingRef>([[1, { industry: 'Banks', indexKeys: ['nifty100'] }]]);
    const a = composeAnalysis(dto([holding(1, 600, 500, 0.6), holding(2, 400, 500, 0.4)]), ref);
    expect(a.sectors.map((s) => s.key)).toEqual(['Banks', UNCLASSIFIED_SECTOR]);
    expect(a.holdings.map((h) => h.size)).toEqual(['large', 'other']);
  });

  it('takes company size from the AMFI list, and from the index for a stock it lacks, saying how many', () => {
    const ref = new Map<number, HoldingRef>([
      // Large on AMFI's list although the index says nothing.
      [1, { industry: null, indexKeys: [], amfiCategory: 'large' }],
      // Not on the list: a micro-cap index membership counts as small, as SEBI has no micro cap.
      [2, { industry: null, indexKeys: ['niftymicrocap250'], amfiCategory: null }],
      // Not on the list and in no index.
      [3, { industry: null, indexKeys: [] }],
    ]);
    const a = composeAnalysis(
      dto([holding(1, 500, 400, 0.5), holding(2, 300, 400, 0.3), holding(3, 200, 400, 0.2)]),
      ref,
      '2026-06-30',
    );
    expect(a.holdings.map((h) => h.size)).toEqual(['large', 'small', 'other']);
    expect(a.sizes.map((g) => [g.key, g.label])).toEqual([
      ['large', 'Large cap'],
      ['small', 'Small cap'],
      ['other', 'Not categorised'],
    ]);
    expect(a.sizeBasis).toEqual({ amfiPeriod: '2026-06-30', indexCount: 2 });
  });

  it('says no AMFI list is loaded when none is on file', () => {
    expect(composeAnalysis(dto([holding(1, 600, 500, 1)]), new Map()).sizeBasis).toEqual({
      amfiPeriod: null,
      indexCount: 1,
    });
  });

  it('folds sectors past the eighth into Other sectors and draws those holdings in it', () => {
    const many = Array.from({ length: 10 }, (_, i) => holding(i + 1, 1000 - i * 50, 500, null));
    const ref = new Map<number, HoldingRef>(
      many.map((h, i) => [h.instrumentId, { industry: `Sector ${i}`, indexKeys: [] }]),
    );
    const a = composeAnalysis(dto(many), ref);
    expect(a.sectors).toHaveLength(8);
    expect(a.sectors.at(-1)).toMatchObject({ key: OTHER_SECTORS, count: 3 });
    expect(a.holdings.filter((h) => h.sectorGroup === OTHER_SECTORS).map((h) => h.sector)).toEqual([
      'Sector 7',
      'Sector 8',
      'Sector 9',
    ]);
  });

  it('counts every holding with a gain even when the bars show fewer', () => {
    const many = Array.from({ length: 12 }, (_, i) => holding(i + 1, 1000 + i, 900, null));
    const a = composeAnalysis(dto(many), new Map());
    expect(a.contributors).toHaveLength(8);
    expect(a.contributorsTotal).toBe(12);
  });
});
