import { describe, expect, it } from 'vitest';
import {
  ALL_TIMEFRAMES,
  BUCKET_ORIGIN_IST_MINUTES,
  derivationSource,
  isPersistedTimeframe,
  isTimeframe,
  PERSISTED_TIMEFRAMES,
  TIMEFRAME_LABELS,
  Timeframe,
  timeframeFromCode,
  timeframeFromLabel,
  timeframeMinutes,
} from './timeframe.js';

describe('Timeframe codes', () => {
  it('encodes each timeframe as its length in minutes', () => {
    expect(Timeframe.M1).toBe(1);
    expect(Timeframe.M5).toBe(5);
    expect(Timeframe.M15).toBe(15);
    expect(Timeframe.M30).toBe(30);
    expect(Timeframe.H1).toBe(60);
    expect(Timeframe.D1).toBe(1440);
    expect(Timeframe.W1).toBe(10080);
  });

  it('fits every code in a signed SMALLINT', () => {
    for (const timeframe of ALL_TIMEFRAMES) {
      expect(timeframe).toBeGreaterThanOrEqual(1);
      expect(timeframe).toBeLessThanOrEqual(32767);
      expect(Number.isInteger(timeframe)).toBe(true);
    }
  });

  it('lists every timeframe exactly once, ascending', () => {
    expect(ALL_TIMEFRAMES).toEqual([1, 5, 15, 30, 60, 1440, 10080]);
    expect(new Set(ALL_TIMEFRAMES).size).toBe(ALL_TIMEFRAMES.length);
    expect([...ALL_TIMEFRAMES].sort((a, b) => a - b)).toEqual([...ALL_TIMEFRAMES]);
  });

  it('labels every timeframe', () => {
    expect(Object.keys(TIMEFRAME_LABELS)).toHaveLength(ALL_TIMEFRAMES.length);
    expect(ALL_TIMEFRAMES.map((t) => TIMEFRAME_LABELS[t])).toEqual([
      '1m',
      '5m',
      '15m',
      '30m',
      '1h',
      '1d',
      '1w',
    ]);
  });
});

describe('isTimeframe', () => {
  it('accepts known codes', () => {
    for (const timeframe of ALL_TIMEFRAMES) {
      expect(isTimeframe(timeframe)).toBe(true);
    }
  });

  it('rejects plausible-looking but unknown codes', () => {
    for (const code of [0, 2, 10, 45, 120, 1439, -1, 1.5]) {
      expect(isTimeframe(code), String(code)).toBe(false);
    }
  });
});

describe('timeframeFromCode', () => {
  it('round-trips every timeframe', () => {
    for (const timeframe of ALL_TIMEFRAMES) {
      expect(timeframeFromCode(timeframe)).toBe(timeframe);
    }
  });

  it('rejects an unknown SMALLINT rather than silently passing it through', () => {
    expect(() => timeframeFromCode(45)).toThrow(RangeError);
    expect(() => timeframeFromCode(0)).toThrow(/not a known timeframe/);
  });
});

describe('timeframeFromLabel', () => {
  it('parses every label', () => {
    for (const timeframe of ALL_TIMEFRAMES) {
      const label = TIMEFRAME_LABELS[timeframe];
      expect(label).toBeDefined();
      expect(timeframeFromLabel(label as string)).toBe(timeframe);
    }
  });

  it('rejects unknown or differently-cased labels', () => {
    for (const label of ['', '2m', '1M', '1D', 'daily', '60m']) {
      expect(() => timeframeFromLabel(label), label).toThrow(RangeError);
    }
  });
});

describe('timeframeMinutes', () => {
  it('returns the candle length in minutes', () => {
    expect(timeframeMinutes(Timeframe.M15)).toBe(15);
    expect(timeframeMinutes(Timeframe.H1)).toBe(60);
    expect(timeframeMinutes(Timeframe.D1)).toBe(1440);
    expect(timeframeMinutes(Timeframe.W1)).toBe(10080);
  });

  it('makes intraday timeframes exact multiples of 1m', () => {
    for (const timeframe of [Timeframe.M5, Timeframe.M15, Timeframe.M30, Timeframe.H1]) {
      expect(timeframeMinutes(timeframe) % timeframeMinutes(Timeframe.M1)).toBe(0);
    }
    expect(timeframeMinutes(Timeframe.W1) % timeframeMinutes(Timeframe.D1)).toBe(0);
  });
});

describe('isPersistedTimeframe', () => {
  it('is true only for 1m and 1d — everything else derives on read', () => {
    expect(PERSISTED_TIMEFRAMES).toEqual([Timeframe.M1, Timeframe.D1]);
    for (const timeframe of ALL_TIMEFRAMES) {
      const expected = timeframe === Timeframe.M1 || timeframe === Timeframe.D1;
      expect(isPersistedTimeframe(timeframe), TIMEFRAME_LABELS[timeframe]).toBe(expected);
    }
  });
});

describe('derivationSource', () => {
  it('builds intraday timeframes from 1m', () => {
    for (const timeframe of [
      Timeframe.M1,
      Timeframe.M5,
      Timeframe.M15,
      Timeframe.M30,
      Timeframe.H1,
    ]) {
      expect(derivationSource(timeframe)).toBe(Timeframe.M1);
    }
  });

  it('builds weekly from daily', () => {
    expect(derivationSource(Timeframe.W1)).toBe(Timeframe.D1);
    expect(derivationSource(Timeframe.D1)).toBe(Timeframe.D1);
  });

  it('always names a persisted timeframe', () => {
    for (const timeframe of ALL_TIMEFRAMES) {
      expect(isPersistedTimeframe(derivationSource(timeframe))).toBe(true);
    }
  });
});

describe('BUCKET_ORIGIN_IST_MINUTES', () => {
  it('is the 09:15 IST open, so buckets align to the session not the hour', () => {
    expect(BUCKET_ORIGIN_IST_MINUTES).toBe(555);
    expect(BUCKET_ORIGIN_IST_MINUTES % 60).not.toBe(0);
  });
});
