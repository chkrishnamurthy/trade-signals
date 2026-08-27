import { fromIstParts } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import type { Bar } from '../types.js';
import { adx } from './adx.js';
import { roc } from './roc.js';
import { typicalPrice, vwap, vwapSlopePercent } from './vwap.js';

/**
 * Fixture provenance, per the repo's indicator-math discipline: every expected
 * value below is hand-computed, and the arithmetic is written out in the
 * comment above it. None of it came from running the implementation.
 */

/** A bar at `minute` minutes past the 09:15 IST open on 2026-08-20 (Thursday). */
function bar(minute: number, o: number, h: number, l: number, c: number, v: number): Bar {
  const timestamp = fromIstParts({
    year: 2026,
    month: 8,
    day: 20,
    hour: 9,
    minute: 15 + minute,
  }).getTime();
  return { timestamp, open: o, high: h, low: l, close: c, volume: v };
}

describe('typicalPrice', () => {
  it('is (high + low + close) / 3, rounded to whole paise', () => {
    // (10200 + 10000 + 10100) / 3 = 30300 / 3 = 10100 exactly
    expect(typicalPrice(bar(0, 10000, 10200, 10000, 10100, 100))).toBe(10100);
    // (10400 + 10100 + 10300) / 3 = 30800 / 3 = 10266.666... -> 10267
    expect(typicalPrice(bar(1, 10100, 10400, 10100, 10300, 300))).toBe(10267);
  });
});

describe('vwap', () => {
  const bars: Bar[] = [
    bar(0, 10000, 10200, 10000, 10100, 100),
    bar(1, 10100, 10400, 10100, 10300, 300),
    bar(2, 10300, 10500, 10300, 10400, 200),
  ];

  it('accumulates price × volume over volume, from the session open', () => {
    // Bar 0: tp 10100 × 100 = 1_010_000; Σv = 100 -> 10100
    // Bar 1: tp 10267 × 300 = 3_080_100; Σpv = 4_090_100, Σv = 400
    //        4_090_100 / 400 = 10225.25 -> 10225
    // Bar 2: tp 10400 × 200 = 2_080_000; Σpv = 6_170_100, Σv = 600
    //        6_170_100 / 600 = 10283.5 -> 10284 (Math.round is half-up)
    expect(vwap(bars)).toEqual([10100, 10225, 10284]);
  });

  it('resets at the session boundary rather than carrying the day forward', () => {
    const nextDay: Bar = {
      timestamp: fromIstParts({ year: 2026, month: 8, day: 21, hour: 9, minute: 15 }).getTime(),
      open: 20000,
      high: 20300,
      low: 20000,
      close: 20200,
      volume: 50,
    };
    // (20300 + 20000 + 20200) / 3 = 60500 / 3 = 20166.67 -> 20167, first of a
    // fresh accumulator, NOT blended with the 10k-priced prior session.
    expect(vwap([...bars, nextDay]).at(-1)).toBe(20167);
  });

  it('is null while a session has traded no volume at all', () => {
    const dead = bar(0, 10000, 10000, 10000, 10000, 0);
    expect(vwap([dead])).toEqual([null]);
  });

  it('carries the previous value through a zero-volume bar', () => {
    const dead = bar(3, 10400, 10400, 10400, 10400, 0);
    // Accumulators unchanged, so the value is bar 2's 10284.
    expect(vwap([...bars, dead]).at(-1)).toBe(10284);
  });
});

describe('vwapSlopePercent', () => {
  it('measures the change over the lookback as a percentage', () => {
    // (110 - 100) / 100 × 100 = 10
    expect(vwapSlopePercent([100, 105, 110], 2)).toBe(10);
  });

  it('is null when the lookback reaches past the warm-up', () => {
    expect(vwapSlopePercent([null, 105, 110], 2)).toBeNull();
  });
});

describe('roc', () => {
  it('is the percentage change over `period` bars', () => {
    // index 2: (120 - 100) / 100 × 100 = 20
    // index 3: (132 - 110) / 110 × 100 = 20
    expect(roc([100, 110, 120, 132], 2)).toEqual([null, null, 20, 20]);
  });

  it('first emits at index `period`', () => {
    const out = roc([1, 2, 3, 4, 5], 3);
    expect(out.slice(0, 3)).toEqual([null, null, null]);
    expect(out[3]).not.toBeNull();
  });

  it('rejects a nonsense period', () => {
    expect(() => roc([1, 2, 3], 0)).toThrow(RangeError);
  });
});

describe('adx', () => {
  /**
   * A perfectly regular staircase, so every intermediate value is a round
   * number and the whole calculation can be done on paper.
   *
   * Bars (high, low, close): (100,90,95) (110,100,105) (120,110,115)
   *                          (130,120,125) (140,130,135)
   *
   * True range, from index 1: max(h−l, |h−prevClose|, |l−prevClose|)
   *   i=1: max(10, |110−95|=15, |100−95|=5)  = 15
   *   i=2..4: the same shape                  = 15
   *   TR = [15, 15, 15, 15]
   *
   * Directional movement, from index 1:
   *   upMove   = high − prevHigh = 10; downMove = prevLow − low = −10
   *   upMove > downMove and > 0  -> +DM = 10, −DM = 0, every bar.
   *
   * Wilder smoothing, period 2, first emits at index 1 of each array:
   *   smoothed TR  = [null, 15, 15, 15]
   *   smoothed +DM = [null, 10, 10, 10]
   *   smoothed −DM = [null,  0,  0,  0]
   *
   * +DI = 10 / 15 × 100 = 66.666…, −DI = 0
   * DX  = |66.666… − 0| / 66.666… × 100 = 100
   * ADX = Wilder smoothing of DX, which is constant at 100.
   */
  const staircase: Bar[] = [
    bar(0, 95, 100, 90, 95, 10),
    bar(1, 105, 110, 100, 105, 10),
    bar(2, 115, 120, 110, 115, 10),
    bar(3, 125, 130, 120, 125, 10),
    bar(4, 135, 140, 130, 135, 10),
  ];

  it('computes +DI, −DI and ADX', () => {
    const result = adx(staircase, 2);
    expect(result.plusDi[2]).toBeCloseTo(66.6667, 3);
    expect(result.minusDi[2]).toBe(0);
    expect(result.adx[3]).toBeCloseTo(100, 6);
    expect(result.adx[4]).toBeCloseTo(100, 6);
  });

  it('emits +DI at index `period` and ADX at index 2×period − 1', () => {
    // The single most common defect in an ADX implementation is emitting ADX
    // one full smoothing period too early, which makes every trend filter fire
    // on warm-up noise.
    const result = adx(staircase, 2);
    expect(result.plusDi.slice(0, 2)).toEqual([null, null]);
    expect(result.plusDi[2]).not.toBeNull();
    expect(result.adx.slice(0, 3)).toEqual([null, null, null]);
    expect(result.adx[3]).not.toBeNull();
  });

  it('returns all nulls when there are not enough bars', () => {
    expect(adx(staircase.slice(0, 1), 14).adx).toEqual([null]);
  });

  it('gives no directional movement for a run of inside bars', () => {
    const insides: Bar[] = [
      bar(0, 100, 120, 80, 100, 10),
      bar(1, 100, 110, 90, 100, 10),
      bar(2, 100, 105, 95, 100, 10),
      bar(3, 100, 103, 97, 100, 10),
    ];
    const result = adx(insides, 2);
    // Every bar is inside the last, so both +DM and −DM are zero throughout
    // and there is no directional information to smooth.
    expect(result.plusDi[2]).toBe(0);
    expect(result.minusDi[2]).toBe(0);
    expect(result.adx.every((value) => value === null)).toBe(true);
  });

  it('rejects a nonsense period', () => {
    expect(() => adx(staircase, 0)).toThrow(RangeError);
  });
});
