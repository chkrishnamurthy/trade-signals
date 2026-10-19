import { describe, expect, it } from 'vitest';
import { derivePortfolio, type PortfolioEntry, termOf } from './derive.js';
import {
  dividendsReceived,
  dividendYieldOnCost,
  financialYear,
  samplePoints,
  sharesHeldAt,
  summariseRealised,
  summariseReturns,
  valueSeries,
  xirr,
} from './returns.js';

const e = (
  id: number,
  kind: PortfolioEntry['kind'],
  tradeDate: string,
  shares: number,
  amountPaise: number,
  over: Partial<PortfolioEntry> = {},
): PortfolioEntry => ({ id, instrumentId: 1, kind, tradeDate, shares, amountPaise, ...over });

describe('termOf — more than twelve months', () => {
  it('is short on the anniversary and long the day after', () => {
    expect(termOf('2025-01-10', '2026-01-10')).toBe('short');
    expect(termOf('2025-01-10', '2026-01-11')).toBe('long');
    expect(termOf('2024-02-29', '2025-03-01')).toBe('short');
    expect(termOf('2024-02-29', '2025-03-02')).toBe('long');
  });
});

describe('financialYear', () => {
  it('runs April to March', () => {
    expect(financialYear('2025-03-31')).toBe('2024-25');
    expect(financialYear('2025-04-01')).toBe('2025-26');
    expect(financialYear('2000-12-01')).toBe('2000-01');
  });
});

describe('FIFO realisations', () => {
  it('splits one removal across lots, with each lot’s term, and proceeds that add up', () => {
    const r = derivePortfolio(
      [
        e(1, 'add', '2024-01-01', 10, 100_000),
        e(2, 'add', '2025-06-01', 10, 150_000),
        e(3, 'remove', '2025-09-01', 15, 300_000),
      ],
      [],
    );
    expect(
      r.realisations.map((x) => [x.lotEntryId, x.shares, x.costPaise, x.proceedsPaise, x.term]),
    ).toEqual([
      [1, 10, 100_000, 200_000, 'long'],
      [2, 5, 75_000, 100_000, 'short'],
    ]);
    const s = summariseRealised(r.realisations);
    expect(s).toMatchObject({
      longTermPaise: 100_000,
      shortTermPaise: 25_000,
      totalPaise: 125_000,
      count: 2,
    });
    expect(s.byYear).toEqual([expect.objectContaining({ year: '2025-26', totalPaise: 125_000 })]);
  });
  it('uses the real purchase date of an opening balance for the term', () => {
    const r = derivePortfolio(
      [
        e(1, 'opening', '2025-10-01', 10, 50_000, { acquiredOn: '2020-05-05' }),
        e(2, 'remove', '2025-11-01', 10, 90_000),
      ],
      [],
    );
    expect(r.realisations[0]).toMatchObject({
      acquiredOn: '2020-05-05',
      term: 'long',
      intraday: false,
    });
  });
  it('takes the earliest-acquired lot first even if it was entered later', () => {
    const r = derivePortfolio(
      [
        e(1, 'add', '2025-01-01', 5, 10_000),
        e(2, 'opening', '2025-02-01', 5, 5_000, { acquiredOn: '2019-01-01' }),
        e(3, 'remove', '2025-03-01', 5, 20_000),
      ],
      [],
    );
    expect(r.realisations[0]?.lotEntryId).toBe(2);
  });
  it('marks a same-day round trip as intraday and keeps it out of short and long', () => {
    const r = derivePortfolio(
      [e(1, 'add', '2025-09-02', 10, 30_000), e(2, 'remove', '2025-09-02', 10, 30_100)],
      [],
    );
    expect(r.realisations[0]?.intraday).toBe(true);
    expect(summariseRealised(r.realisations)).toMatchObject({
      intradayPaise: 100,
      shortTermPaise: 0,
      longTermPaise: 0,
    });
  });
});

describe('dividendsReceived', () => {
  const split = { instrumentId: 1, kind: 'split', exDate: '2025-06-01', ratio: 0.5 };
  it('pays shares held at the close before the ex-date, on the ex-date’s basis', () => {
    const entries = [
      e(1, 'add', '2025-01-01', 10, 1),
      e(2, 'add', '2025-07-10', 4, 1),
      e(3, 'remove', '2025-08-01', 6, 1),
    ];
    const got = dividendsReceived(
      entries,
      [split],
      [
        { instrumentId: 1, exDate: '2025-03-01', amountPaise: 500 }, // 10 shares, before the split
        { instrumentId: 1, exDate: '2025-07-10', amountPaise: 300 }, // 20 after split; the 4 added on the ex-date do not count
        { instrumentId: 1, exDate: '2025-07-10', amountPaise: 100 }, // special on the same day adds up
        { instrumentId: 1, exDate: '2025-09-01', amountPaise: null }, // 18 held, amount unknown
      ],
    );
    expect(got.map((d) => [d.exDate, d.shares, d.perSharePaise, d.amountPaise])).toEqual([
      ['2025-03-01', 10, 500, 5_000],
      ['2025-07-10', 20, 400, 8_000],
      ['2025-09-01', 18, null, null],
    ]);
  });
  it('pays nothing when nothing was held', () => {
    expect(
      dividendsReceived(
        [e(1, 'add', '2025-05-01', 1, 1)],
        [],
        [{ instrumentId: 1, exDate: '2025-04-01', amountPaise: 1 }],
      ),
    ).toEqual([]);
  });
  it('restates shares held on a date to that date’s basis', () => {
    const entries = [e(1, 'add', '2025-01-01', 10, 1)];
    expect(sharesHeldAt(entries, [split], 1, '2025-05-31')).toBe(10);
    expect(sharesHeldAt(entries, [split], 1, '2025-06-01')).toBe(20);
    expect(sharesHeldAt(entries, [split], 1, '2024-12-31')).toBe(0);
  });
});

describe('xirr', () => {
  it('matches the spreadsheet XIRR on the textbook example', () => {
    const rate = xirr([
      { date: '2008-01-01', amountPaise: -10_000 },
      { date: '2008-03-01', amountPaise: 2_750 },
      { date: '2008-10-30', amountPaise: 4_250 },
      { date: '2009-02-15', amountPaise: 3_250 },
      { date: '2009-04-01', amountPaise: 2_750 },
    ]);
    expect(rate).toBeCloseTo(0.373362535, 6);
  });
  it('is the plain growth rate for one deposit and one withdrawal a year apart', () => {
    expect(
      xirr([
        { date: '2021-01-01', amountPaise: -1_000 },
        { date: '2022-01-01', amountPaise: 1_100 },
      ]),
    ).toBeCloseTo(0.1, 8);
  });
  it('handles losses', () => {
    expect(
      xirr([
        { date: '2021-01-01', amountPaise: -1_000 },
        { date: '2022-01-01', amountPaise: 500 },
      ]),
    ).toBeCloseTo(-0.5, 8);
  });
  it('is null without money both in and out', () => {
    expect(xirr([{ date: '2021-01-01', amountPaise: -1_000 }])).toBeNull();
    expect(
      xirr([
        { date: '2021-01-01', amountPaise: 1_000 },
        { date: '2022-01-01', amountPaise: 5 },
      ]),
    ).toBeNull();
  });
});

describe('summariseReturns', () => {
  const noPrice = () => null;
  it('counts an opening balance at its market value that day, and gives no yearly figure under a year', () => {
    const s = summariseReturns({
      entries: [e(1, 'opening', '2026-06-01', 10, 50_000)],
      dividends: [],
      valuePaise: 120_000,
      today: '2026-10-05',
      priceOn: () => 10_000, // ₹100 a share on 1 Jun: invested is ₹1,000, not the ₹500 paid
    });
    expect(s).toMatchObject({
      trackingSince: '2026-06-01',
      investedPaise: 100_000,
      gainPaise: 20_000,
      status: 'too_short',
      xirr: null,
    });
    expect(s.simpleReturn).toBeCloseTo(0.2, 10);
  });
  it('includes withdrawals and dividends, and gives XIRR after a year', () => {
    const s = summariseReturns({
      entries: [e(1, 'add', '2024-01-01', 10, 100_000), e(2, 'remove', '2025-01-01', 5, 60_000)],
      dividends: [
        {
          instrumentId: 1,
          exDate: '2024-07-01',
          perSharePaise: 100,
          shares: 10,
          amountPaise: 1_000,
        },
      ],
      valuePaise: 65_000,
      today: '2025-12-31',
      priceOn: noPrice,
    });
    expect(s).toMatchObject({
      investedPaise: 100_000,
      withdrawnPaise: 60_000,
      dividendsPaise: 1_000,
      gainPaise: 26_000,
      status: 'ok',
    });
    expect(s.xirr).toBeGreaterThan(0.1);
    expect(s.xirr).toBeLessThan(0.2);
  });
  it('is empty with no entries', () => {
    expect(
      summariseReturns({
        entries: [],
        dividends: [],
        valuePaise: 0,
        today: '2026-01-01',
        priceOn: noPrice,
      }).status,
    ).toBe('empty');
  });
});

describe('valueSeries', () => {
  it('values each day on that day’s basis across a split, carries prices forward and flags gaps', () => {
    const split = { instrumentId: 1, kind: 'split', exDate: '2025-06-03', ratio: 0.5 };
    const closes = new Map([
      [
        1,
        [
          { date: '2025-06-02', closePaise: 1_000 },
          { date: '2025-06-03', closePaise: 500 },
          { date: '2025-06-04', closePaise: 520 },
        ],
      ],
    ]);
    const points = valueSeries({
      entries: [e(1, 'add', '2025-06-02', 10, 9_000)],
      changes: [split],
      closes,
      to: '2025-06-04',
      priceOn: () => null,
    });
    expect(points).toEqual([
      { date: '2025-06-02', valuePaise: 10_000, netInvestedPaise: 9_000, partial: false },
      { date: '2025-06-03', valuePaise: 10_000, netInvestedPaise: 9_000, partial: false },
      { date: '2025-06-04', valuePaise: 10_400, netInvestedPaise: 9_000, partial: false },
    ]);
  });
  it('values a stock at cost and marks the day partial before its first close', () => {
    const points = valueSeries({
      entries: [
        e(1, 'add', '2025-06-02', 10, 9_000),
        e(2, 'add', '2025-06-02', 1, 500, { instrumentId: 2 }),
      ],
      changes: [],
      closes: new Map([[1, [{ date: '2025-06-02', closePaise: 1_000 }]]]),
      to: '2025-06-02',
      priceOn: () => null,
    });
    expect(points[0]).toEqual({
      date: '2025-06-02',
      valuePaise: 10_500,
      netInvestedPaise: 9_500,
      partial: true,
    });
  });
});

describe('samplePoints', () => {
  it('keeps every day in the last year and one point a week before it', () => {
    const days = [
      '2024-01-01',
      '2024-01-02',
      '2024-01-08',
      '2024-01-09',
      '2025-12-30',
      '2025-12-31',
    ].map((date) => ({ date }));
    expect(samplePoints(days, '2026-01-01').map((p) => p.date)).toEqual([
      '2024-01-02',
      '2024-01-09',
      '2025-12-30',
      '2025-12-31',
    ]);
  });
});

describe('dividendYieldOnCost', () => {
  it('adds the last year of dividends and divides by cost', () => {
    const d = [
      { instrumentId: 1, exDate: '2025-11-01', perSharePaise: 100, shares: 10, amountPaise: 1_000 },
      { instrumentId: 1, exDate: '2024-01-01', perSharePaise: 100, shares: 10, amountPaise: 1_000 },
    ];
    expect(dividendYieldOnCost(d, 1, 20_000, '2026-10-05')).toBeCloseTo(0.05, 10);
    expect(dividendYieldOnCost(d, 1, 0, '2026-10-05')).toBeNull();
  });
});

describe('openings counted at cost', () => {
  it('counts an opening balance with no stored close on its date, and values one that has a close', () => {
    const entries = [
      {
        id: 1,
        instrumentId: 1,
        kind: 'opening' as const,
        tradeDate: '2025-01-01',
        shares: 10,
        amountPaise: 100_000,
      },
      {
        id: 2,
        instrumentId: 2,
        kind: 'opening' as const,
        tradeDate: '2025-01-01',
        shares: 10,
        amountPaise: 100_000,
      },
    ];
    const summary = summariseReturns({
      entries,
      dividends: [],
      valuePaise: 250_000,
      today: '2025-06-01',
      // Stock 1 has a close of ₹120 that day; stock 2 has none stored.
      priceOn: (id) => (id === 1 ? 12_000 : null),
    });
    expect(summary.openingsAtCost).toBe(1);
    // Stock 1 at market (10 × ₹120), stock 2 at what was paid (₹1,000).
    expect(summary.investedPaise).toBe(120_000 + 100_000);
  });
});
