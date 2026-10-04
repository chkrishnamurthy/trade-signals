import { describe, expect, it } from 'vitest';
import { METRIC_KEYS } from './catalogue.js';
import { parseDividendSubject, trailingDividend } from './dividends.js';
import { KEY_POINT_LIMIT, keyPoints } from './key-points.js';
import {
  DEFAULT_RATIO_KEYS,
  DEFAULT_RATIO_KEYS_FNO,
  defaultRatioKeys,
  isRatioExtraKey,
  normaliseRatioKeys,
  RATIO_LIMITS,
} from './ratios.js';

describe('parseDividendSubject', () => {
  // Subjects copied verbatim from NSE's corporate-actions API (Jul–Sep 2025,
  // Apr–Jun 2026); expected paise worked by hand.
  it.each([
    ['Interim Dividend - Rs  8.25 Per Share', [{ kind: 'interim', amountPaise: 825 }]],
    ['Interim Dividend - Rs 160 Per Share', [{ kind: 'interim', amountPaise: 16_000 }]],
    ['Interim Dividend - Re 1 Per Share', [{ kind: 'interim', amountPaise: 100 }]],
    ['Dividend - Rs. 7.50 Per Share', [{ kind: 'dividend', amountPaise: 750 }]],
    ['Dividend - Rs1.25 Per Share', [{ kind: 'dividend', amountPaise: 125 }]],
    ['Interim Dividend - Rs. 0.01 Per Sh', [{ kind: 'interim', amountPaise: 1 }]],
    ['Special Dividend - Rs 10 Per Share', [{ kind: 'special', amountPaise: 1_000 }]],
    ['Annual General Meeting/Dividend - Re 1 Per Share', [{ kind: 'dividend', amountPaise: 100 }]],
    [
      'Interim Dividend - Rs 7 Per Share & Special Dividend Rs 3 Per Share',
      [
        { kind: 'interim', amountPaise: 700 },
        { kind: 'special', amountPaise: 300 },
      ],
    ],
    [
      'Dividend - Rs 1.80 Per Share/ Special Dividend - Rs 4 Per Share',
      [
        { kind: 'dividend', amountPaise: 180 },
        { kind: 'special', amountPaise: 400 },
      ],
    ],
    [
      // Two special parts on one ex-date: summed, 10,000 + 3,000 paise.
      'Dividend - Rs 35 Per Share & Special Dividend Of Rs 100 Per Share/ Special Dividend Of Rs 30',
      [
        { kind: 'dividend', amountPaise: 3_500 },
        { kind: 'special', amountPaise: 13_000 },
      ],
    ],
  ])('%s', (subject, expected) => {
    expect(parseDividendSubject(subject)).toEqual(expected);
  });

  it('records fractional paise as an unknown amount instead of rounding', () => {
    // Re 0.125 is 12.5 paise: not storable as integer paise (hard rule 3).
    expect(parseDividendSubject('Dividend - Re 0.125 Per Share')).toEqual([
      { kind: 'dividend', amountPaise: null },
    ]);
  });

  it('records an unreadable dividend as an unknown amount', () => {
    expect(parseDividendSubject('Dividend - 50%')).toEqual([
      { kind: 'dividend', amountPaise: null },
    ]);
  });

  it('ignores REIT/InvIT distributions and non-dividend actions', () => {
    expect(
      parseDividendSubject(
        'Distribution - Rs 1.25 Per Unit Consist Of Rs 0.68 Per Unit As Interest/ Re 0.57 Per Unit As Dividend',
      ),
    ).toEqual([]);
    expect(
      parseDividendSubject(
        'Face Value Split (Sub-Division) - From Rs 10/- Per Share To Re 1/- Per Share',
      ),
    ).toEqual([]);
    expect(parseDividendSubject('Annual General Meeting')).toEqual([]);
  });
});

describe('trailingDividend', () => {
  it('sums the window on today’s share basis and divides by the close', () => {
    // ₹10 (2025-11-10), then a 1:2 split effective 2026-01-15 (ratio 0.5),
    // then ₹3 (2026-05-20). Today's basis: 1000 × 0.5 + 300 = 800 paise.
    // A dividend from 2025-09-01 is outside (2025-10-02, 2026-10-01].
    // Yield on a ₹400 close: 800 / 40000 = 2.00%.
    const result = trailingDividend(
      [
        { exDate: '2025-09-01', amountPaise: 5_000 },
        { exDate: '2025-11-10', amountPaise: 1_000 },
        { exDate: '2026-05-20', amountPaise: 300 },
      ],
      [{ exDate: '2026-01-15', ratio: 0.5 }],
      '2026-10-01',
      40_000,
    );
    expect(result).toEqual({ ttmPaise: 800, yieldPct: 2, count: 2 });
  });

  it('counts a dividend on the as-of date and not one exactly a year before', () => {
    const r = trailingDividend(
      [
        { exDate: '2025-10-01', amountPaise: 500 },
        { exDate: '2026-10-01', amountPaise: 200 },
      ],
      [],
      '2026-10-01',
      10_000,
    );
    expect(r.ttmPaise).toBe(200);
    expect(r.yieldPct).toBe(2);
  });

  it('is unknown when any dividend in the window has an unknown amount', () => {
    expect(
      trailingDividend(
        [
          { exDate: '2026-03-01', amountPaise: 500 },
          { exDate: '2026-06-01', amountPaise: null },
        ],
        [],
        '2026-10-01',
        10_000,
      ),
    ).toEqual({ ttmPaise: null, yieldPct: null, count: 2 });
  });

  it('is a known zero when nothing was paid in the window', () => {
    expect(trailingDividend([], [], '2026-10-01', 10_000)).toEqual({
      ttmPaise: 0,
      yieldPct: 0,
      count: 0,
    });
  });

  it('has no yield without a close', () => {
    expect(
      trailingDividend([{ exDate: '2026-06-01', amountPaise: 100 }], [], '2026-10-01', null),
    ).toMatchObject({ ttmPaise: 100, yieldPct: null });
  });
});

describe('ratio layout', () => {
  it('default layouts are 18 known tiles, F&O swapping ATR % for OI build-up', () => {
    expect(DEFAULT_RATIO_KEYS).toHaveLength(18);
    for (const key of DEFAULT_RATIO_KEYS_FNO) {
      expect(isRatioExtraKey(key) || (METRIC_KEYS as readonly string[]).includes(key)).toBe(true);
    }
    expect(DEFAULT_RATIO_KEYS_FNO).toContain('oiBuildup');
    expect(DEFAULT_RATIO_KEYS_FNO).not.toContain('atrPct');
    expect(defaultRatioKeys(false)).toBe(DEFAULT_RATIO_KEYS);
  });

  it('drops unknown, duplicate and admin-only keys, keeping order', () => {
    expect(
      normaliseRatioKeys(
        ['rsi14', 'nope', 'range52w', 'rsi14', 'signalStrength', 'close', 4],
        false,
      ),
    ).toEqual(['rsi14', 'range52w', 'close']);
    expect(normaliseRatioKeys(['rsi14', 'signalStrength', 'close'], true)).toEqual([
      'rsi14',
      'signalStrength',
      'close',
    ]);
  });

  it('falls back (null) below the minimum and caps at the maximum', () => {
    expect(normaliseRatioKeys(['rsi14', 'close'], false)).toBeNull();
    const many = (METRIC_KEYS as readonly string[]).filter((k) => !k.startsWith('signal'));
    expect(normaliseRatioKeys(many, false)).toHaveLength(RATIO_LIMITS.max);
  });
});

describe('keyPoints', () => {
  it('gives nothing without a snapshot', () => {
    expect(keyPoints(null)).toEqual([]);
  });

  it('states the 52-week position with the high it is measured from', () => {
    const [p] = keyPoints({ dist52wHigh: -29.3, dist52wLow: 5.76, high52w: 102_000 });
    expect(p).toMatchObject({ id: 'range-52w', tone: 'bearish', metric: 'dist52wHigh' });
    expect(p?.text).toBe('29.3% below its 52-week high of ₹1,020.00.');
  });

  it('applies each threshold on both sides', () => {
    const ids = (v: Record<string, unknown>) => keyPoints(v).map((p) => p.id);
    // Near the high: −3.0 is in, −3.1 is not (and is not far enough to be "below").
    expect(ids({ dist52wHigh: -3 })).toContain('range-52w');
    expect(ids({ dist52wHigh: -3.1 })).not.toContain('range-52w');
    expect(ids({ dist52wHigh: -25 })).toContain('range-52w');
    expect(ids({ dist52wHigh: -24.9 })).not.toContain('range-52w');
    // Delivery needs 1.5× its average.
    expect(ids({ deliveryPct: 60, avgDelivery20: 40, deliveryRatio: 1.5 })).toContain('delivery');
    expect(ids({ deliveryPct: 59, avgDelivery20: 40, deliveryRatio: 1.49 })).not.toContain(
      'delivery',
    );
    expect(ids({ relVolume: 2 })).toContain('volume');
    expect(ids({ relVolume: 1.99 })).not.toContain('volume');
    expect(ids({ rsRank: 80, rs3m: 6 })).toContain('relative-strength');
    expect(ids({ rsRank: 79, rs3m: 6 })).not.toContain('relative-strength');
    expect(ids({ resultsInDays: 14 })).toContain('results');
    expect(ids({ resultsInDays: 15 })).not.toContain('results');
    expect(ids({ promoterChgQoq: -0.5 })).toContain('promoter');
    expect(ids({ promoterChgQoq: 0.49 })).not.toContain('promoter');
    expect(ids({ oiBuildup: 'long_buildup', oiBuildupStreak: 2 })).toContain('oi');
    expect(ids({ oiBuildup: 'long_buildup', oiBuildupStreak: 1 })).not.toContain('oi');
    expect(ids({ rsi14: 70 })).toContain('rsi');
    expect(ids({ rsi14: 69.9 })).not.toContain('rsi');
  });

  it('a breakout outranks the distance reading and the order is by salience', () => {
    const points = keyPoints({
      breakout52w: true,
      dist52wHigh: 0,
      relVolume: 3.2,
      resultsInDays: 6,
      dataIssue: 'gap',
    });
    expect(points.map((p) => p.id)).toEqual(['range-52w', 'data-issue', 'volume', 'results']);
    expect(points[0]?.text).toBe('Closed above its previous 52-week high.');
  });

  it('returns at most the limit', () => {
    const points = keyPoints({
      breakout52w: true,
      goldenCrossDays: 1,
      deliveryPct: 70,
      avgDelivery20: 30,
      deliveryRatio: 2.3,
      relVolume: 4,
      resultsInDays: 3,
      promoterChgQoq: 1.2,
      rsRank: 95,
      rs3m: 20,
      bbSqueeze: true,
    });
    expect(points).toHaveLength(KEY_POINT_LIMIT);
  });

  it('never uses advice wording, in any rule', () => {
    const every = keyPoints(
      {
        dataIssue: 'gap',
        breakdown52w: true,
        deathCrossDays: 0,
        deliveryPct: 70,
        avgDelivery20: 30,
        deliveryRatio: 2.3,
        relVolume: 4,
        resultsInDays: 0,
        promoterChgQoq: -1,
        rsRank: 5,
        rs3m: -12,
        oiBuildup: 'short_buildup',
        oiBuildupStreak: 3,
        supertrendDir: 'down',
        supertrendFlipDays: 1,
        exDateInDays: 2,
        bbSqueeze: true,
        rsi14: 25,
        bulkDeals20d: 2,
        blockDeals20d: 1,
        dividendTtm: 1_500,
        dividendYield: 1.8,
        listedDays: 40,
      },
      Number.POSITIVE_INFINITY,
    );
    expect(every.length).toBeGreaterThan(15);
    const banned =
      /\b(buy|sell|target|should|recommend|undervalued|overvalued|cheap|expensive|opportunity|strong buy|avoid|entry|exit)\b/i;
    for (const p of every) expect(p.text).not.toMatch(banned);
  });
});
