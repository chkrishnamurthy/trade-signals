import { describe, expect, it } from 'vitest';
import type { Bar } from '../types.js';
import { aggregateBreadth, breadthPoints } from './breadth.js';
import { catalogueFor, METRIC_CATALOGUE, METRIC_KEYS } from './catalogue.js';
import { classifyStoredSeries, parseCorporateActionSubject } from './corporate-actions.js';
import {
  describeLeaf,
  evaluateFilter,
  explainMatch,
  type FilterNode,
  leavesOf,
  validateFilter,
} from './filter.js';
import {
  daysUntilNext,
  deliveryMetrics,
  fnoMetrics,
  ownershipMetrics,
  sizeBucket,
} from './supplementary.js';

describe('catalogue', () => {
  it('defines every key exactly once', () => {
    expect(new Set(METRIC_KEYS).size).toBe(METRIC_KEYS.length);
    expect(METRIC_CATALOGUE).toHaveLength(METRIC_KEYS.length);
  });

  it('hides signal metrics from non-admins', () => {
    expect(catalogueFor(false).some((d) => d.category === 'signals')).toBe(false);
    expect(catalogueFor(true).some((d) => d.category === 'signals')).toBe(true);
  });

  it('never uses advisory wording in a label or description', () => {
    const banned = /\b(buy|sell|target|undervalued|overvalued|recommend|multibagger|entry price)\b/i;
    for (const def of METRIC_CATALOGUE) {
      expect(banned.test(def.label), def.key).toBe(false);
      expect(banned.test(def.description), def.key).toBe(false);
    }
  });
});

describe('parseCorporateActionSubject', () => {
  it('reads a face-value split as new ÷ old', () => {
    const a = parseCorporateActionSubject(
      'Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share',
    );
    expect(a).toEqual({ kind: 'split', numerator: 1, denominator: 5, ratio: '0.2000000000' });
  });

  it('handles Re and decimal face values', () => {
    // From Re 1 to Re 0.50 → 50 ÷ 100 = 1/2
    const a = parseCorporateActionSubject('Face Value Split (Sub-Division) - From Re 1/- To Re 0.50/-');
    expect(a?.ratio).toBe('0.5000000000');
  });

  it('reads a bonus a:b as held ÷ (new + held)', () => {
    // Bonus 1:2 → 1 new for every 2 held → 2 ÷ 3
    expect(parseCorporateActionSubject('Bonus 1:2')?.ratio).toBe('0.6666666667');
    // Bonus 4:1 → 1 ÷ 5
    expect(parseCorporateActionSubject('Bonus 4:1')).toMatchObject({ kind: 'bonus', ratio: '0.2000000000' });
  });

  it('reads a consolidation as a ratio above one', () => {
    const a = parseCorporateActionSubject('Consolidation of Shares From Re 1/- To Rs 10/-');
    expect(a).toMatchObject({ kind: 'consolidation', ratio: '10.0000000000' });
  });

  it('ignores dividends and anything unreadable', () => {
    expect(parseCorporateActionSubject('Dividend - Rs 8 Per Share')).toBeNull();
    expect(parseCorporateActionSubject('Face Value Split')).toBeNull();
    expect(parseCorporateActionSubject('Bonus 0:1')).toBeNull();
  });
});

describe('classifyStoredSeries', () => {
  it('tells a raw jump from an already-adjusted series', () => {
    // 1:5 split, last close ₹1,000 → raw open ≈ ₹200 (implied 0.2)
    expect(classifyStoredSeries(100_000, 20_100, 0.2)).toBe('raw');
    // the provider already adjusted: open ≈ the previous close
    expect(classifyStoredSeries(100_000, 101_000, 0.2)).toBe('already_adjusted');
    expect(classifyStoredSeries(100_000, 50_000, 0.2)).toBe('ambiguous');
  });
});

describe('supplementary metrics', () => {
  it('compares delivery with the mean of earlier sessions only', () => {
    const points = [
      { tradingDate: '2026-09-25', deliveryPercent: 40, deliverableQty: 1 },
      { tradingDate: '2026-09-26', deliveryPercent: 42, deliverableQty: 1 },
      { tradingDate: '2026-09-29', deliveryPercent: 38, deliverableQty: 1 },
      { tradingDate: '2026-09-30', deliveryPercent: 44, deliverableQty: 1 },
      { tradingDate: '2026-10-01', deliveryPercent: 36, deliverableQty: 1 },
      { tradingDate: '2026-10-02', deliveryPercent: 60, deliverableQty: 900 },
    ];
    // prior mean = (40+42+38+44+36) ÷ 5 = 40 → +20 pp, ratio 1.5
    const m = deliveryMetrics(points, '2026-10-02');
    expect(m.avgDelivery20).toBe(40);
    expect(m.deliveryVsAvg).toBe(20);
    expect(m.deliveryRatio).toBe(1.5);
    expect(m.deliveryQty).toBe(900);
    expect(deliveryMetrics(points.slice(0, 5), '2026-10-02').deliveryPct).toBeNull();
  });

  it('reports ownership change and streaks', () => {
    const m = ownershipMetrics([
      { asOf: '2025-12-31', promoterPercent: 50, publicPercent: 50 },
      { asOf: '2026-03-31', promoterPercent: 51, publicPercent: 49 },
      { asOf: '2026-06-30', promoterPercent: 52.5, publicPercent: 47.5 },
    ]);
    expect(m.promoterChgQoq).toBe(1.5);
    expect(m.publicChgQoq).toBe(-1.5);
    expect(m.promoterStreak).toBe(2);
    expect(m.shareholdingAsOf).toBe('2026-06-30');
    expect(ownershipMetrics([]).promoterPct).toBeNull();
  });

  it('reads F&O state and the build-up streak', () => {
    const m = fnoMetrics(
      [
        { tradingDate: '2026-09-30', futuresOi: 1000, oiChange: 50, buildup: 'short_covering' },
        { tradingDate: '2026-10-01', futuresOi: 1100, oiChange: 100, buildup: 'long_buildup' },
        { tradingDate: '2026-10-02', futuresOi: 1210, oiChange: 110, buildup: 'long_buildup' },
      ],
      '2026-10-02',
    );
    // previous OI 1100 → +110 ÷ 1100 = 10%
    expect(m).toMatchObject({ fnoEligible: true, futOi: 1210, oiBuildup: 'long_buildup', oiBuildupStreak: 2 });
    expect(m.futOiChgPct).toBeCloseTo(10, 10);
    expect(fnoMetrics([], '2026-10-02').fnoEligible).toBe(false);
  });

  it('finds the nearest upcoming date within the horizon', () => {
    expect(daysUntilNext(['2026-10-20', '2026-10-09', '2026-09-01'], '2026-10-02')).toBe(7);
    expect(daysUntilNext(['2026-12-31'], '2026-10-02')).toBeNull();
  });

  it('buckets size by index membership', () => {
    expect(sizeBucket(['nifty500', 'nifty100'])).toBe('large');
    expect(sizeBucket(['niftysmallcap250'])).toBe('small');
    expect(sizeBucket([])).toBe('other');
  });
});

describe('filter', () => {
  const screen: FilterNode = {
    op: 'and',
    children: [
      { metric: 'closeVsEma200', cmp: 'gt', value: 0 },
      { metric: 'rsRank', cmp: 'gte', value: 70 },
      {
        op: 'or',
        children: [
          { metric: 'breakout20d', cmp: 'is', value: true },
          { metric: 'rsiAbove60Days', cmp: 'within', value: 3 },
        ],
      },
    ],
  };

  it('validates a well-formed screen', () => {
    expect(validateFilter(screen, { isAdmin: false })).toEqual([]);
    expect(leavesOf(screen)).toHaveLength(4);
  });

  it('rejects unknown metrics, bad comparators and admin metrics for users', () => {
    const bad: FilterNode = {
      op: 'and',
      children: [
        { metric: 'nope' as never, cmp: 'gt', value: 1 },
        { metric: 'emaStack', cmp: 'gt', value: 1 },
        { metric: 'signalStrength', cmp: 'gt', value: 50 },
        { metric: 'close', cmp: 'gt', rhsMetric: 'rsi14' },
      ],
    };
    expect(validateFilter(bad, { isAdmin: false })).toHaveLength(4);
    expect(validateFilter({ metric: 'signalStrength', cmp: 'gt', value: 50 }, { isAdmin: true })).toEqual([]);
  });

  it('enforces depth and size limits', () => {
    const deep: FilterNode = { op: 'and', children: [{ op: 'and', children: [{ op: 'and', children: [{ op: 'and', children: [{ metric: 'rsi14', cmp: 'gt', value: 1 }] }] }] }] };
    expect(validateFilter(deep, { isAdmin: false }).length).toBeGreaterThan(0);
  });

  it('evaluates with null never matching', () => {
    const row = { closeVsEma200: 12, rsRank: 80, breakout20d: false, rsiAbove60Days: 2 };
    expect(evaluateFilter(screen, row)).toBe(true);
    expect(evaluateFilter(screen, { ...row, rsiAbove60Days: null })).toBe(false);
    expect(evaluateFilter({ metric: 'rsi14', cmp: 'lt', value: 30 }, { rsi14: null })).toBe(false);
    expect(evaluateFilter({ metric: 'breakout20d', cmp: 'is', value: false }, {})).toBe(false);
  });

  it('matches list membership by overlap and compares two metrics', () => {
    expect(evaluateFilter({ metric: 'indexKeys', cmp: 'in', value: ['nifty50'] }, { indexKeys: ['nifty100', 'nifty50'] })).toBe(true);
    expect(evaluateFilter({ metric: 'closeVsEma20', cmp: 'gt', rhsMetric: 'closeVsEma50' }, { closeVsEma20: 2, closeVsEma50: 1 })).toBe(true);
  });

  it('describes conditions in plain words', () => {
    expect(describeLeaf({ metric: 'rsi14', cmp: 'gte', value: 60 })).toBe('RSI (14) ≥ 60');
    expect(describeLeaf({ metric: 'close', cmp: 'gt', value: 124_550 })).toBe('Close > ₹1,245.50');
    expect(describeLeaf({ metric: 'emaStack', cmp: 'is', value: 'bullish' })).toBe('EMA stack is Bullish');
    expect(describeLeaf({ metric: 'rsiAbove60Days', cmp: 'within', value: 3 })).toBe(
      'RSI crossed above 60 within 3 sessions',
    );
  });

  it('explains only the branches that matched', () => {
    const row = { closeVsEma200: 12.34, rsRank: 80, breakout20d: false, rsiAbove60Days: 2 };
    expect(explainMatch(screen, row)).toEqual([
      'Close vs EMA 200 > 0.0% (12.3%)',
      'RS rank (3M) ≥ 70 (80)',
      'RSI crossed above 60 within 3 sessions (2 sessions)',
    ]);
  });
});

describe('breadth', () => {
  const DAY = 86_400_000;
  const mk = (closes: number[]): Bar[] =>
    closes.map((c, i) => ({ timestamp: Date.UTC(2026, 0, 1) + i * DAY, open: c, high: c, low: c, close: c, volume: 1 }));

  it('counts advances and declines per session across stocks', () => {
    const days = aggregateBreadth([breadthPoints(mk([10, 11, 10])), breadthPoints(mk([10, 9, 9]))]);
    expect(days).toHaveLength(2);
    // 2026-01-02: up, down → 1 advance, 1 decline
    expect(days[0]).toMatchObject({ date: '2026-01-02', advances: 1, declines: 1, unchanged: 0 });
    // 2026-01-03: down, flat
    expect(days[1]).toMatchObject({ date: '2026-01-03', advances: 0, declines: 1, unchanged: 1 });
    // too short for any EMA → excluded from the base, not counted as "below"
    expect(days[0]?.base20).toBe(0);
  });
});
