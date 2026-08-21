import { describe, expect, it } from 'vitest';
import type { Bar } from '../types.js';
import { DEFAULT_STRATEGY } from './config.js';
import { evaluateSignals } from './engine.js';
import { SWING_MIN_CRITERIA, scanSwing } from './swing.js';

/** Builds a deterministic bar series — no randomness in tests. */
function series(closes: number[], volumes?: number[]): Bar[] {
  return closes.map((close, i) => ({
    timestamp: i * 86_400_000,
    open: close,
    high: close + 50,
    low: close - 50,
    close,
    volume: volumes?.[i] ?? 100_000,
  }));
}

const uptrend = series(Array.from({ length: 260 }, (_, i) => 100_000 + i * 300));
const downtrend = series(Array.from({ length: 260 }, (_, i) => 178_000 - i * 300));
const flat = series(Array.from({ length: 260 }, () => 100_000));

describe('evaluateSignals — purity', () => {
  it('is deterministic: identical input gives identical output', () => {
    const a = evaluateSignals(uptrend);
    const b = evaluateSignals(uptrend);
    expect(a).toEqual(b);
  });

  it('does not mutate its input', () => {
    const bars = series([1, 2, 3].map((n) => n * 1000));
    const snapshot = JSON.parse(JSON.stringify(bars));
    evaluateSignals(bars);
    expect(bars).toEqual(snapshot);
  });
});

describe('evaluateSignals — direction', () => {
  it('reads a sustained uptrend as bullish', () => {
    const report = evaluateSignals(uptrend);
    expect(report.direction).toMatch(/bullish/);
    expect(report.strength).toBeGreaterThan(50);
    expect(report.bias).toBeGreaterThan(0);
  });

  it('reads a sustained downtrend as bearish', () => {
    const report = evaluateSignals(downtrend);
    expect(report.direction).toMatch(/bearish/);
    expect(report.strength).toBeLessThan(50);
  });

  it('maps strength onto 0..100 with 50 as neutral', () => {
    for (const bars of [uptrend, downtrend, flat]) {
      const { strength } = evaluateSignals(bars);
      expect(strength).toBeGreaterThanOrEqual(0);
      expect(strength).toBeLessThanOrEqual(100);
    }
    expect(evaluateSignals(uptrend).strength).toBe(
      Math.round((evaluateSignals(uptrend).bias + 1) * 50),
    );
  });
});

describe('evaluateSignals — insufficient data', () => {
  it('refuses to judge a short series rather than guessing', () => {
    const report = evaluateSignals(series([100, 200, 300]));
    expect(report.insufficientData).toBe(true);
    expect(report.direction).toBe('neutral');
    expect(report.strength).toBe(50);
    expect(report.factors).toEqual([]);
  });

  it('handles an empty series', () => {
    const report = evaluateSignals([]);
    expect(report.insufficientData).toBe(true);
    expect(report.indicators.ema20).toBeNull();
  });
});

describe('evaluateSignals — factor breakdown', () => {
  it('every factor carries its own evidence, so the UI need not recompute', () => {
    const { factors } = evaluateSignals(uptrend);
    expect(factors.length).toBeGreaterThan(3);
    for (const factor of factors) {
      expect(factor.key).toBeTruthy();
      expect(factor.label).toBeTruthy();
      expect(factor.detail).toBeTruthy();
      expect(factor.score).toBeGreaterThanOrEqual(-1);
      expect(factor.score).toBeLessThanOrEqual(1);
      expect(factor.weight).toBeGreaterThan(0);
    }
  });

  it('bias is exactly the weighted mean of the factor scores', () => {
    const { factors, bias } = evaluateSignals(uptrend);
    const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
    const expected = factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight;
    expect(bias).toBeCloseTo(expected, 10);
  });

  it('reports price above every EMA in an uptrend', () => {
    const keys = evaluateSignals(uptrend)
      .factors.filter((f) => f.score > 0)
      .map((f) => f.key);
    expect(keys).toContain('aboveEma20');
    expect(keys).toContain('aboveEma50');
    expect(keys).toContain('aboveEma200');
  });
});

describe('evaluateSignals — indicator snapshot', () => {
  it('stacks the EMAs in trend order during an uptrend', () => {
    const { ema20, ema50, ema200 } = evaluateSignals(uptrend).indicators;
    expect(ema20).not.toBeNull();
    expect(ema20 as number).toBeGreaterThan(ema50 as number);
    expect(ema50 as number).toBeGreaterThan(ema200 as number);
  });

  it('keeps all prices as integer paise', () => {
    const ind = evaluateSignals(uptrend).indicators;
    for (const value of [
      ind.close,
      ind.ema20,
      ind.ema50,
      ind.ema200,
      ind.atr,
      ind.high52w,
      ind.low52w,
    ]) {
      if (value === null) continue;
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('computes relative volume against the prior bars, excluding the current one', () => {
    const volumes = [...Array.from({ length: 259 }, () => 100_000), 300_000];
    const bars = series(
      Array.from({ length: 260 }, (_, i) => 100_000 + i * 300),
      volumes,
    );
    const { relativeVolume, averageVolume } = evaluateSignals(bars).indicators;
    expect(averageVolume).toBe(100_000);
    expect(relativeVolume).toBeCloseTo(3, 6);
  });

  it('derives the 52-week range from the trailing 252 bars', () => {
    const { high52w, low52w } = evaluateSignals(uptrend).indicators;
    const window = uptrend.slice(-252);
    expect(high52w).toBe(Math.max(...window.map((b) => b.high)));
    expect(low52w).toBe(Math.min(...window.map((b) => b.low)));
  });
});

describe('evaluateSignals — setups', () => {
  it('names a golden-cross alignment in a long uptrend', () => {
    expect(evaluateSignals(uptrend).setups).toContain('Golden cross alignment');
  });

  it('names a death-cross alignment in a long downtrend', () => {
    expect(evaluateSignals(downtrend).setups).toContain('Death cross alignment');
  });

  it('flags a breakout when price clears the recent range', () => {
    const closes = [...Array.from({ length: 259 }, () => 100_000), 130_000];
    expect(evaluateSignals(series(closes)).setups).toContain('Breakout');
  });

  it('flags a breakdown when price loses the recent range', () => {
    const closes = [...Array.from({ length: 259 }, () => 100_000), 70_000];
    expect(evaluateSignals(series(closes)).setups).toContain('Breakdown');
  });

  it('never repeats a setup name', () => {
    const { setups } = evaluateSignals(uptrend);
    expect(new Set(setups).size).toBe(setups.length);
  });
});

describe('evaluateSignals — configurability', () => {
  it('honours a changed weight, so strategy lives in config not code', () => {
    const base = evaluateSignals(uptrend, DEFAULT_STRATEGY);
    const reweighted = evaluateSignals(uptrend, {
      ...DEFAULT_STRATEGY,
      weights: { ...DEFAULT_STRATEGY.weights, aboveEma200: 100 },
    });
    expect(reweighted.bias).not.toBeCloseTo(base.bias, 6);
  });

  it('honours changed EMA periods', () => {
    const report = evaluateSignals(uptrend, { ...DEFAULT_STRATEGY, emaFast: 5, emaMedium: 10 });
    expect(report.factors.some((f) => f.label.includes('5 EMA'))).toBe(true);
  });
});

describe('scanSwing', () => {
  it('qualifies a clean uptrend and names the setup', () => {
    const candidate = scanSwing(uptrend);
    expect(candidate.qualifies).toBe(true);
    expect(candidate.met).toBeGreaterThanOrEqual(SWING_MIN_CRITERIA);
    expect(candidate.setupName).toBeTruthy();
  });

  it('does not qualify a downtrend', () => {
    expect(scanSwing(downtrend).qualifies).toBe(false);
  });

  it('does not qualify on insufficient data', () => {
    expect(scanSwing(series([1000, 2000])).qualifies).toBe(false);
  });

  it('reports every criterion with its own evidence', () => {
    const { criteria, total } = scanSwing(uptrend);
    expect(criteria).toHaveLength(total);
    for (const criterion of criteria) {
      expect(criterion.label).toBeTruthy();
      expect(criterion.detail).toBeTruthy();
      expect(typeof criterion.met).toBe('boolean');
    }
  });

  it('met is exactly the count of satisfied criteria', () => {
    const { criteria, met } = scanSwing(uptrend);
    expect(met).toBe(criteria.filter((c) => c.met).length);
  });
});
