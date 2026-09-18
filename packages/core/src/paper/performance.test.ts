import type { PaperPosition } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import { paperPerformance, paperPerformanceBy, wilson } from './performance.js';

const position = (net: number, o: Partial<PaperPosition> = {}): PaperPosition => ({
  id: 1,
  intentId: 1,
  strategyId: 'orb-vc',
  strategyVersionId: 1,
  instrumentId: 1,
  symbol: 'X',
  sector: null,
  direction: 'BUY',
  status: 'CLOSED',
  projection: {
    status: 'TARGET_2_HIT',
    cursor: 0,
    taken: true,
    skipReason: null,
    shares: 1,
    remainingShares: 0,
    fill: 100,
    fillAt: 0,
    effectiveStop: 90,
    exits: [],
    target1At: net > 0 ? 1 : null,
    endedAt: 60_000,
    resolution: 'OBSERVED',
    reason: '',
  },
  lockedPaise: 0,
  grossRealisedPaise: net + 10,
  chargesPaise: 10,
  netRealisedPaise: net,
  initialRiskPaise: 1_000,
  exitReason: net > 0 ? 'TARGET2' : 'STOP',
  openedAt: 0,
  closedAt: 60_000,
  ...o,
});

describe('paperPerformance', () => {
  it('computes the figures by hand: 3 wins (+300, +200, +100), 2 losses (−100, −150)', () => {
    const p = paperPerformance('g', [
      position(300),
      position(200),
      position(100),
      position(-100),
      position(-150),
    ]);
    expect(p).toMatchObject({
      closedTrades: 5,
      wins: 3,
      losses: 2,
      breakeven: 0,
      winRate: 0.6,
      averageWinPaise: 200,
      averageLossPaise: -125,
      profitFactor: 600 / 250,
      expectancyPaise: 70, // 350 / 5
      target1HitRate: 0.6,
      target2HitRate: 1, // projection status is TARGET_2_HIT in this fixture
      stopHitRate: 0.4,
      averageHoldingMs: 60_000,
      grossPaise: 400, // 350 + 5 × 10
      chargesPaise: 50,
      netPaise: 350,
      sampleSize: 'TOO_FEW',
    });
    expect(p.expectancyTimesRisked).toBeCloseTo(0.07, 10); // mean(net / 1000)
    expect(p.winRateLow95).toBeCloseTo(0.2307, 3); // Wilson, z = 1.96
    expect(p.winRateHigh95).toBeCloseTo(0.8824, 3);
  });
  it('excludes unresolved trades from rates but counts them', () => {
    const p = paperPerformance('g', [
      position(100),
      position(0, { projection: { ...position(0).projection, resolution: 'UNAVAILABLE' } }),
    ]);
    expect(p).toMatchObject({ closedTrades: 1, unresolvedTrades: 1, winRate: 1 });
  });
  it('sample-size flags and Wilson bounds', () => {
    expect(wilson(6, 10)?.map((x) => Number(x.toFixed(4)))).toEqual([0.3127, 0.8318]);
    expect(wilson(0, 0)).toBeNull();
    expect(
      paperPerformance(
        'g',
        Array.from({ length: 30 }, () => position(1)),
      ).sampleSize,
    ).toBe('EARLY');
    expect(
      paperPerformance(
        'g',
        Array.from({ length: 100 }, () => position(1)),
      ).sampleSize,
    ).toBe('OK');
    expect(paperPerformance('g', []).profitFactor).toBeNull();
  });
  it('groups by any key, sorted', () => {
    const out = paperPerformanceBy(
      [position(1, { strategyId: 'b' }), position(1, { strategyId: 'a' })],
      (p) => p.strategyId,
    );
    expect(out.map((o) => o.group)).toEqual(['a', 'b']);
  });
});
