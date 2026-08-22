import { fromIstParts } from '@signal/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INTRADAY_CONFIG } from './config.js';
import { type LiveSignal, transition } from './lifecycle.js';
import type {
  IntradayEvaluation,
  IntradaySnapshot,
  SignalCandidate,
  TechnicalLevels,
} from './types.js';

/**
 * Lifecycle is where a technically correct engine becomes a usable one. These
 * tests cover the four failures that make an intraday feed unreadable:
 * duplicate spam, zombie signals, instant re-firing, and a signal that quietly
 * outlives its own data.
 */

const config = DEFAULT_INTRADAY_CONFIG;

function at(minute: number): Date {
  return fromIstParts({ year: 2026, month: 8, day: 20, hour: 9, minute: 15 + minute });
}

const levels: TechnicalLevels = {
  entryLow: 99_900,
  entryHigh: 100_100,
  invalidation: 99_000,
  target1: 101_600,
  target2: 102_800,
  risk: 1_000,
  reward: 1_600,
  riskReward: 1.6,
};

function snapshot(overrides: Partial<IntradaySnapshot> = {}): IntradaySnapshot {
  return {
    price: 100_000,
    lastBarAt: at(60).getTime(),
    lastBarHigh: 100_200,
    lastBarLow: 99_800,
    dayOpen: 99_500,
    dayHigh: 100_400,
    dayLow: 99_200,
    previousClose: 99_400,
    previousHigh: 100_000,
    previousLow: 98_800,
    openingRangeHigh: 99_900,
    openingRangeLow: 99_300,
    vwap: 99_700,
    vwapSlopePercent: 0.05,
    vwapDistancePercent: 0.3,
    ema9: 99_900,
    ema20: 99_800,
    ema50: 99_600,
    rsi: 61,
    macdHistogram: 40,
    adx: 27,
    plusDi: 30,
    minusDi: 14,
    atr: 800,
    atrPercent: 0.8,
    rocFast: 0.4,
    rocSlow: 0.2,
    relativeVolume: 1.6,
    barRelativeVolume: 2.1,
    sessionVolume: 1_200_000,
    gapPercent: 0.1,
    changePercent: 0.6,
    trends: [],
    levels: [],
    ...overrides,
  };
}

function candidate(overrides: Partial<SignalCandidate> = {}): SignalCandidate {
  return {
    kind: 'breakout',
    direction: 'long',
    strategy: 'breakout',
    score: 82,
    quality: 'strong',
    triggered: true,
    components: [],
    reasons: [
      {
        key: 'levelBroken',
        label: 'Broke above previous day high',
        detail: 'Closed above ₹1,000.00',
        category: 'priceAction',
        polarity: 'supporting',
      },
    ],
    invalidations: [
      { kind: 'price_below', level: 99_000, label: 'Closes through the invalidation level' },
      { kind: 'session_end', label: 'Intraday only' },
    ],
    levels,
    triggerMinutes: 3,
    setupMinutes: 5,
    trendMinutes: 15,
    setupKey: 'breakout|level:previousHigh',
    ...overrides,
  };
}

function evaluation(
  candidates: readonly SignalCandidate[],
  snap: IntradaySnapshot = snapshot(),
): IntradayEvaluation {
  return {
    symbol: 'TEST',
    evaluatedAt: snap.lastBarAt,
    regime: 'early',
    snapshot: snap,
    dataQuality: {
      usable: true,
      barsAvailable: 60,
      barsRequired: 25,
      stalenessMinutes: 1,
      missingBars: 0,
      invalidBars: 0,
      issues: [],
    },
    candidates,
    rejections: [],
  };
}

function live(overrides: Partial<LiveSignal> = {}): LiveSignal {
  return {
    id: 'sig-1',
    symbol: 'TEST',
    setupKey: 'breakout|level:previousHigh',
    kind: 'breakout',
    direction: 'long',
    state: 'triggered',
    score: 82,
    quality: 'strong',
    levels,
    invalidations: candidate().invalidations,
    createdAt: at(50).getTime(),
    updatedAt: at(57).getTime(),
    triggeredAt: at(50).getTime(),
    referencePrice: 100_000,
    holds: 0,
    maxFavourable: 0,
    maxAdverse: 0,
    endedAt: null,
    endReason: null,
    ...overrides,
  };
}

describe('transition — creation and deduplication', () => {
  it('creates one signal for a fresh triggered candidate', () => {
    const result = transition(
      { existing: [], evaluation: evaluation([candidate()]), recentlyEnded: [], at: at(60) },
      config,
    );
    expect(result.created).toHaveLength(1);
    expect(result.created[0]?.state).toBe('triggered');
    expect(result.events[0]?.kind).toBe('detected');
  });

  it('does not create a second signal for a setup already live', () => {
    // The same breakout, still valid twenty minutes later, is ONE signal.
    // Without this the feed shows the same card once per evaluation cycle.
    const result = transition(
      { existing: [live()], evaluation: evaluation([candidate()]), recentlyEnded: [], at: at(60) },
      config,
    );
    expect(result.created).toEqual([]);
    expect(result.updated).toHaveLength(1);
  });

  it('starts an untriggered candidate as forming, not triggered', () => {
    const result = transition(
      {
        existing: [],
        evaluation: evaluation([candidate({ triggered: false })]),
        recentlyEnded: [],
        at: at(60),
      },
      config,
    );
    expect(result.created[0]?.state).toBe('forming');
    expect(result.created[0]?.triggeredAt).toBeNull();
  });

  it('honours the cool-down after the same setup ended', () => {
    const endedAt = at(50).getTime();
    const suppressed = transition(
      {
        existing: [],
        evaluation: evaluation([candidate()]),
        recentlyEnded: [{ setupKey: 'breakout|level:previousHigh', endedAt }],
        at: at(60),
      },
      config,
    );
    expect(suppressed.created).toEqual([]);

    // Past the 30-minute cool-down, the same setup may form again.
    const allowed = transition(
      {
        existing: [],
        evaluation: evaluation([candidate()]),
        recentlyEnded: [{ setupKey: 'breakout|level:previousHigh', endedAt }],
        at: at(85),
      },
      config,
    );
    expect(allowed.created).toHaveLength(1);
  });
});

describe('transition — promotion', () => {
  it('confirms a trigger only on a later evaluation', () => {
    const result = transition(
      { existing: [live()], evaluation: evaluation([candidate()]), recentlyEnded: [], at: at(63) },
      config,
    );
    expect(result.updated[0]?.state).toBe('confirmed');
    expect(result.events.some((event) => event.kind === 'state_change')).toBe(true);
  });

  it('moves a confirmed signal to active', () => {
    const result = transition(
      {
        existing: [live({ state: 'confirmed', holds: 1 })],
        evaluation: evaluation([candidate()]),
        recentlyEnded: [],
        at: at(66),
      },
      config,
    );
    expect(result.updated[0]?.state).toBe('active');
  });

  it('records a score change only once it is material', () => {
    const small = transition(
      {
        existing: [live({ state: 'active', holds: 3, updatedAt: at(68).getTime() })],
        evaluation: evaluation([candidate({ score: 84 })]),
        recentlyEnded: [],
        at: at(70),
      },
      config,
    );
    // 82 -> 84 is inside the 4-point band: no timeline noise.
    expect(small.events).toEqual([]);

    const large = transition(
      {
        existing: [live({ state: 'active', holds: 3, updatedAt: at(68).getTime() })],
        evaluation: evaluation([candidate({ score: 91, quality: 'exceptional' })]),
        recentlyEnded: [],
        at: at(70),
      },
      config,
    );
    expect(large.events[0]?.kind).toBe('score_change');
  });
});

describe('transition — invalidation', () => {
  it('invalidates when price closes through the invalidation level', () => {
    const result = transition(
      {
        existing: [live({ state: 'active', holds: 3, updatedAt: at(68).getTime() })],
        evaluation: evaluation([candidate()], snapshot({ price: 98_500 })),
        recentlyEnded: [],
        at: at(70),
      },
      config,
    );
    expect(result.updated[0]?.state).toBe('invalidated');
    expect(result.updated[0]?.endedAt).not.toBeNull();
    expect(result.events[0]?.kind).toBe('invalidated');
  });

  it('invalidates a VWAP setup when price loses VWAP', () => {
    const vwapSignal = live({
      kind: 'vwap_reclaim',
      setupKey: 'vwap_reclaim|vwap',
      state: 'active',
      updatedAt: at(68).getTime(),
      invalidations: [{ kind: 'vwap_lost', label: 'Closes back below VWAP' }],
    });
    const result = transition(
      {
        existing: [vwapSignal],
        evaluation: evaluation([], snapshot({ price: 99_500, vwap: 99_700 })),
        recentlyEnded: [],
        at: at(70),
      },
      config,
    );
    expect(result.updated[0]?.state).toBe('invalidated');
  });

  it('does NOT invalidate on unusable data', () => {
    // A missing candle must not be allowed to kill a live setup — that would
    // turn a feed problem into a fabricated technical event.
    const stale = evaluation([candidate()], snapshot({ price: 98_500 }));
    const result = transition(
      {
        existing: [live({ state: 'active', holds: 3, updatedAt: at(68).getTime() })],
        evaluation: { ...stale, dataQuality: { ...stale.dataQuality, usable: false } },
        recentlyEnded: [],
        at: at(70),
      },
      config,
    );
    expect(result.updated[0]?.state).not.toBe('invalidated');
  });

  it('marks the second target as reached', () => {
    const result = transition(
      {
        existing: [live({ state: 'active', holds: 3, updatedAt: at(68).getTime() })],
        evaluation: evaluation([candidate()], snapshot({ price: 103_000 })),
        recentlyEnded: [],
        at: at(70),
      },
      config,
    );
    expect(result.updated[0]?.state).toBe('target_met');
  });
});

describe('transition — expiry and excursions', () => {
  it('expires live signals as the session ends', () => {
    // 15:25 IST is inside the 10-minute force-exit window.
    const result = transition(
      {
        existing: [live({ state: 'active', holds: 5, updatedAt: at(368).getTime() })],
        evaluation: evaluation([candidate()]),
        recentlyEnded: [],
        at: at(370),
      },
      config,
    );
    expect(result.updated[0]?.state).toBe('expired');
    expect(result.updated[0]?.endReason).toMatch(/Session is ending/);
  });

  it('expires an untriggered setup that never fires', () => {
    const result = transition(
      {
        existing: [
          live({
            state: 'forming',
            triggeredAt: null,
            referencePrice: null,
            createdAt: at(0).getTime(),
          }),
        ],
        evaluation: evaluation([candidate({ triggered: false })]),
        recentlyEnded: [],
        at: at(60),
      },
      config,
    );
    expect(result.updated[0]?.state).toBe('expired');
  });

  it('expires a live signal whose data has gone quiet', () => {
    const result = transition(
      {
        existing: [live({ state: 'active', holds: 4, updatedAt: at(30).getTime() })],
        evaluation: evaluation([candidate()]),
        recentlyEnded: [],
        at: at(60),
      },
      config,
    );
    expect(result.updated[0]?.state).toBe('expired');
    expect(result.updated[0]?.endReason).toMatch(/no longer be validated/i);
  });

  it('tracks maximum favourable and adverse excursion from the trigger price', () => {
    const result = transition(
      {
        existing: [
          live({
            state: 'active',
            holds: 2,
            maxFavourable: 300,
            maxAdverse: 150,
            updatedAt: at(68).getTime(),
          }),
        ],
        evaluation: evaluation(
          [candidate()],
          snapshot({ lastBarHigh: 100_900, lastBarLow: 99_500 }),
        ),
        recentlyEnded: [],
        at: at(70),
      },
      config,
    );
    // Reference 100_000: high 100_900 is +900 (beats the stored 300);
    // low 99_500 is −500 against (beats the stored 150).
    expect(result.updated[0]?.maxFavourable).toBe(900);
    expect(result.updated[0]?.maxAdverse).toBe(500);
  });

  it('keeps a live signal alive when the strategy stops detecting it', () => {
    // A setup ceasing to be re-detectable is not the same as it failing. Only
    // its own invalidation conditions may end it.
    const result = transition(
      {
        existing: [live({ state: 'active', holds: 3, updatedAt: at(68).getTime() })],
        evaluation: evaluation([]),
        recentlyEnded: [],
        at: at(70),
      },
      config,
    );
    expect(result.updated[0]?.state).toBe('active');
    expect(result.updated[0]?.endedAt).toBeNull();
  });
});
