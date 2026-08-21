import { describe, expect, it } from 'vitest';
import type { Bar } from '../types.js';
import { atr } from './atr.js';
import { macd } from './macd.js';
import { ema, sma, wilderSmooth } from './moving-average.js';
import { rsi } from './rsi.js';

describe('sma', () => {
  it('averages the trailing window', () => {
    // [1,2,3,4,5] period 3 -> nulls, then (1+2+3)/3=2, (2+3+4)/3=3, (3+4+5)/3=4
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('is null until the window fills', () => {
    expect(sma([10, 20], 3)).toEqual([null, null]);
  });

  it('rounds to integer paise', () => {
    // (1+2)/2 = 1.5 -> 2 (half away from zero via Math.round)
    expect(sma([1, 2], 2)).toEqual([null, 2]);
  });

  it('rejects a nonsense period', () => {
    expect(() => sma([1, 2, 3], 0)).toThrow(RangeError);
    expect(() => sma([1, 2, 3], 1.5)).toThrow(RangeError);
  });
});

describe('ema', () => {
  it('seeds with the SMA then applies the smoothing factor', () => {
    // period 3 -> k = 2/4 = 0.5. Seed = (2+4+6)/3 = 4 at index 2.
    // index 3: 8*0.5 + 4*0.5   = 6
    // index 4: 10*0.5 + 6*0.5  = 8
    expect(ema([2, 4, 6, 8, 10], 3)).toEqual([null, null, 4, 6, 8]);
  });

  it('holds flat for a constant series', () => {
    const result = ema([100, 100, 100, 100, 100], 3);
    expect(result.slice(2)).toEqual([100, 100, 100]);
  });

  it('reacts faster than an SMA of the same period', () => {
    const values = [10, 10, 10, 10, 100];
    const fast = ema(values, 3).at(-1);
    const slow = sma(values, 3).at(-1);
    expect(fast).toBeGreaterThan(slow as number);
  });

  it('is null until the seed window fills', () => {
    expect(ema([1, 2], 5)).toEqual([null, null]);
  });
});

describe('wilderSmooth', () => {
  it('smooths more slowly than a same-period EMA', () => {
    // Wilder uses k = 1/period; a standard EMA uses 2/(period+1), which is larger.
    const values = [10, 10, 10, 10, 100];
    const wilder = wilderSmooth(values, 3).at(-1) as number;
    const standard = ema(values, 3).at(-1) as number;
    expect(wilder).toBeLessThan(standard);
  });

  it('seeds with the mean of the first window', () => {
    // (3+6+9)/3 = 6, then (6*2 + 12)/3 = 8
    expect(wilderSmooth([3, 6, 9, 12], 3)).toEqual([null, null, 6, 8]);
  });
});

describe('rsi', () => {
  it('returns 100 when there are no losses at all', () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(rising, 14).at(-1)).toBe(100);
  });

  it('returns a low value when there are no gains at all', () => {
    const falling = Array.from({ length: 30 }, (_, i) => 200 - i);
    const value = rsi(falling, 14).at(-1) as number;
    expect(value).toBeCloseTo(0, 5);
  });

  it('sits near 50 for a symmetric zig-zag', () => {
    const zigzag = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 100 : 110));
    const value = rsi(zigzag, 14).at(-1) as number;
    expect(value).toBeGreaterThan(40);
    expect(value).toBeLessThan(60);
  });

  it('stays inside 0..100 across a noisy series', () => {
    const noisy = Array.from({ length: 200 }, (_, i) => 1000 + Math.round(Math.sin(i / 3) * 80));
    for (const value of rsi(noisy, 14)) {
      if (value === null) continue;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('is null until warmed up, then defined', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = rsi(closes, 14);
    expect(result.slice(0, 14).every((v) => v === null)).toBe(true);
    expect(result[14]).not.toBeNull();
  });

  it('rejects a nonsense period', () => {
    expect(() => rsi([1, 2, 3], 0)).toThrow(RangeError);
  });
});

describe('macd', () => {
  const trend = Array.from({ length: 120 }, (_, i) => 10000 + i * 25);

  it('is positive while the fast EMA leads a rising series', () => {
    const { macd: line } = macd(trend);
    expect(line.at(-1) as number).toBeGreaterThan(0);
  });

  it('is negative on a falling series', () => {
    const falling = [...trend].reverse();
    expect(macd(falling).macd.at(-1) as number).toBeLessThan(0);
  });

  it('keeps histogram = macd - signal', () => {
    const { macd: line, signal, histogram } = macd(trend);
    for (let i = 0; i < line.length; i += 1) {
      const l = line[i];
      const s = signal[i];
      const h = histogram[i];
      if (l === null || s === null || h === null) continue;
      expect(h).toBeCloseTo(l - s, 6);
    }
  });

  it('leaves all three series null before the slow EMA warms up', () => {
    const { macd: line, signal } = macd(trend, { fast: 12, slow: 26, signal: 9 });
    expect(line.slice(0, 25).every((v) => v === null)).toBe(true);
    expect(line[25]).not.toBeNull();
    // The signal line needs a further 9 defined MACD values.
    expect(signal[25]).toBeNull();
    expect(signal[33]).not.toBeNull();
  });

  it('rejects fast >= slow', () => {
    expect(() => macd(trend, { fast: 26, slow: 12 })).toThrow(RangeError);
  });
});

describe('atr', () => {
  const bar = (high: number, low: number, close: number): Bar => ({
    timestamp: 0,
    open: low,
    high,
    low,
    close,
    volume: 0,
  });

  it('uses the plain range when there are no gaps', () => {
    // Every bar spans exactly 10 and closes inside the prior range.
    const bars = Array.from({ length: 20 }, () => bar(110, 100, 105));
    expect(atr(bars, 14).at(-1)).toBe(10);
  });

  it('accounts for gaps via the prev-close terms', () => {
    const bars: Bar[] = [bar(110, 100, 105), bar(200, 190, 195)];
    // TR = max(200-190, |200-105|, |190-105|) = 95, not 10.
    expect(atr(bars, 1).at(-1)).toBe(95);
  });

  it('is null with fewer than two bars', () => {
    expect(atr([bar(110, 100, 105)], 14)).toEqual([null]);
    expect(atr([], 14)).toEqual([]);
  });
});
