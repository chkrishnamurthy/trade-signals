import { derivePortfolio, type PortfolioEntry } from '@equitywise/core';
import { describe, expect, it } from 'vitest';
import { composeBenchmark, composeTax, taxCsv } from './portfolio-tax';

const e = (
  id: number,
  kind: PortfolioEntry['kind'],
  tradeDate: string,
  shares: number,
  amountPaise: number,
  over: Partial<PortfolioEntry> = {},
): PortfolioEntry => ({ id, instrumentId: 1, kind, tradeDate, shares, amountPaise, ...over });

const names = new Map([[1, { symbol: 'ITC', name: 'ITC' }]]);

describe('composeTax', () => {
  const entries = [
    e(1, 'opening', '2024-04-01', 100, 2_500_000, { acquiredOn: '2016-06-15' }),
    e(2, 'add', '2025-06-02', 50, 2_000_000),
    e(3, 'remove', '2025-08-12', 100, 3_878_100),
  ];
  const tax = composeTax({
    entries,
    changes: [],
    derived: derivePortfolio(entries, []),
    names,
    isins: new Map([[1, 'INE154A01025']]),
    fmv2018: new Map([[1, 27_000]]),
    fmvLoaded: true,
    dividendRecords: [{ instrumentId: 1, exDate: '2025-06-03', amountPaise: 785 }],
    today: '2026-04-10',
  });
  it('lists the current year and every year with a sale, newest first', () => {
    expect(tax.years).toEqual(['2026-27', '2025-26']);
    expect(tax.byYear['2026-27']?.rows).toEqual([]);
  });
  it('applies the 2018 rule and the exemption, so no tax on this gain', () => {
    const y = tax.byYear['2025-26'];
    expect(y?.rows[0]).toMatchObject({
      isin: 'INE154A01025',
      costUsedPaise: 2_700_000,
      gainPaise: 1_178_100,
      grandfathered: true,
      term: 'long',
    });
    expect(y).toMatchObject({
      netLongTermPaise: 1_178_100,
      exemptionUsedPaise: 1_178_100,
      totalTaxPaise: 0,
      dividendsPaise: 150 * 785,
    });
  });
  it('names purchases passing 12 months in the next 90 days', () => {
    expect(tax.turningLongTerm).toEqual([
      expect.objectContaining({ symbol: 'ITC', shares: 50, daysToLongTerm: 54 }),
    ]);
  });
  it('writes the accountant CSV with per-share sale price and 31 Jan 2018 value', () => {
    const y = tax.byYear['2025-26'];
    if (y === undefined) throw new Error('unreachable');
    const lines = taxCsv(y).split('\n');
    expect(lines[0]).toContain('Not tax advice');
    expect(lines[2]).toBe(
      '"INE154A01025","ITC","ITC",2016-06-15,2025-08-12,100,387.81,38781.00,25000.00,270.00,27000.00,27000.00,11781.00,3345,Long term,No,""',
    );
  });
});

describe('composeBenchmark', () => {
  const closes = new Map([
    [
      1,
      [
        { date: '2025-01-01', closePaise: 1_000 },
        { date: '2025-01-02', closePaise: 1_100 },
        { date: '2025-01-03', closePaise: 1_210 },
      ],
    ],
  ]);
  const index = [
    { date: '2024-12-31', closePaise: 10_000 },
    { date: '2025-01-02', closePaise: 10_500 },
    { date: '2025-01-03', closePaise: 11_000 },
  ];
  const b = composeBenchmark({
    entries: [e(1, 'add', '2025-01-01', 10, 10_000)],
    changes: [],
    closes,
    indexCloses: new Map([['NIFTY50', index]]),
    valuePaise: 12_100,
    today: '2025-01-03',
  });
  it('replays the money into the loaded index and leaves the other out', () => {
    expect(b.available).toBe(true);
    expect(b.indices[0]?.replay).toMatchObject({
      investedPaise: 10_000,
      valuePaise: 11_000,
      status: 'too_short',
    });
    expect(b.indices[1]?.replay).toBeNull();
  });
  it('gives growth of 100 for you and the index from the same start', () => {
    expect(
      b.growth.map((g) => [
        g.date,
        Math.round(g.yours),
        g.nifty50 === null ? null : Math.round(g.nifty50),
      ]),
    ).toEqual([
      ['2025-01-01', 100, 100],
      ['2025-01-02', 110, 105],
      ['2025-01-03', 121, 110],
    ]);
    expect(b.periods.all).toBeCloseTo(0.21, 10);
  });
  it('gives your return without dividends for a like-for-like comparison', () => {
    expect(b.yoursPriceOnly.simpleReturn).toBeCloseTo(0.21, 10);
    expect(b.from).toBe('2025-01-01');
  });
});
