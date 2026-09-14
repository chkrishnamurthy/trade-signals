import { describe, expect, it } from 'vitest';
import { evaluateFuturesVwapOi } from './fno-strategy.js';
import type { FnoCandle, FnoStrategyConfig } from './fno-types.js';

const T0 = Date.parse('2026-08-28T09:15:00+05:30');
const FIVE_MIN = 5 * 60 * 1000;

// Small periods so a hand-built series warms up quickly.
const CONFIG: FnoStrategyConfig = {
  tickPaise: 1,
  warmupBars: 3,
  emaFast: 2,
  emaSlow: 3,
  atrPeriod: 2,
  pullbackAtrMult: 1,
  oiLookback: 1,
  volumeMultiple: 1,
  pendingWindowBars: 3,
  targetR: [1, 2],
};

type Row = [o: number, h: number, l: number, c: number, v: number, oi: number];

function candles(rows: readonly Row[]): FnoCandle[] {
  return rows.map(([open, high, low, close, volume, oi], i) => ({
    timestamp: T0 + i * FIVE_MIN,
    open,
    high,
    low,
    close,
    volume,
    oi,
  }));
}

const UPTREND: Row[] = [
  [100, 101, 99, 100, 10, 500],
  [100, 103, 100, 102, 10, 505],
  [102, 105, 101, 104, 10, 510],
  [104, 107, 103, 106, 10, 515],
  [106, 109, 105, 108, 10, 520],
  [108, 111, 107, 110, 20, 525],
  [110, 113, 109, 112, 20, 530],
  [111, 114, 106, 113, 40, 540], // pullback + green + OI up + high volume
];

const DOWNTREND: Row[] = [
  [200, 201, 199, 200, 10, 500],
  [200, 200, 197, 198, 10, 505],
  [198, 199, 195, 196, 10, 510],
  [196, 197, 193, 194, 10, 515],
  [194, 195, 191, 192, 10, 520],
  [192, 193, 189, 190, 20, 525],
  [190, 191, 187, 188, 20, 530],
  [189, 194, 186, 187, 40, 540], // rally to VWAP + red + OI up
];

describe('evaluateFuturesVwapOi', () => {
  it('produces a bullish setup with correct level math on an uptrend pullback', () => {
    const bars = candles(UPTREND);
    const setups = evaluateFuturesVwapOi(bars, CONFIG);
    expect(setups.length).toBeGreaterThanOrEqual(1);

    const bulls = setups.filter((s) => s.direction === 'BULLISH');
    expect(bulls.length).toBeGreaterThanOrEqual(1);

    for (const s of setups) {
      const c = bars[s.index];
      if (!c) throw new Error('missing candle');
      expect(s.direction).toBe('BULLISH');
      expect(s.triggerLevel).toBe(c.high + CONFIG.tickPaise); // tick = 1
      expect(s.invalidationLevel).toBe(c.low);
      expect(s.riskPaise).toBe(s.triggerLevel - s.invalidationLevel);
      expect(s.target1).toBe(s.triggerLevel + s.riskPaise);
      expect(s.target2).toBe(s.triggerLevel + 2 * s.riskPaise);
      expect(s.factors.oiChange).toBeGreaterThan(0);
      expect(s.factors.distanceToVwapPaise).toBeGreaterThan(0);
    }
  });

  it('fires nothing when open interest is not rising', () => {
    const flatOi = UPTREND.map((r) => [r[0], r[1], r[2], r[3], r[4], 500] as Row);
    const setups = evaluateFuturesVwapOi(candles(flatOi), CONFIG);
    expect(setups).toHaveLength(0);
  });

  it('produces a bearish setup with mirrored level math on a downtrend rally', () => {
    const bars = candles(DOWNTREND);
    const setups = evaluateFuturesVwapOi(bars, CONFIG);
    const bears = setups.filter((s) => s.direction === 'BEARISH');
    expect(bears.length).toBeGreaterThanOrEqual(1);

    for (const s of bears) {
      const c = bars[s.index];
      if (!c) throw new Error('missing candle');
      expect(s.triggerLevel).toBe(c.low - CONFIG.tickPaise);
      expect(s.invalidationLevel).toBe(c.high);
      expect(s.riskPaise).toBe(s.invalidationLevel - s.triggerLevel);
      expect(s.target1).toBe(s.triggerLevel - s.riskPaise);
      expect(s.target2).toBe(s.triggerLevel - 2 * s.riskPaise);
      expect(s.factors.oiChange).toBeGreaterThan(0);
    }
  });
});
