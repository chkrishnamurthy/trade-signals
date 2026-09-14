import { describe, expect, it } from 'vitest';
import { backtestFno } from './fno-backtest.js';
import {
  DEFAULT_FNO_CONFIG,
  type FnoCandle,
  type FnoSetup,
  type FnoStrategyConfig,
} from './fno-types.js';

const T0 = Date.parse('2026-08-28T09:15:00+05:30');
const FIVE_MIN = 5 * 60 * 1000;
const STRATEGY: FnoStrategyConfig = { ...DEFAULT_FNO_CONFIG, tickPaise: 1, pendingWindowBars: 3 };
const NEVER_SQUARE_OFF = 1439;

function candle(i: number, o: number, h: number, l: number, c: number): FnoCandle {
  return { timestamp: T0 + i * FIVE_MIN, open: o, high: h, low: l, close: c, volume: 10, oi: 500 };
}

// A bullish setup at bar 0: trigger 110, stop 90, T1 130, T2 150, R = 20.
const BULL: FnoSetup = {
  index: 0,
  timestamp: T0,
  direction: 'BULLISH',
  triggerLevel: 110,
  invalidationLevel: 90,
  target1: 130,
  target2: 150,
  riskPaise: 20,
  factors: {
    vwap: 100,
    distanceToVwapPaise: 5,
    emaFast: 105,
    emaSlow: 100,
    atr: 5,
    oiChange: 10,
    runningAvgVolume: 10,
    barVolume: 20,
  },
};

const opts = (squareOffIstMinute = NEVER_SQUARE_OFF) => ({ squareOffIstMinute, qty: 1 });

describe('backtestFno', () => {
  it('fills on trigger and exits at target2', () => {
    const bars = [
      candle(0, 100, 100, 100, 100),
      candle(1, 105, 111, 105, 110), // triggers (high >= 110)
      candle(2, 111, 155, 120, 150), // hits T2 (high >= 150), no stop
    ];
    const { trades, summary } = backtestFno(bars, [BULL], STRATEGY, opts());
    const t = trades[0];
    expect(t?.status).toBe('TARGET2');
    expect(t?.entryIndex).toBe(1);
    expect(t?.entryPrice).toBe(110);
    expect(t?.exitPrice).toBe(150);
    expect(t?.grossPaise).toBe(40);
    expect(t?.rMultiple).toBe(2);
    expect(summary.wins).toBe(1);
  });

  it('exits at the stop when price breaks invalidation', () => {
    const bars = [
      candle(0, 100, 100, 100, 100),
      candle(1, 105, 111, 105, 110), // trigger
      candle(2, 108, 100, 85, 95), // low 85 <= stop 90
    ];
    const t = backtestFno(bars, [BULL], STRATEGY, opts()).trades[0];
    expect(t?.status).toBe('STOP');
    expect(t?.exitPrice).toBe(90);
    expect(t?.grossPaise).toBe(-20);
    expect(t?.rMultiple).toBe(-1);
  });

  it('assumes the stop first when a bar spans both stop and target', () => {
    const bars = [
      candle(0, 100, 100, 100, 100),
      candle(1, 105, 111, 105, 110), // trigger
      candle(2, 108, 200, 80, 150), // spans stop 90 AND target 150
    ];
    const t = backtestFno(bars, [BULL], STRATEGY, opts()).trades[0];
    expect(t?.status).toBe('STOP');
  });

  it('expires when the trigger is not hit within the pending window', () => {
    const bars = [
      candle(0, 100, 100, 100, 100),
      candle(1, 100, 105, 99, 101),
      candle(2, 101, 106, 100, 102),
      candle(3, 102, 108, 101, 103), // still below trigger 110
      candle(4, 103, 109, 102, 104),
    ];
    const t = backtestFno(bars, [BULL], STRATEGY, opts()).trades[0];
    expect(t?.status).toBe('EXPIRED');
    expect(t?.entryIndex).toBeNull();
  });

  it('squares off an unresolved trade at the square-off bar close', () => {
    const bars = [
      candle(0, 100, 100, 100, 100),
      candle(1, 105, 111, 105, 110), // trigger
      candle(2, 110, 115, 105, 112),
      candle(3, 112, 118, 108, 114), // never hits 150 or 90
    ];
    // Square off at bar 3's IST minute (09:15 + 15 min = 09:30 => 570).
    const t = backtestFno(bars, [BULL], STRATEGY, opts(570)).trades[0];
    expect(t?.status).toBe('SQUAREOFF');
    expect(t?.exitIndex).toBe(3);
    expect(t?.exitPrice).toBe(114);
  });
});
