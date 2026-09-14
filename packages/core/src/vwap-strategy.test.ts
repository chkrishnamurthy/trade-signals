import { evidenceSchema } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import { strategyFixture } from './vwap-fixture.js';
import { aggregateClosedMinutes, evaluateVwapSetup, relativeVolume } from './vwap-strategy.js';

describe('Confirmed VWAP Trend Pullback', () => {
  for (const direction of ['BUY', 'SELL'] as const)
    it(`publishes an explained ${direction} with immutable input and integer tick levels`, () => {
      const input = strategyFixture(direction);
      const copy = structuredClone(input);
      const result = evaluateVwapSetup(input, direction);
      expect(result.failedConditions).toEqual([]);
      const e = evidenceSchema.parse(result.evidence);
      expect(e.direction).toBe(direction);
      expect(e.score).toBe(e.factors.reduce((s, f) => s + f.earned, 0));
      expect(e.levels.risk).toBeGreaterThan(0);
      expect(e.levels.target1 % 5).toBe(0);
      expect(e.levels.invalidation % 5).toBe(0);
      expect(input).toEqual(copy);
      expect(e).toEqual(evaluateVwapSetup(input, direction).evidence);
    });
  it('rejects any forming, missing, reordered or duplicate candle', () => {
    const input = strategyFixture();
    for (const bars of [
      [...input.bars, { ...input.bars.at(-1)!, timestamp: input.now }],
      input.bars.filter((_, i) => i !== 302),
      [...input.bars.slice(0, -1), input.bars.at(-2)!],
    ])
      expect(evaluateVwapSetup({ ...input, bars }, 'BUY').failedConditions).toContain(
        'CLOSED_HISTORY',
      );
  });
  it('rejects weak volume, conflicting benchmark and stale spread observations', () => {
    const input = strategyFixture();
    const bars = input.bars.map((b, i) =>
      i === input.bars.length - 1 ? { ...b, volume: 100 } : b,
    );
    expect(evaluateVwapSetup({ ...input, bars }, 'BUY').failedConditions).toContain(
      'RELATIVE_VOLUME',
    );
    expect(
      evaluateVwapSetup({ ...input, benchmark: strategyFixture('SELL').benchmark }, 'BUY')
        .failedConditions,
    ).toContain('NIFTY_ALIGNMENT');
    expect(
      evaluateVwapSetup(
        { ...input, quote: { ...input.quote, timestamp: input.now - 16_000 } },
        'BUY',
      ).failedConditions,
    ).toContain('LIQUIDITY');
    expect(
      evaluateVwapSetup(
        { ...input, benchmark: input.benchmark.map((b) => ({ ...b, volume: 0 })) },
        'BUY',
      ).failedConditions,
    ).toContain('BENCHMARK_UNAVAILABLE');
  });
  it('rejects low ADX and excessive technical risk', () => {
    const input = strategyFixture();
    const bars = input.bars.map((b, i) => {
      const close = 100000 + (i % 2) * 500;
      return { ...b, open: close - 10, high: close + 100, low: close - 100, close };
    });
    expect(evaluateVwapSetup({ ...input, bars }, 'BUY').failedConditions).toContain('ADX');
    expect(evaluateVwapSetup({ ...input, tickSize: 500 }, 'BUY').failedConditions).toContain(
      'RISK_REWARD',
    );
  });
  it('rejects late publication and a closed market', () => {
    const input = strategyFixture();
    expect(
      evaluateVwapSetup({ ...input, now: input.now + 30_000 }, 'BUY').failedConditions,
    ).toContain('SESSION');
    expect(evaluateVwapSetup({ ...input, marketOpen: false }, 'BUY').failedConditions).toContain(
      'SESSION',
    );
  });
  it('requires a real pullback, rather than reusing the confirmation candle', () => {
    const input = strategyFixture();
    expect(evaluateVwapSetup({ ...input, bars: input.benchmark }, 'BUY').evidence).toBeNull();
  });
  it('excludes the current candle from RVOL baseline', () => {
    const bar = strategyFixture().bars[0]!;
    const bars = Array.from({ length: 21 }, (_, i) => ({ ...bar, volume: i === 20 ? 200 : 100 }));
    expect(relativeVolume(bars, 20)).toBe(2);
    expect(relativeVolume(bars, 19)).toBeNull();
  });
  it('derives only five distinct completed minute candles', () => {
    const bar = strategyFixture().bars[0]!;
    const minutes = Array.from({ length: 5 }, (_, i) => ({
      ...bar,
      timestamp: bar.timestamp + i * 60_000,
    }));
    expect(aggregateClosedMinutes(minutes, bar.timestamp + 300_000)).toHaveLength(1);
    expect(aggregateClosedMinutes(minutes, bar.timestamp + 299_999)).toEqual([]);
    expect(aggregateClosedMinutes(minutes.slice(1), bar.timestamp + 300_000)).toEqual([]);
    expect(aggregateClosedMinutes([...minutes, minutes[0]!], bar.timestamp + 300_000)).toEqual([]);
  });
});
