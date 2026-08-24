import { describe, expect, it } from 'vitest';
import type { PaperBucket, PaperResultsDto } from '@/server/paper-trades';
import {
  attentionItems,
  expectancyStatus,
  MIN_TRADES_FOR_VERDICT,
  outcomeMeta,
  overallVerdict,
  profitFactorStatus,
  rankBest,
  readTrend,
  sampleStatus,
  scoreBandLabel,
  splitByOutcome,
  strategyMeta,
  winRateStatus,
} from './paper-display';

/**
 * These tests exist because this page makes CLAIMS.
 *
 * Every other display module decides how something looks; this one decides
 * whether the product tells its user that a losing engine is working, or that
 * eleven trades are evidence, or that results are improving when they are not.
 * The thresholds are therefore pinned here, and each case is chosen to sit on
 * the wrong side of a boundary if the logic ever drifts.
 */

function bucket(overrides: Partial<PaperBucket> & Pick<PaperBucket, 'label'>): PaperBucket {
  return {
    trades: 50,
    hitRate: 0.4,
    expectancyR: 0,
    profitFactor: 1,
    ...overrides,
  };
}

function results(overrides: Partial<PaperResultsDto> = {}): PaperResultsDto {
  const summary = {
    trades: 100,
    wins: 40,
    losses: 60,
    hitRate: 0.4,
    expectancyR: 0.1,
    profitFactor: 1.1,
    averageWinR: 1.5,
    averageLossR: -1,
    averageBarsHeld: 12,
    breakevenHitRate: 0.4,
    ...(overrides.summary ?? {}),
  };
  return {
    configured: true,
    trades: [],
    sessions: 10,
    open: 0,
    byScore: [],
    byStrategy: [],
    byExit: [],
    byRegime: [],
    byDirection: [],
    bySession: [],
    marginOfErrorPoints: 10,
    ...overrides,
    summary,
  };
}

describe('strategyMeta', () => {
  it('names the recorded strategy ids', () => {
    expect(strategyMeta('trend-continuation-long').name).toBe('Trend continuation');
    expect(strategyMeta('trend-continuation-long').direction).toBe('long');
    expect(strategyMeta('vwap-breakdown').direction).toBe('short');
  });

  it('degrades gracefully for a strategy shipped after this map', () => {
    const meta = strategyMeta('gap-fade-long');
    expect(meta.name).toBe('Gap fade long');
    expect(meta.direction).toBeNull();
  });
});

describe('outcomeMeta', () => {
  it('says what a stop means without using the word stop', () => {
    expect(outcomeMeta('stop').label).toBe('Proven wrong');
    expect(outcomeMeta('stop').tone).toBe('bearish');
  });

  it('keeps an unresolved trade visually distinct from a loss', () => {
    expect(outcomeMeta('unresolved').tone).toBe('outline');
  });
});

describe('scoreBandLabel', () => {
  it('leads with the band name and keeps the range', () => {
    expect(scoreBandLabel('60–69 watch')).toBe('Watch (60–69)');
    expect(scoreBandLabel('90+ exceptional')).toBe('Exceptional (90+)');
  });

  it('passes through anything it does not recognise', () => {
    expect(scoreBandLabel('unbanded')).toBe('unbanded');
  });
});

describe('expectancyStatus', () => {
  it('refuses to grade a sample too small to mean anything', () => {
    // A clearly terrible number, but on 29 trades it is not a finding.
    expect(expectancyStatus(-0.9, MIN_TRADES_FOR_VERDICT - 1).grade).toBe('unknown');
    expect(expectancyStatus(-0.9, MIN_TRADES_FOR_VERDICT - 1).label).toBe('Too early');
  });

  it('grades once the sample is usable', () => {
    expect(expectancyStatus(-0.42, 334).grade).toBe('poor');
    expect(expectancyStatus(0.2, 334).grade).toBe('good');
    expect(expectancyStatus(0, 334).grade).toBe('mixed');
  });
});

describe('winRateStatus', () => {
  it('judges against breakeven, not against fifty percent', () => {
    // 33% wins on a payoff that only needs 25% is good, not bad.
    expect(winRateStatus(0.33, 0.25, 300, 5).grade).toBe('good');
    // 55% wins on a payoff that needs 70% is poor, despite being over half.
    expect(winRateStatus(0.55, 0.7, 300, 5).grade).toBe('poor');
  });

  it('will not call a lead that sits inside the margin of error', () => {
    // Two points ahead, but the measurement is only good to ±10.
    expect(winRateStatus(0.42, 0.4, 300, 10).grade).toBe('mixed');
    expect(winRateStatus(0.42, 0.4, 300, 10).label).toBe('Too close to call');
  });

  it('stays unknown while breakeven is undefined', () => {
    expect(winRateStatus(0.5, null, 300, 5).grade).toBe('unknown');
  });
});

describe('profitFactorStatus and sampleStatus', () => {
  it('treats a profit factor under one as losers dominating', () => {
    expect(profitFactorStatus(0.55, 334).grade).toBe('poor');
    expect(profitFactorStatus(1.4, 334).grade).toBe('good');
  });

  it('calls a handful of trades an anecdote', () => {
    expect(sampleStatus(7).label).toBe('Anecdote');
    expect(sampleStatus(334).grade).toBe('good');
  });
});

describe('overallVerdict', () => {
  it('says nothing is graded when nothing is', () => {
    const verdict = overallVerdict(results({ summary: { trades: 0 } as never }));
    expect(verdict.grade).toBe('unknown');
    expect(verdict.headline).toBe('Nothing graded yet');
  });

  it('declines to judge a thin sample and says why', () => {
    const verdict = overallVerdict(results({ summary: { trades: 7, expectancyR: -1.2 } as never }));
    expect(verdict.grade).toBe('unknown');
    expect(verdict.headline).toBe('Too early to judge');
    expect(verdict.detail).toContain('7');
  });

  it('states a losing engine plainly, in units of risk rather than rupees', () => {
    const verdict = overallVerdict(
      results({ summary: { trades: 334, expectancyR: -0.418 } as never, sessions: 50 }),
    );
    expect(verdict.grade).toBe('poor');
    expect(verdict.headline).toBe('Losing money');
    expect(verdict.detail).toContain('0.42');
    expect(verdict.detail).not.toMatch(/₹|rupee/i);
  });

  it('never promises a profit even when the sample is good', () => {
    const verdict = overallVerdict(
      results({ summary: { trades: 334, expectancyR: 0.4 } as never }),
    );
    expect(verdict.grade).toBe('good');
    expect(verdict.detail).not.toMatch(/you would have|guarantee|will make/i);
  });
});

describe('rankBest and splitByOutcome', () => {
  const buckets = [
    bucket({ label: 'breakout', expectancyR: -0.345, trades: 82 }),
    bucket({ label: 'vwap-reclaim', expectancyR: 2.261, trades: 2 }),
    bucket({ label: 'reversal-short', expectancyR: -1.147, trades: 27 }),
  ];

  it('orders best first and scales bars against the widest magnitude', () => {
    const ranked = rankBest(buckets);
    expect(ranked.map((entry) => entry.label)).toEqual([
      'vwap-reclaim',
      'breakout',
      'reversal-short',
    ]);
    expect(ranked[0]?.share).toBe(1);
    // 1.147 / 2.261
    expect(ranked[2]?.share).toBeCloseTo(0.507, 2);
  });

  it('flags a thin bucket rather than hiding it', () => {
    const winner = rankBest(buckets)[0];
    expect(winner?.label).toBe('vwap-reclaim');
    expect(winner?.reliable).toBe(false);
  });

  it('splits winners from losers, each ordered by how extreme it is', () => {
    const { working, failing } = splitByOutcome(buckets);
    expect(working.map((entry) => entry.label)).toEqual(['vwap-reclaim']);
    // Worst first, so the thing needing attention leads.
    expect(failing.map((entry) => entry.label)).toEqual(['reversal-short', 'breakout']);
  });
});

describe('readTrend', () => {
  const session = (label: string, expectancyR: number, trades = 10): PaperBucket =>
    bucket({ label, expectancyR, trades });

  it('refuses to read a trend from too few sessions', () => {
    expect(readTrend([session('a', -1), session('b', 1)]).direction).toBe('unknown');
  });

  it('calls an improvement only when it clears the noise floor', () => {
    const trend = readTrend([
      session('1', -1),
      session('2', -1),
      session('3', -1),
      session('4', 0.5),
      session('5', 0.5),
      session('6', 0.5),
    ]);
    expect(trend.direction).toBe('improving');
    expect(trend.recentR).toBeCloseTo(0.5, 5);
    expect(trend.earlierR).toBeCloseTo(-1, 5);
  });

  it('reports no real change for a difference inside the noise floor', () => {
    const trend = readTrend([
      session('1', -0.5),
      session('2', -0.5),
      session('3', -0.5),
      session('4', -0.55),
      session('5', -0.55),
      session('6', -0.55),
    ]);
    expect(trend.direction).toBe('flat');
    expect(trend.detail).toContain('no real change');
  });

  it('names a decline', () => {
    const trend = readTrend([
      session('1', 0.6),
      session('2', 0.6),
      session('3', 0.6),
      session('4', -0.4),
      session('5', -0.4),
      session('6', -0.4),
    ]);
    expect(trend.direction).toBe('declining');
  });

  it('weights by trade count, so a one-signal session cannot swing the reading', () => {
    // The recent half holds one wild session of a single trade and two solid
    // ones. An unweighted mean would put the recent half at +1.00R against
    // -0.50R before it and shout "improving"; weighted, the single trade barely
    // moves the reading and the honest answer is that nothing changed.
    const trend = readTrend([
      session('1', -0.5, 20),
      session('2', -0.5, 20),
      session('3', -0.5, 20),
      session('4', 4, 1),
      session('5', -0.5, 20),
      session('6', -0.5, 20),
    ]);
    expect(trend.recentR).toBeCloseTo((4 * 1 + -0.5 * 40) / 41, 5);
    expect(trend.direction).toBe('flat');
  });
});

describe('attentionItems', () => {
  it('leads with the sample size when there is barely any data', () => {
    const items = attentionItems(results({ summary: { trades: 7 } as never }));
    expect(items[0]?.id).toBe('sample');
    expect(items[0]?.severity).toBe('high');
  });

  it('flags a win rate short of breakeven, with its margin of error', () => {
    const items = attentionItems(
      results({
        summary: { trades: 334, hitRate: 0.31, breakevenHitRate: 0.45 } as never,
        marginOfErrorPoints: 5,
      }),
    );
    const breakeven = items.find((item) => item.id === 'breakeven');
    expect(breakeven?.title).toContain('14.0 points short');
    expect(breakeven?.detail).toContain('±5 points');
  });

  it('flags losses that run past the invalidation level', () => {
    const items = attentionItems(
      results({ summary: { trades: 334, averageLossR: -1.458, losses: 214 } as never }),
    );
    const overrun = items.find((item) => item.id === 'loss-overrun');
    expect(overrun?.severity).toBe('high');
    expect(overrun?.detail).toContain('1.46');
  });

  it('does not flag a loss overrun on too few losses to judge', () => {
    const items = attentionItems(
      results({ summary: { trades: 334, averageLossR: -1.458, losses: 3 } as never }),
    );
    expect(items.find((item) => item.id === 'loss-overrun')).toBeUndefined();
  });

  it('names only the failing strategies that have enough trades behind them', () => {
    const items = attentionItems(
      results({
        summary: { trades: 334 } as never,
        byStrategy: [
          bucket({ label: 'reversal-short', expectancyR: -1.147, trades: 27 }),
          // Worse, but on four trades — must not be named as a finding.
          bucket({ label: 'momentum-short', expectancyR: -2.5, trades: 4 }),
        ],
      }),
    );
    const failing = items.find((item) => item.id === 'failing-strategies');
    expect(failing?.detail).toContain('Reversal');
    expect(failing?.detail).not.toContain('Momentum');
  });

  it('mentions open trades as information, never as a problem', () => {
    const items = attentionItems(results({ summary: { trades: 334 } as never, open: 3 }));
    const open = items.find((item) => item.id === 'open');
    expect(open?.severity).toBe('info');
  });

  it('is empty when nothing has been graded at all', () => {
    expect(attentionItems(results({ summary: { trades: 0 } as never }))).toEqual([]);
  });
});
