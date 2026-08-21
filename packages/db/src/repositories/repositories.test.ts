import { describe, expect, it } from 'vitest';
import { applyAdjustments, type StoredBar } from './candles.js';
import { hashStrategyConfig } from './signals.js';

/**
 * Expected values here are computed by hand, not by running the code under
 * test. A fixture generated from the implementation tests only that the
 * implementation is stable, not that it is right.
 */

const day = (iso: string): number => new Date(iso).getTime();

function bar(iso: string, price: number, volume: number): StoredBar {
  return { timestamp: day(iso), open: price, high: price, low: price, close: price, volume };
}

describe('applyAdjustments', () => {
  it('leaves a series untouched when there are no corporate actions', () => {
    const bars = [bar('2026-01-01T00:00:00Z', 100_000, 1_000)];
    expect(applyAdjustments(bars, [])).toEqual(bars);
  });

  it('scales prices before the ex-date and leaves later bars alone', () => {
    // A 1:5 split on 2026-03-01. ₹1000 before it is ₹200 after, in today's
    // terms, so ratio = 0.2. 100000 paise * 0.2 = 20000 paise.
    const bars = [
      bar('2026-02-28T00:00:00Z', 100_000, 5_000),
      bar('2026-03-01T00:00:00Z', 20_000, 25_000),
    ];
    const adjusted = applyAdjustments(bars, [{ exDate: day('2026-03-01T00:00:00Z'), ratio: 0.2 }]);

    expect(adjusted[0]?.close).toBe(20_000);
    // Volume scales inversely: 5000 shares pre-split is 25000 post-split.
    expect(adjusted[0]?.volume).toBe(25_000);
    // The bar on the ex-date already trades on the new basis.
    expect(adjusted[1]?.close).toBe(20_000);
    expect(adjusted[1]?.volume).toBe(25_000);
  });

  it('compounds two actions for a bar that predates both', () => {
    // 1:2 (0.5) then 1:5 (0.2). A bar before both must be scaled by 0.1.
    // 100000 * 0.5 * 0.2 = 10000.
    const bars = [
      bar('2026-01-01T00:00:00Z', 100_000, 1_000),
      bar('2026-02-15T00:00:00Z', 100_000, 1_000),
      bar('2026-04-01T00:00:00Z', 100_000, 1_000),
    ];
    const adjusted = applyAdjustments(bars, [
      { exDate: day('2026-03-01T00:00:00Z'), ratio: 0.2 },
      { exDate: day('2026-02-01T00:00:00Z'), ratio: 0.5 },
    ]);

    expect(adjusted[0]?.close).toBe(10_000); // before both
    expect(adjusted[1]?.close).toBe(20_000); // after the 1:2, before the 1:5
    expect(adjusted[2]?.close).toBe(100_000); // after both
  });

  it('keeps every adjusted price an integer number of paise', () => {
    // 33333 * 0.3 = 9999.9, which must not survive as a fraction.
    const adjusted = applyAdjustments(
      [bar('2026-01-01T00:00:00Z', 33_333, 7)],
      [{ exDate: day('2026-06-01T00:00:00Z'), ratio: 0.3 }],
    );
    const price = adjusted[0]?.close ?? 0;
    expect(Number.isInteger(price)).toBe(true);
    expect(price).toBe(10_000); // round(9999.9)
  });

  it('preserves OHLC ordering through an adjustment', () => {
    const adjusted = applyAdjustments(
      [
        {
          timestamp: day('2026-01-01T00:00:00Z'),
          open: 100,
          high: 150,
          low: 90,
          close: 120,
          volume: 10,
        },
      ],
      [{ exDate: day('2026-06-01T00:00:00Z'), ratio: 0.5 }],
    );
    const b = adjusted[0];
    expect(b).toBeDefined();
    if (b === undefined) return;
    expect(b.high).toBeGreaterThanOrEqual(b.low);
    expect(b.high).toBeGreaterThanOrEqual(b.open);
    expect(b.high).toBeGreaterThanOrEqual(b.close);
    expect(b.low).toBeLessThanOrEqual(b.open);
    expect(b.low).toBeLessThanOrEqual(b.close);
  });
});

describe('hashStrategyConfig', () => {
  it('is stable across property order', () => {
    expect(hashStrategyConfig({ a: 1, b: { c: 2, d: 3 } })).toBe(
      hashStrategyConfig({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('changes when any weight changes', () => {
    // The whole point of rule 7: a different strategy must be a different row.
    expect(hashStrategyConfig({ weights: { rsi: 1 } })).not.toBe(
      hashStrategyConfig({ weights: { rsi: 1.25 } }),
    );
  });

  it('distinguishes an absent key from a zero value', () => {
    expect(hashStrategyConfig({ a: 1 })).not.toBe(hashStrategyConfig({ a: 1, b: 0 }));
  });

  it('preserves array order, which is meaningful', () => {
    expect(hashStrategyConfig({ x: [1, 2] })).not.toBe(hashStrategyConfig({ x: [2, 1] }));
  });
});
