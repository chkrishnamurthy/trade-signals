import { describe, expect, it } from 'vitest';
import { BUY_EXPECTED, SESSION_OPEN, todayPreamble } from './fixture.js';
import { openingRange, orbLevels } from './orb.js';

describe('openingRange', () => {
  it('builds the range from the first three candles', () => {
    expect(openingRange(todayPreamble(), SESSION_OPEN)).toEqual(BUY_EXPECTED.openingRange);
  });
  it('is null when a candle is missing or misaligned', () => {
    const bars = todayPreamble();
    expect(openingRange(bars.slice(0, 2), SESSION_OPEN)).toBeNull();
    expect(openingRange(bars.slice(1), SESSION_OPEN)).toBeNull();
    expect(openingRange(bars, SESSION_OPEN + 60_000)).toBeNull();
  });
});

describe('orbLevels', () => {
  const range = BUY_EXPECTED.openingRange;
  it('BUY: stop below the range low, targets one and two risk distances up', () => {
    expect(orbLevels(295_640, range, 'BUY', 5)).toEqual(BUY_EXPECTED.levels);
  });
  it('SELL: mirrors around the range high', () => {
    // stop = 295000 + floor(147.5) = 295147 → up to 295150; risk 2150 from 293000
    expect(orbLevels(293_000, range, 'SELL', 5)).toEqual({
      ref: 293_000,
      stop: 295_150,
      target1: 290_850,
      target2: 288_700,
      riskDistance: 2_150,
      tickSize: 5,
    });
  });
  it('widens a stop tighter than 0.30 % to exactly 0.30 %', () => {
    // ref 1000.00, range low 998.00: buffer floor(99800×5/10000)=49 → 99751 → 99750, risk 250 < 300
    // → stop = roundDown(100000 − 300) = 99700, risk 300, T1 100300, T2 100600
    const r = { high: 100_400, low: 99_800, mid: 100_100, rangeBps: 59.94, completeAt: 0 };
    expect(orbLevels(100_000, r, 'BUY', 5)).toEqual({
      ref: 100_000,
      stop: 99_700,
      target1: 100_300,
      target2: 100_600,
      riskDistance: 300,
      tickSize: 5,
    });
  });
  it('refuses a stop wider than 1.20 %', () => {
    // range low 987.00: buffer 49 → 98651 → 98650, risk 1350 > 1200
    const r = { high: 100_000, low: 98_700, mid: 99_350, rangeBps: 130.85, completeAt: 0 };
    expect(orbLevels(100_000, r, 'BUY', 5)).toBeNull();
  });
  it('rounds targets in the favourable direction on a coarse tick', () => {
    // tick 25: ref 100000, low 99400: buffer 49 → 99351 → 99350 (÷25 ✓), risk 650
    // T1 raw 100650 → up to 100650; T2 raw 101300 → 101300. Both already on tick.
    const r = { high: 100_200, low: 99_400, mid: 99_800, rangeBps: 80.16, completeAt: 0 };
    expect(orbLevels(100_000, r, 'BUY', 25)).toEqual({
      ref: 100_000,
      stop: 99_350,
      target1: 100_650,
      target2: 101_300,
      riskDistance: 650,
      tickSize: 25,
    });
    // tick 5, ref 100005 is off-tick → null rather than a silently rounded reference
    expect(orbLevels(100_001, r, 'BUY', 5)).toBeNull();
  });
});
