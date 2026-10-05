import { describe, expect, it } from 'vitest';
import { benchmarkReplay, indexGrowth, periodReturns, timeWeightedGrowth } from './benchmark.js';
import type { PortfolioEntry } from './derive.js';
import {
  longTermExemptionPaise,
  ratesOn,
  summariseTaxYear,
  type TaxRealisation,
  taxRealisations,
  taxYears,
} from './tax.js';

const e = (
  id: number,
  kind: PortfolioEntry['kind'],
  tradeDate: string,
  shares: number,
  amountPaise: number,
  over: Partial<PortfolioEntry> = {},
): PortfolioEntry => ({ id, instrumentId: 1, kind, tradeDate, shares, amountPaise, ...over });

const rs = (rupees: number) => Math.round(rupees * 100);

describe('rates and exemption', () => {
  it('switches rates on 23 Jul 2024 and the exemption from FY 2024-25', () => {
    expect(ratesOn('2024-07-22')).toEqual({ shortTerm: 0.15, longTerm: 0.1 });
    expect(ratesOn('2024-07-23')).toEqual({ shortTerm: 0.2, longTerm: 0.125 });
    expect(longTermExemptionPaise('2023-24')).toBe(rs(100_000));
    expect(longTermExemptionPaise('2024-25')).toBe(rs(125_000));
  });
});

describe('taxRealisations — the 2018 rule', () => {
  const fmv = new Map([[1, rs(270)]]);
  it('raises the cost to the 31 Jan 2018 value, capped at the sale value', () => {
    // 100 shares bought 15 Jun 2016 for ₹25,000; worth ₹270 a share on 31 Jan 2018.
    const sold = (proceeds: number) =>
      taxRealisations(
        [
          e(1, 'add', '2016-06-15', 100, rs(25_000)),
          e(2, 'remove', '2025-08-12', 100, rs(proceeds)),
        ],
        [],
        fmv,
      )[0];
    expect(sold(38_781)).toMatchObject({
      costUsedPaise: rs(27_000),
      gainPaise: rs(11_781),
      grandfathered: true,
      term: 'long',
    });
    expect(sold(26_000)).toMatchObject({
      costUsedPaise: rs(26_000),
      gainPaise: 0,
      grandfathered: true,
    });
    expect(sold(24_000)).toMatchObject({
      costUsedPaise: rs(25_000),
      gainPaise: -rs(1_000),
      grandfathered: false,
    });
  });
  it('does not apply to short-term sales or to shares bought after January 2018', () => {
    const short = taxRealisations(
      [e(1, 'add', '2018-01-10', 10, rs(2_000)), e(2, 'remove', '2018-06-01', 10, rs(5_000))],
      [],
      fmv,
    )[0];
    expect(short).toMatchObject({ term: 'short', costUsedPaise: rs(2_000), fmvPaise: null });
    const later = taxRealisations(
      [e(1, 'add', '2018-03-01', 10, rs(2_000)), e(2, 'remove', '2020-06-01', 10, rs(5_000))],
      [],
      fmv,
    )[0];
    expect(later).toMatchObject({ term: 'long', costUsedPaise: rs(2_000), fmvPaise: null });
  });
  it('restates an opening balance acquired before 2018 to the 2018 share basis', () => {
    // 50 shares typed in 2026 after a 1-into-5 split in 2020: 10 shares in 2018 at ₹270.
    const split = { instrumentId: 1, kind: 'split', exDate: '2020-01-01', ratio: 0.2 };
    const r = taxRealisations(
      [
        e(1, 'opening', '2026-01-01', 50, rs(1_000), { acquiredOn: '2016-01-01' }),
        e(2, 'remove', '2026-02-01', 50, rs(5_000)),
      ],
      [split],
      fmv,
    )[0];
    expect(r).toMatchObject({
      fmvPaise: rs(2_700),
      costUsedPaise: rs(2_700),
      gainPaise: rs(2_300),
    });
  });
});

describe('taxRealisations — bonus and split', () => {
  it('makes bonus shares a zero-cost lot acquired on the ex-date, sold after the originals', () => {
    const bonus = { instrumentId: 1, kind: 'bonus', exDate: '2025-03-01', ratio: 0.5 };
    const r = taxRealisations(
      [e(1, 'add', '2024-01-01', 10, rs(10_000)), e(2, 'remove', '2025-06-01', 15, rs(10_500))],
      [bonus],
      new Map(),
    );
    expect(
      r.map((x) => [x.shares, x.actualCostPaise, x.proceedsPaise, x.gainPaise, x.term, x.bonus]),
    ).toEqual([
      [10, rs(10_000), rs(7_000), -rs(3_000), 'long', false],
      [5, 0, rs(3_500), rs(3_500), 'short', true],
    ]);
  });
  it('restates a split without changing cost or holding period', () => {
    const split = { instrumentId: 1, kind: 'split', exDate: '2025-01-01', ratio: 0.2 };
    const r = taxRealisations(
      [e(1, 'add', '2024-01-01', 10, rs(10_000)), e(2, 'remove', '2025-06-01', 50, rs(15_000))],
      [split],
      new Map(),
    );
    expect(r).toEqual([
      expect.objectContaining({
        shares: 50,
        actualCostPaise: rs(10_000),
        gainPaise: rs(5_000),
        term: 'long',
        bonus: false,
      }),
    ]);
  });
});

const real = (over: Partial<TaxRealisation>): TaxRealisation => ({
  instrumentId: 1,
  acquiredOn: '2024-01-01',
  removedOn: '2025-09-01',
  shares: 1,
  actualCostPaise: 0,
  costUsedPaise: 0,
  proceedsPaise: 0,
  gainPaise: 0,
  daysHeld: 400,
  term: 'long',
  intraday: false,
  bonus: false,
  fmvPaise: null,
  grandfathered: false,
  financialYear: '2025-26',
  ...over,
});

describe('summariseTaxYear', () => {
  it('applies the exemption, then 20% and 12.5%, then 4% cess', () => {
    const s = summariseTaxYear(
      [real({ term: 'short', gainPaise: rs(10_000) }), real({ gainPaise: rs(200_000) })],
      '2025-26',
    );
    // (10,000 × 20%) + (75,000 × 12.5%) = 2,000 + 9,375 = 11,375; cess 455.
    expect(s).toMatchObject({
      exemptionUsedPaise: rs(125_000),
      taxableLongTermPaise: rs(75_000),
      taxPaise: rs(11_375),
      cessPaise: rs(455),
      totalTaxPaise: rs(11_830),
    });
  });
  it('sets a short-term loss against short- then long-term gains, but a long-term loss only against long-term', () => {
    const a = summariseTaxYear(
      [
        real({ term: 'short', gainPaise: -rs(50_000) }),
        real({ term: 'short', gainPaise: rs(20_000) }),
        real({ gainPaise: rs(40_000) }),
      ],
      '2025-26',
    );
    expect(a).toMatchObject({
      netShortTermPaise: 0,
      netLongTermPaise: rs(10_000),
      taxPaise: 0,
      shortTermLossCarriedPaise: 0,
    });
    const b = summariseTaxYear(
      [real({ gainPaise: -rs(5_000) }), real({ term: 'short', gainPaise: rs(8_000) })],
      '2025-26',
    );
    expect(b).toMatchObject({
      taxableShortTermPaise: rs(8_000),
      longTermLossCarriedPaise: rs(5_000),
      taxPaise: rs(1_600),
    });
  });
  it('uses the old and new rates within FY 2024-25 by sale date, and leaves intraday out', () => {
    const s = summariseTaxYear(
      [
        real({
          term: 'short',
          gainPaise: rs(10_000),
          removedOn: '2024-06-01',
          financialYear: '2024-25',
        }),
        real({
          term: 'short',
          gainPaise: rs(10_000),
          removedOn: '2024-09-01',
          financialYear: '2024-25',
        }),
        real({
          term: 'short',
          gainPaise: rs(999),
          intraday: true,
          removedOn: '2024-09-02',
          financialYear: '2024-25',
        }),
      ],
      '2024-25',
    );
    expect(s).toMatchObject({ taxPaise: rs(3_500), intradayPaise: rs(999), count: 3 });
  });
  it('lists years with removals, newest first', () => {
    expect(taxYears([real({ financialYear: '2023-24' }), real({}), real({})])).toEqual([
      '2025-26',
      '2023-24',
    ]);
  });
});

describe('benchmarkReplay', () => {
  const index = new Map([
    ['2024-01-01', 10_000],
    ['2024-07-01', 15_000],
    ['2025-06-01', 12_000],
  ]);
  const indexOn = (date: string) => {
    let found: number | null = null;
    for (const [d, v] of index) if (d <= date) found = v;
    return found;
  };
  it('buys index units with money in and sells them with money out, on the same dates', () => {
    const r = benchmarkReplay({
      entries: [e(1, 'add', '2024-01-01', 10, rs(1_000)), e(2, 'remove', '2024-07-01', 5, rs(600))],
      priceOn: () => null,
      indexOn,
      today: '2025-06-01',
    });
    // 10 units at 100; 4 sold at 150; 6 left at 120 = ₹720.
    expect(r).toMatchObject({
      investedPaise: rs(1_000),
      withdrawnPaise: rs(600),
      valuePaise: rs(720),
      status: 'ok',
    });
    expect(r?.simpleReturn).toBeCloseTo(0.32, 10);
  });
  it('is null without an index close for today', () => {
    expect(
      benchmarkReplay({
        entries: [e(1, 'add', '2024-01-01', 1, 1)],
        priceOn: () => null,
        indexOn: () => null,
        today: '2025-01-01',
      }),
    ).toBeNull();
  });
});

describe('time-weighted growth and period returns', () => {
  it('ignores money added: a ₹100 deposit is not a gain', () => {
    const g = timeWeightedGrowth([
      { date: '2025-01-01', valuePaise: 10_000, netInvestedPaise: 10_000, partial: false },
      { date: '2025-01-02', valuePaise: 21_000, netInvestedPaise: 20_000, partial: false },
    ]);
    expect(g[0]?.value).toBe(100);
    expect(g[1]?.value).toBeCloseTo(110, 10);
  });
  it('rebases an index to 100 and reads returns over periods', () => {
    const closes = [
      { date: '2024-12-31', closePaise: 100 },
      { date: '2025-06-30', closePaise: 110 },
      { date: '2025-12-31', closePaise: 121 },
    ];
    const g = indexGrowth(closes, '2025-01-01', '2025-12-31');
    expect(g.map((p) => Math.round(p.value))).toEqual([100, 110, 121]);
    const r = periodReturns(
      [
        { date: '2025-01-01', value: 100 },
        { date: '2025-06-30', value: 110 },
        { date: '2025-12-31', value: 121 },
      ],
      '2025-12-31',
    );
    expect(r.all).toBeCloseTo(0.21, 10);
    expect(r['6M']).toBeCloseTo(0.1, 10);
    expect(r['1Y']).toBeNull();
  });
});
