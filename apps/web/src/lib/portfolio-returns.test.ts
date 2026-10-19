import { derivePortfolio, type PortfolioEntry } from '@equitywise/core';
import { describe, expect, it } from 'vitest';
import {
  composeReturns,
  fillQuarters,
  historyGapBefore,
  lotsFor,
  priceLookup,
  purchaseHistory,
  realisedCsv,
  valueForReturns,
} from './portfolio-returns';
import type { PortfolioHoldingDto } from './portfolio-types';

const e = (
  id: number,
  kind: PortfolioEntry['kind'],
  tradeDate: string,
  shares: number,
  amountPaise: number,
  instrumentId = 1,
): PortfolioEntry => ({
  id,
  instrumentId,
  kind,
  tradeDate,
  shares,
  amountPaise,
});

const holding = (over: Partial<PortfolioHoldingDto>): PortfolioHoldingDto => ({
  instrumentId: 1,
  symbol: 'AAA',
  name: 'Alpha',
  shares: 5,
  costPaise: 50_000,
  avgCostPaise: 10_000,
  ltpPaise: 15_000,
  priceSource: 'quote',
  priceAsOf: null,
  valuePaise: 75_000,
  gainPaise: 25_000,
  gainRatio: 0.5,
  dayChangePaise: null,
  dayChangeRatio: null,
  weight: 1,
  adjustments: [],
  historyGapBefore: null,
  ...over,
});

describe('priceLookup', () => {
  const look = priceLookup(
    new Map([
      [
        1,
        [
          { date: '2025-01-02', closePaise: 100 },
          { date: '2025-01-06', closePaise: 110 },
        ],
      ],
    ]),
  );
  it('gives the last close on or before a date', () => {
    expect(look(1, '2025-01-01')).toBeNull();
    expect(look(1, '2025-01-02')).toBe(100);
    expect(look(1, '2025-01-05')).toBe(100);
    expect(look(1, '2025-01-10')).toBe(110);
    expect(look(2, '2025-01-10')).toBeNull();
  });
});

describe('valueForReturns', () => {
  it('counts an unpriced holding at what was paid', () => {
    expect(
      valueForReturns([
        holding({}),
        holding({ instrumentId: 2, valuePaise: null, costPaise: 9_000 }),
      ]),
    ).toEqual({ valuePaise: 84_000, unpriced: 1 });
  });
});

describe('composeReturns', () => {
  const entries = [
    e(1, 'add', '2024-01-02', 10, 100_000),
    e(2, 'remove', '2025-03-03', 5, 70_000),
    e(3, 'add', '2024-06-03', 2, 30_000, 2),
    e(4, 'remove', '2024-09-02', 2, 26_000, 2),
  ];
  const derived = derivePortfolio(entries, []);
  const returns = composeReturns({
    entries,
    names: new Map([
      [1, { symbol: 'AAA', name: 'Alpha' }],
      [2, { symbol: 'BBB', name: 'Beta' }],
    ]),
    changes: [],
    derived,
    holdings: [holding({})],
    closes: new Map([
      [
        1,
        [
          { date: '2024-01-02', closePaise: 10_000 },
          { date: '2025-10-03', closePaise: 15_000 },
        ],
      ],
      [2, [{ date: '2024-06-03', closePaise: 15_000 }]],
    ]),
    dividendRecords: [{ instrumentId: 1, exDate: '2024-07-01', amountPaise: 500 }],
    today: '2025-10-03',
    historyFrom: '2016-10-07',
  });

  it('totals realised by term and year, newest removal first', () => {
    expect(returns.realised).toMatchObject({
      longTermPaise: 20_000,
      shortTermPaise: -4_000,
      totalPaise: 16_000,
      count: 2,
    });
    expect(returns.realised.byYear.map((y) => y.year)).toEqual(['2024-25']);
    expect(returns.realisedRows.map((r) => [r.symbol, r.term, r.gainPaise])).toEqual([
      ['AAA', 'long', 20_000],
      ['BBB', 'short', -4_000],
    ]);
  });
  it('counts dividends on shares held before the ex-date', () => {
    expect(returns.dividends).toMatchObject({ totalPaise: 5_000, unknownCount: 0 });
    expect(returns.dividends.byQuarter).toEqual([{ label: '2024 Q3', amountPaise: 5_000 }]);
  });
  it('adds up each stock, including one no longer held', () => {
    expect(returns.perHolding).toEqual([
      expect.objectContaining({
        symbol: 'AAA',
        held: true,
        unrealisedPaise: 25_000,
        realisedPaise: 20_000,
        dividendsPaise: 5_000,
        totalPaise: 50_000,
      }),
      expect.objectContaining({
        symbol: 'BBB',
        held: false,
        unrealisedPaise: null,
        realisedPaise: -4_000,
        totalPaise: -4_000,
        yieldOnCost: null,
      }),
    ]);
  });
  it('gives a yearly return once there is a year of history', () => {
    expect(returns.summary.status).toBe('ok');
    expect(returns.summary).toMatchObject({
      investedPaise: 130_000,
      withdrawnPaise: 96_000,
      dividendsPaise: 5_000,
      valuePaise: 75_000,
    });
    expect(returns.series.at(-1)).toMatchObject({ date: '2025-10-03', valuePaise: 75_000 });
  });
});

describe('lotsFor', () => {
  it('says how long each purchase has been held and when it turns long term', () => {
    const derived = derivePortfolio(
      [e(1, 'add', '2025-01-10', 3, 300), e(2, 'add', '2024-01-01', 1, 100)],
      [],
    );
    expect(lotsFor(derived, 1, '2025-10-05')).toEqual([
      {
        acquiredOn: '2024-01-01',
        trackedFrom: '2024-01-01',
        shares: 1,
        costPaise: 100,
        daysHeld: 643,
        daysToLongTerm: 0,
      },
      {
        acquiredOn: '2025-01-10',
        trackedFrom: '2025-01-10',
        shares: 3,
        costPaise: 300,
        daysHeld: 268,
        daysToLongTerm: 98,
      },
    ]);
  });
});

describe('realisedCsv', () => {
  it('writes rupees from paise exactly and labels the file', () => {
    const csv = realisedCsv([
      {
        symbol: 'AAA',
        name: 'Alpha "A"',
        acquiredOn: '2024-01-02',
        removedOn: '2025-03-03',
        shares: 5,
        costPaise: 50_005,
        proceedsPaise: 70_000,
        gainPaise: -5,
        daysHeld: 426,
        term: 'long',
        financialYear: '2024-25',
      },
    ]).split('\n');
    expect(csv[0]).toContain('Not a tax computation');
    expect(csv[2]).toBe(
      '"AAA","Alpha ""A""",2024-01-02,2025-03-03,5,500.05,700.00,-0.05,426,Long term,FY 2024-25',
    );
  });
});

describe('fillQuarters', () => {
  it('keeps empty quarters between the first and last so bars stay in time', () => {
    expect(
      fillQuarters(
        new Map([
          ['2025 Q3', 5],
          ['2026 Q2', 7],
        ]),
      ),
    ).toEqual([
      { label: '2025 Q3', amountPaise: 5 },
      { label: '2025 Q4', amountPaise: 0 },
      { label: '2026 Q1', amountPaise: 0 },
      { label: '2026 Q2', amountPaise: 7 },
    ]);
    expect(fillQuarters(new Map())).toEqual([]);
  });
});

describe('purchaseHistory', () => {
  it('shows each purchase with what was removed from it and what is left, after a split', () => {
    const entries = [
      e(1, 'add', '2024-01-10', 10, 100_000),
      e(2, 'add', '2024-06-10', 10, 150_000),
      e(3, 'remove', '2025-03-03', 30, 450_000),
    ];
    // A 1-into-2 split in Jan 2025: 20 + 20 shares on today's basis.
    const changes = [{ instrumentId: 1, kind: 'split', exDate: '2025-01-06', ratio: 0.5 }];
    const history = purchaseHistory(entries, changes, derivePortfolio(entries, changes), 1);
    expect(history).toEqual([
      {
        acquiredOn: '2024-01-10',
        trackedFrom: '2024-01-10',
        shares: 20,
        costPaise: 100_000,
        removed: [
          {
            removedOn: '2025-03-03',
            shares: 20,
            proceedsPaise: 300_000,
            gainPaise: 200_000,
            term: 'long',
          },
        ],
        leftShares: 0,
      },
      {
        acquiredOn: '2024-06-10',
        trackedFrom: '2024-06-10',
        shares: 20,
        costPaise: 150_000,
        removed: [
          {
            removedOn: '2025-03-03',
            shares: 10,
            proceedsPaise: 150_000,
            gainPaise: 75_000,
            term: 'short',
          },
        ],
        leftShares: 10,
      },
    ]);
  });
});

describe('historyGapBefore', () => {
  it('looks at the date the count was entered, not the date the shares were first bought', () => {
    // Typed today for shares bought in 2016: already on today's basis, nothing missing.
    expect(historyGapBefore([{ trackedFrom: '2026-10-05' }], '2024-10-05')).toBeNull();
    // Entered in 2023, before the record begins: a split since then may be missing.
    expect(historyGapBefore([{ trackedFrom: '2023-01-01' }], '2024-10-05')).toBe('2024-10-05');
    expect(historyGapBefore([{ trackedFrom: '2023-01-01' }], null)).toBeNull();
  });
});
