import { describe, expect, it } from 'vitest';
import { buildMarketBrief, countSessionsBehind, expectedLatestSession } from './build';
import type { MarketBriefInput, SessionInstrumentFacts } from './types';

// A Friday, 18:30 IST — after the end-of-day pass completes.
const FRIDAY_EVENING = new Date('2026-09-11T13:00:00Z');

function mkFacts(
  id: number,
  partial: Partial<SessionInstrumentFacts> = {},
): SessionInstrumentFacts {
  return {
    instrumentId: id,
    symbol: `SYM${String(id).padStart(3, '0')}`,
    name: `Name ${id}`,
    sector: 'Test',
    close: 100_00,
    changePercent: 1,
    sma20: 90_00,
    sma50: 90_00,
    rsi14: 55,
    macdHistogram: 10,
    relativeVolume: 1,
    barCount: 200,
    ...partial,
  };
}

interface ScenarioOpts {
  advancing: number;
  declining: number;
  unchanged: number;
  above20: number;
  above50: number;
  total: number;
  expected: number;
}

function scenario(opts: ScenarioOpts): MarketBriefInput {
  const current = new Map<number, SessionInstrumentFacts>();

  for (let i = 0; i < opts.total; i += 1) {
    const changePercent = i < opts.advancing ? 1.5 : i < opts.advancing + opts.declining ? -1.5 : 0;
    const sma20 = i < opts.above20 ? 90_00 : 110_00;
    const sma50 = i < opts.above50 ? 90_00 : 110_00;
    current.set(i, mkFacts(i, { changePercent, sma20, sma50, close: 100_00 }));
  }

  return {
    sessionDate: '2026-09-11',
    previousSessionDate: '2026-09-10',
    completedAt: '2026-09-11T11:00:00Z',
    now: FRIDAY_EVENING,
    expectedInstruments: opts.expected,
    current,
    previous: new Map(),
    watchlistMembership: new Map(),
    hasWatchlists: false,
    indexReturnPercent: null,
    indexName: 'NIFTY 50',
  };
}

describe('buildMarketBrief — market condition', () => {
  it('classifies a broadly strong session as bullish', () => {
    const brief = buildMarketBrief(
      scenario({
        advancing: 45,
        declining: 5,
        unchanged: 0,
        above20: 45,
        above50: 42,
        total: 50,
        expected: 50,
      }),
    );
    expect(brief.marketCondition.label).toBe('bullish');
    expect(brief.session.status).toBe('complete');
  });

  it('classifies a broadly weak session as bearish', () => {
    const brief = buildMarketBrief(
      scenario({
        advancing: 5,
        declining: 45,
        unchanged: 0,
        above20: 6,
        above50: 8,
        total: 50,
        expected: 50,
      }),
    );
    expect(brief.marketCondition.label).toBe('bearish');
  });

  it('classifies a balanced session as mixed', () => {
    const brief = buildMarketBrief(
      scenario({
        advancing: 25,
        declining: 25,
        unchanged: 0,
        above20: 26,
        above50: 24,
        total: 50,
        expected: 50,
      }),
    );
    expect(brief.marketCondition.label).toBe('mixed');
  });

  it('classifies a strong-short / weak-long session as transitional', () => {
    const brief = buildMarketBrief(
      scenario({
        advancing: 40,
        declining: 10,
        unchanged: 0,
        above20: 40,
        above50: 15,
        total: 50,
        expected: 50,
      }),
    );
    expect(brief.marketCondition.label).toBe('transitional');
  });

  it('refuses to classify below the coverage floor', () => {
    const brief = buildMarketBrief(
      scenario({
        advancing: 12,
        declining: 6,
        unchanged: 2,
        above20: 12,
        above50: 10,
        total: 20,
        expected: 50,
      }),
    );
    expect(brief.marketCondition.label).toBe('insufficient_data');
    // Coverage is real but incomplete, so the session itself is partial.
    expect(brief.session.status).toBe('partial');
  });
});

describe('buildMarketBrief — overview & denominators', () => {
  it('counts advances/declines/unchanged with the unchanged band', () => {
    const brief = buildMarketBrief(
      scenario({
        advancing: 30,
        declining: 15,
        unchanged: 5,
        above20: 30,
        above50: 25,
        total: 50,
        expected: 50,
      }),
    );
    expect(brief.overview.advances).toBe(30);
    expect(brief.overview.declines).toBe(15);
    expect(brief.overview.unchanged).toBe(5);
    expect(brief.overview.directionCovered).toBe(50);
    expect(brief.overview.above20DayAverage).toBe(30);
    expect(brief.overview.above20DayTotal).toBe(50);
  });

  it('never counts missing change data toward a direction', () => {
    const current = new Map<number, SessionInstrumentFacts>();
    current.set(1, mkFacts(1, { changePercent: 2 }));
    current.set(2, mkFacts(2, { changePercent: null })); // no previous close
    const input: MarketBriefInput = {
      ...scenario({
        advancing: 0,
        declining: 0,
        unchanged: 0,
        above20: 0,
        above50: 0,
        total: 0,
        expected: 2,
      }),
      current,
    };
    const brief = buildMarketBrief(input);
    expect(brief.overview.directionCovered).toBe(1);
    expect(brief.overview.advances).toBe(1);
    expect(brief.overview.declines).toBe(0);
  });

  it('reports null (not zero) when no moving-average data exists', () => {
    const current = new Map<number, SessionInstrumentFacts>();
    for (let i = 0; i < 40; i += 1) {
      current.set(i, mkFacts(i, { sma20: null, sma50: null, changePercent: 1 }));
    }
    const input: MarketBriefInput = {
      ...scenario({
        advancing: 0,
        declining: 0,
        unchanged: 0,
        above20: 0,
        above50: 0,
        total: 0,
        expected: 50,
      }),
      current,
    };
    const brief = buildMarketBrief(input);
    expect(brief.overview.above20DayAverage).toBeNull();
    expect(brief.overview.above20DayTotal).toBeNull();
    expect(brief.headline).not.toContain('20-day');
  });
});

describe('buildMarketBrief — what changed', () => {
  function twoSession(): MarketBriefInput {
    const base = scenario({
      advancing: 0,
      declining: 0,
      unchanged: 0,
      above20: 0,
      above50: 0,
      total: 0,
      expected: 3,
    });

    const current = new Map<number, SessionInstrumentFacts>();
    const previous = new Map<number, SessionInstrumentFacts>();

    // 1: crossed above its 20-day MA and its MACD histogram turned positive.
    previous.set(1, mkFacts(1, { close: 89_00, sma20: 90_00, macdHistogram: -5 }));
    current.set(1, mkFacts(1, { close: 95_00, sma20: 90_00, macdHistogram: 5, changePercent: 3 }));

    // 2: unusual volume, nothing else.
    previous.set(2, mkFacts(2, { close: 100_00, sma20: 95_00, macdHistogram: 3 }));
    current.set(
      2,
      mkFacts(2, {
        close: 108_00,
        sma20: 96_00,
        macdHistogram: 4,
        relativeVolume: 2.6,
        changePercent: 4,
      }),
    );

    // 3: MACD histogram turned negative.
    previous.set(3, mkFacts(3, { close: 100_00, macdHistogram: 2 }));
    current.set(3, mkFacts(3, { close: 98_00, macdHistogram: -1, changePercent: -1 }));

    return { ...base, current, previous };
  }

  it('detects MA crosses, momentum flips and unusual volume', () => {
    const brief = buildMarketBrief(twoSession());
    const types = new Set(brief.changes.map((c) => c.eventType));
    expect(types).toContain('crossed_above_ma20');
    expect(types).toContain('momentum_strengthened');
    expect(types).toContain('momentum_weakened');
    expect(types).toContain('unusual_volume');
  });

  it('orders changes by salience then move size then symbol', () => {
    const brief = buildMarketBrief(twoSession());
    // crossed_above_ma20 (priority 4) must precede unusual_volume (priority 7).
    const firstCross = brief.changes.findIndex((c) => c.eventType === 'crossed_above_ma20');
    const firstVol = brief.changes.findIndex((c) => c.eventType === 'unusual_volume');
    expect(firstCross).toBeLessThan(firstVol);
  });
});

describe('buildMarketBrief — watchlist brief', () => {
  it('shows an empty state when the user has no watchlists', () => {
    const brief = buildMarketBrief(
      scenario({
        advancing: 30,
        declining: 15,
        unchanged: 5,
        above20: 30,
        above50: 25,
        total: 50,
        expected: 50,
      }),
    );
    expect(brief.watchlists.hasWatchlists).toBe(false);
    expect(brief.watchlists.affectedCount).toBe(0);
    expect(brief.watchlists.items).toHaveLength(0);
  });

  it('reports only the owner-scoped watched names that changed', () => {
    const base = scenario({
      advancing: 0,
      declining: 0,
      unchanged: 0,
      above20: 0,
      above50: 0,
      total: 0,
      expected: 3,
    });
    const current = new Map<number, SessionInstrumentFacts>();
    const previous = new Map<number, SessionInstrumentFacts>();

    // 1 (watched): crossed above its 20-day MA (the 50-day stays below both closes).
    previous.set(1, mkFacts(1, { close: 89_00, sma20: 90_00, sma50: 80_00 }));
    current.set(1, mkFacts(1, { close: 95_00, sma20: 90_00, sma50: 80_00, changePercent: 3 }));
    // 2 (watched): no change.
    previous.set(2, mkFacts(2));
    current.set(2, mkFacts(2, { changePercent: 1 }));
    // 3 (not watched): crossed too, but is not the user's.
    previous.set(3, mkFacts(3, { close: 89_00, sma20: 90_00 }));
    current.set(3, mkFacts(3, { close: 95_00, sma20: 90_00, changePercent: 3 }));

    const brief = buildMarketBrief({
      ...base,
      current,
      previous,
      hasWatchlists: true,
      watchlistMembership: new Map([
        [1, [{ watchlistId: 7, name: 'Core' }]],
        [2, [{ watchlistId: 7, name: 'Core' }]],
      ]),
    });

    expect(brief.watchlists.hasWatchlists).toBe(true);
    expect(brief.watchlists.affectedCount).toBe(1);
    expect(brief.watchlists.transitionCount).toBe(1);
    expect(brief.watchlists.items[0]?.symbol).toBe('SYM001');
    expect(brief.watchlists.items[0]?.watchlists[0]?.name).toBe('Core');
  });
});

describe('freshness helpers', () => {
  it('resolves the latest expected session across a weekend', () => {
    // Friday after the pass → Friday itself.
    expect(expectedLatestSession(new Date('2026-09-11T13:00:00Z'))).toBe('2026-09-11');
    // Saturday → back to Friday.
    expect(expectedLatestSession(new Date('2026-09-12T13:00:00Z'))).toBe('2026-09-11');
    // Sunday → back to Friday.
    expect(expectedLatestSession(new Date('2026-09-13T13:00:00Z'))).toBe('2026-09-11');
    // Monday morning, before the pass → still Friday.
    expect(expectedLatestSession(new Date('2026-09-14T05:00:00Z'))).toBe('2026-09-11');
    // Monday evening → Monday.
    expect(expectedLatestSession(new Date('2026-09-14T13:00:00Z'))).toBe('2026-09-14');
  });

  it('counts expected sessions behind, tolerating a single holiday', () => {
    // Friday's data seen Monday evening → 1 behind (absorbed by tolerance).
    expect(countSessionsBehind('2026-09-11', new Date('2026-09-14T13:00:00Z'))).toBe(1);
    // Thursday's data seen Monday evening → 2 behind → stale.
    expect(countSessionsBehind('2026-09-10', new Date('2026-09-14T13:00:00Z'))).toBe(2);
    // Same-day → 0.
    expect(countSessionsBehind('2026-09-11', new Date('2026-09-11T13:00:00Z'))).toBe(0);
  });

  it('flags a stale session and an unavailable one', () => {
    // Latest completed session is old relative to "now".
    const staleBrief = buildMarketBrief(scenarioForStale());
    expect(staleBrief.session.status).toBe('stale');

    const unavailable = buildMarketBrief({
      sessionDate: '2026-09-11',
      previousSessionDate: null,
      completedAt: null,
      now: FRIDAY_EVENING,
      expectedInstruments: 50,
      current: new Map(),
      previous: new Map(),
      watchlistMembership: new Map(),
      hasWatchlists: false,
      indexReturnPercent: null,
      indexName: null,
    });
    expect(unavailable.session.status).toBe('unavailable');
    expect(unavailable.marketCondition.label).toBe('insufficient_data');
  });
});

function scenarioForStale(): MarketBriefInput {
  const base = scenario({
    advancing: 30,
    declining: 15,
    unchanged: 5,
    above20: 30,
    above50: 25,
    total: 50,
    expected: 50,
  });
  // Latest completed session is old relative to "now".
  return { ...base, sessionDate: '2026-08-28', now: new Date('2026-09-14T13:00:00Z') };
}

describe('buildMarketBrief — no signals', () => {
  it('never speaks of setups or signals', () => {
    const brief = buildMarketBrief(
      scenario({
        advancing: 30,
        declining: 15,
        unchanged: 5,
        above20: 30,
        above50: 25,
        total: 50,
        expected: 50,
      }),
    );
    expect(brief.headline).not.toMatch(/setup|signal/i);
    expect(brief.disclaimer).not.toMatch(/setup strength/i);
    expect(brief.marketCondition.factors.some((f) => f.id === 'setups')).toBe(false);
  });
});
