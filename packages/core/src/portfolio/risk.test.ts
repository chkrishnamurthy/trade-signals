import { describe, expect, it } from 'vitest';
import type { ValuePoint } from './returns.js';
import {
  alignReturns,
  betaAgainst,
  correlation,
  correlationGrid,
  type DatedReturn,
  drawdowns,
  MIN_RISK_SESSIONS,
  portfolioReturns,
  priceReturns,
  riskShares,
  summariseRisk,
  yearBefore,
  yearlyVolatility,
} from './risk.js';

const dated = (rs: readonly number[], from = 1): DatedReturn[] =>
  rs.map((r, i) => ({ date: `2026-01-${String(i + from).padStart(2, '0')}`, r }));

const point = (date: string, value: number, net: number, partial = false): ValuePoint => ({
  date,
  valuePaise: value,
  netInvestedPaise: net,
  partial,
});

describe('daily returns', () => {
  it('takes money added out of the day: ₹100 → ₹210 with ₹100 added is +10%', () => {
    const { returns, skipped } = portfolioReturns([
      point('2026-01-01', 10_000, 10_000),
      point('2026-01-02', 21_000, 20_000),
      point('2026-01-05', 18_900, 20_000),
    ]);
    expect(returns.map((x) => x.date)).toEqual(['2026-01-02', '2026-01-05']);
    expect(returns[0]?.r).toBeCloseTo(0.1, 12);
    expect(returns[1]?.r).toBeCloseTo(-0.1, 12);
    expect(skipped).toBe(0);
  });
  it('leaves out and counts a day with a stale price on either side', () => {
    const { returns, skipped } = portfolioReturns([
      point('2026-01-01', 10_000, 10_000),
      point('2026-01-02', 11_000, 10_000, true),
      point('2026-01-05', 12_000, 10_000),
      point('2026-01-06', 12_600, 10_000),
    ]);
    expect(returns).toHaveLength(1);
    expect(returns[0]?.r).toBeCloseTo(0.05, 12);
    expect(skipped).toBe(2);
  });
  it('does not read a 1-into-2 split as a 50% fall', () => {
    const r = priceReturns(
      [
        { date: '2026-01-01', closePaise: 10_000 },
        { date: '2026-01-02', closePaise: 10_200 },
        { date: '2026-01-05', closePaise: 5_100 },
      ],
      [{ instrumentId: 1, kind: 'split', exDate: '2026-01-05', ratio: 0.5 }],
    );
    expect(r[0]?.r).toBeCloseTo(0.02, 12);
    expect(r[1]?.r).toBeCloseTo(0, 12);
  });
  it('reads one year back, 29 Feb to 28 Feb (1 Mar)', () => {
    expect(yearBefore('2026-10-05')).toBe('2025-10-05');
    expect(yearBefore('2028-02-29')).toBe('2027-03-01');
  });
});

describe('volatility, correlation and beta', () => {
  it('annualises the sample standard deviation by √252', () => {
    // mean 0; sample variance 4 × 0.0001 ÷ 3; sd 0.0115470; × 15.8745079 = 0.1833030.
    expect(yearlyVolatility([0.01, -0.01, 0.01, -0.01])).toBeCloseTo(0.183303, 6);
    expect(yearlyVolatility([0.01])).toBeNull();
  });
  it('gives 1, −1 and 0 for the textbook cases, and null for a series that never moves', () => {
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(correlation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
    expect(correlation([1, -1, 1, -1], [1, 1, -1, -1])).toBeCloseTo(0, 12);
    expect(correlation([1, 2, 3], [5, 5, 5])).toBeNull();
  });
  it('matches two series by date, dropping days only one has', () => {
    const { x, y } = alignReturns(dated([0.1, 0.2, 0.3]), dated([0.5, 0.6], 2));
    expect(x).toEqual([0.2, 0.3]);
    expect(y).toEqual([0.5, 0.6]);
  });
  it('is 2 when you move exactly twice the index, and waits for enough shared days', () => {
    const index = [0.01, -0.02, 0.03, 0, 0.015];
    const b = betaAgainst(dated(index.map((r) => 2 * r)), dated(index), 3);
    expect(b.status).toBe('ok');
    if (b.status === 'ok') {
      expect(b.value.beta).toBeCloseTo(2, 12);
      expect(b.value.correlation).toBeCloseTo(1, 12);
      expect(b.sessions).toBe(5);
    }
    expect(betaAgainst(dated([0.01, 0.02]), dated([0.01, 0.02]))).toEqual({
      status: 'needs_history',
      sessions: 2,
      needed: MIN_RISK_SESSIONS,
    });
  });
});

describe('drawdowns', () => {
  it('finds the deepest fall, its high and low, and the day it was made back', () => {
    // Levels: 1.1, 0.55, 0.66, 1.32. High 1.1 on the 1st, low 0.55 on the 2nd (−50%), back on the 4th.
    const { series, deepest } = drawdowns(dated([0.1, -0.5, 0.2, 1.0]), '2025-12-31');
    expect(series.map((p) => Number(p.drawdown.toFixed(4)))).toEqual([0, 0, -0.5, -0.4, 0]);
    expect(deepest).toEqual({
      depth: expect.closeTo(-0.5, 12),
      peakOn: '2026-01-01',
      troughOn: '2026-01-02',
      recoveredOn: '2026-01-04',
    });
  });
  it('says not yet recovered while still below the high', () => {
    const { deepest } = drawdowns(dated([-0.2, 0.1]), '2025-12-31');
    expect(deepest).toMatchObject({
      peakOn: '2025-12-31',
      troughOn: '2026-01-01',
      recoveredOn: null,
    });
    expect(deepest?.depth).toBeCloseTo(-0.2, 12);
  });
});

describe('correlation grid and share of the ups and downs', () => {
  const a = dated([0.02, -0.02, 0.02, -0.02]);
  const b = dated([0.01, 0.01, -0.01, -0.01]);
  const series = new Map([
    [1, a],
    [2, b],
    [3, dated([0.01])],
  ]);
  it('prints a number for every pair with enough shared days, and a blank otherwise', () => {
    const grid = correlationGrid([1, 2, 3], series, 4);
    expect(grid.cells[0]?.[0]).toBe(1);
    expect(grid.cells[0]?.[1]).toBeCloseTo(0, 12);
    expect(grid.cells[1]?.[0]).toBeCloseTo(0, 12);
    expect(grid.cells[0]?.[2]).toBeNull();
    expect(grid.cells[2]?.[2]).toBeNull();
  });
  it('splits the variance by weight × covariance, adding up to 1', () => {
    // Unrelated stocks at equal weight; variances 4σ² and σ²: shares 0.8 and 0.2.
    const shares = riskShares(
      series,
      new Map([
        [1, 50],
        [2, 50],
        [3, 10],
      ]),
      4,
    );
    expect(shares.get(1)).toBeCloseTo(0.8, 12);
    expect(shares.get(2)).toBeCloseTo(0.2, 12);
    expect(shares.get(3)).toBeNull();
  });
});

describe('summariseRisk', () => {
  // 130 weekday sessions; the holdings and Nifty alternate +1% / −1%, the holdings
  // twice as far, so beta is 2. One stock, so it carries all the ups and downs.
  const dates: string[] = [];
  for (
    let d = new Date('2026-03-02T00:00:00Z');
    dates.length < 131;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(d.toISOString().slice(0, 10));
  }
  let level = 1_000_000;
  let index = 2_000_000;
  const points: ValuePoint[] = [];
  const indexCloses: { date: string; closePaise: number }[] = [];
  dates.forEach((date, i) => {
    if (i > 0) {
      const up = i % 2 === 1;
      level *= up ? 1.02 : 0.98;
      index *= up ? 1.01 : 0.99;
    }
    points.push(point(date, level, 1_000_000));
    indexCloses.push({ date, closePaise: index });
  });
  const stockCloses = new Map([
    [7, points.map((p) => ({ date: p.date, closePaise: p.valuePaise }))],
  ]);
  const today = dates.at(-1) ?? '';
  const s = summariseRisk({
    points,
    indexCloses,
    stockCloses,
    changes: [],
    weights: new Map([[7, 1]]),
    today,
  });

  it('gives volatility, beta 2 and the deepest fall once there are enough sessions', () => {
    expect(s.sessions).toBe(130);
    expect(s.volatility.oneYear.status).toBe('ok');
    if (s.volatility.oneYear.status === 'ok') {
      // ±2% alternating, 130 days: sample variance 130 × 0.0004 ÷ 129; sd 0.020078 × √252 = 0.31872.
      expect(s.volatility.oneYear.value).toBeCloseTo(0.31872, 5);
    }
    expect(s.beta.status).toBe('ok');
    if (s.beta.status === 'ok') expect(s.beta.value.beta).toBeCloseTo(2, 2);
    expect(s.deepestFall.status).toBe('ok');
    expect(s.stocks).toEqual([
      expect.objectContaining({ instrumentId: 7, sessions: 130, share: expect.closeTo(1, 12) }),
    ]);
    expect(s.correlation.cells).toEqual([[1]]);
  });
  it('says how much history is still needed with fewer than about six months', () => {
    const short = summariseRisk({
      points: points.slice(0, 40),
      indexCloses,
      stockCloses,
      changes: [],
      weights: new Map([[7, 1]]),
      today: points[39]?.date ?? '',
    });
    expect(short.volatility.oneYear).toEqual({
      status: 'needs_history',
      sessions: 39,
      needed: MIN_RISK_SESSIONS,
    });
    expect(short.deepestFall.status).toBe('needs_history');
    expect(short.beta.status).toBe('needs_history');
  });
});
