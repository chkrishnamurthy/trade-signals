import { describe, expect, it } from 'vitest';
import type { Bar } from '../types.js';
import { bollinger } from './bollinger.js';
import { stochastic } from './stochastic.js';
import { supertrend } from './supertrend.js';

/** Bars from [high, low, close]; open is irrelevant to these indicators. */
function bars(rows: readonly (readonly [number, number, number])[]): Bar[] {
  return rows.map(([high, low, close], i) => ({
    timestamp: i,
    open: close,
    high,
    low,
    close,
    volume: 0,
  }));
}

describe('stochastic', () => {
  // Hand-computed, kPeriod 3, dPeriod 2:
  //   i2: window i0..i2 → HH = max(10,11,12) = 12, LL = min(8,9,10) = 8
  //       %K = (11 − 8) ÷ (12 − 8) × 100 = 75
  //   i3: window i1..i3 → HH = 12, LL = min(9,10,9) = 9
  //       %K = (9 − 9) ÷ (12 − 9) × 100 = 0
  //   %D first at kPeriod + dPeriod − 2 = 3: (75 + 0) ÷ 2 = 37.5
  const series = bars([
    [10, 8, 9],
    [11, 9, 10],
    [12, 10, 11],
    [12, 9, 9],
  ]);

  it('matches the hand-computed %K and %D', () => {
    const { k, d } = stochastic(series, 3, 2);
    expect(k).toEqual([null, null, 75, 0]);
    expect(d).toEqual([null, null, null, 37.5]);
  });

  it('first emits %K at kPeriod − 1 and %D at kPeriod + dPeriod − 2', () => {
    const { k, d } = stochastic(series, 3, 2);
    expect(k.findIndex((v) => v !== null)).toBe(2);
    expect(d.findIndex((v) => v !== null)).toBe(3);
  });

  it('is null over a flat window rather than an invented midpoint', () => {
    const flat = bars([
      [5, 5, 5],
      [5, 5, 5],
      [5, 5, 5],
      [6, 4, 6],
    ]);
    const { k, d } = stochastic(flat, 3, 2);
    expect(k[2]).toBeNull();
    // i3: HH 6, LL 4 → (6 − 4) ÷ 2 × 100 = 100, but %D's window holds the null.
    expect(k[3]).toBe(100);
    expect(d[3]).toBeNull();
  });

  it('rejects nonsense periods', () => {
    expect(() => stochastic(series, 0, 3)).toThrow(RangeError);
    expect(() => stochastic(series, 14, 1.5)).toThrow(RangeError);
  });
});

describe('bollinger', () => {
  // The textbook population-σ example: closes 2,4,4,4,5,5,7,9.
  //   mean = 40 ÷ 8 = 5
  //   squared deviations: 9,1,1,1,0,0,4,16 → sum 32 → variance 32 ÷ 8 = 4 → σ = 2
  //   upper = 5 + 2×2 = 9, lower = 5 − 2×2 = 1
  //   width = (9 − 1) ÷ 5 × 100 = 160
  const closes = [2, 4, 4, 4, 5, 5, 7, 9];

  it('uses the population standard deviation', () => {
    const result = bollinger(closes, 8, 2);
    expect(result.middle[7]).toBe(5);
    expect(result.upper[7]).toBe(9);
    expect(result.lower[7]).toBe(1);
    expect(result.width[7]).toBe(160);
  });

  it('first emits at period − 1', () => {
    const result = bollinger(closes, 8, 2);
    expect(result.width.findIndex((v) => v !== null)).toBe(7);
    expect(result.middle.slice(0, 7).every((v) => v === null)).toBe(true);
  });

  it('collapses to zero width on a constant series', () => {
    const result = bollinger([100, 100, 100], 3, 2);
    expect(result.width[2]).toBe(0);
    expect(result.upper[2]).toBe(100);
  });

  it('rejects nonsense parameters', () => {
    expect(() => bollinger(closes, 1)).toThrow(RangeError);
    expect(() => bollinger(closes, 20, 0)).toThrow(RangeError);
  });
});

describe('supertrend', () => {
  // Hand-computed, ATR period 2, multiplier 1.
  //   True ranges (bar 1..5): 2, 2, 2, 6, 4
  //     bar4: max(10−6, |10−12|, |6−12|) = 6; bar5: max(9−5, |9−7|, |5−7|) = 4
  //   Wilder ATR(2): bar2 (2+2)/2 = 2; bar3 (2·1+2)/2 = 2; bar4 (2+6)/2 = 4; bar5 (4+4)/2 = 4
  //   bar2: hl2 11 → bands 13 / 9; seeded up → value 9
  //   bar3: hl2 12 → basic 14 / 10; upper stays 13 (14 not below 13, close 11 not above 13);
  //         lower ratchets to 10; close 12 ≥ 9 → still up → value 10
  //   bar4: hl2 8 → basic 12 / 4; upper → 12; lower stays 10; close 7 < 10 → flips down → value 12
  //   bar5: hl2 7 → basic 11 / 3; upper → 11; prev close 7 < 10 so lower resets to 3;
  //         close 6 not above 12 → stays down → value 11
  const series = bars([
    [10, 8, 9],
    [11, 9, 10],
    [12, 10, 11],
    [13, 11, 12],
    [10, 6, 7],
    [9, 5, 6],
  ]);

  it('matches the hand-computed values and flip', () => {
    const result = supertrend(series, 2, 1);
    expect(result.value).toEqual([null, null, 9, 10, 12, 11]);
    expect(result.direction).toEqual([null, null, 1, 1, -1, -1]);
  });

  it('first emits at the ATR warm-up index, seeded up', () => {
    const result = supertrend(series, 2, 1);
    expect(result.direction.findIndex((v) => v !== null)).toBe(2);
    expect(result.direction[2]).toBe(1);
  });

  it('is all null when there are too few bars', () => {
    const result = supertrend(series.slice(0, 2), 2, 1);
    expect(result.value).toEqual([null, null]);
  });
});
