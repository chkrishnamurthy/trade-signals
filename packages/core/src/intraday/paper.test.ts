import { describe, expect, it } from 'vitest';
import type { Bar } from '../types.js';
import { DEFAULT_COST_MODEL } from './costs.js';
import { type PaperTrade, resolvePaperTrade, summarisePaperTrades } from './paper.js';
import type { TechnicalLevels } from './types.js';

const MINUTE = 60_000;
const T0 = Date.UTC(2026, 7, 21, 4, 0); // 09:30 IST

const bar = (index: number, open: number, high: number, low: number, close: number): Bar => ({
  timestamp: T0 + index * 3 * MINUTE,
  open,
  high,
  low,
  close,
  volume: 1_000,
});

/** ₹500 entry, stop ₹497, target 1 ₹506, target 2 ₹512. Risk 300, reward 600. */
const levels: TechnicalLevels = {
  entryLow: 49_950,
  entryHigh: 50_050,
  invalidation: 49_700,
  target1: 50_600,
  target2: 51_200,
  risk: 300,
  reward: 600,
  riskReward: 2,
  costPaise: 146,
  netReward: 454,
  netRisk: 446,
  netRiskReward: 454 / 446,
};

const resolve = (bars: readonly Bar[], forceExitIndex = 50): PaperTrade | null =>
  resolvePaperTrade({
    direction: 'long',
    levels,
    triggeredAt: bars[0]?.timestamp ?? T0,
    bars,
    forceExitAt: T0 + forceExitIndex * 3 * MINUTE,
    costs: DEFAULT_COST_MODEL,
  });

describe('resolvePaperTrade', () => {
  it('fills at the next bar open, never the trigger bar close', () => {
    const trade = resolve([
      bar(0, 50_000, 50_100, 49_950, 50_080), // trigger bar — close 50,080
      bar(1, 50_200, 50_650, 50_150, 50_600), // gapped open — this is the fill
    ]);
    expect(trade?.entryPrice).toBe(50_200);
    expect(trade?.entryAt).toBe(T0 + 3 * MINUTE);
  });

  it('assumes the stop hit first when one bar spans both levels', () => {
    const trade = resolve([
      bar(0, 50_000, 50_100, 49_950, 50_080),
      bar(1, 50_000, 50_050, 49_990, 50_020),
      // This bar's range covers the stop (49,700) AND target 1 (50,600).
      bar(2, 50_020, 50_700, 49_650, 50_400),
    ]);
    expect(trade?.exitReason).toBe('stop');
    expect(trade?.exitPrice).toBe(49_700);
    expect(trade?.netPaise).toBeLessThan(0);
    expect(trade?.rMultiple).toBeLessThan(-1); // costs push a stop past −1R
  });

  it('resolves a clean target hit to a positive R below the gross ratio', () => {
    const trade = resolve([
      bar(0, 50_000, 50_100, 49_950, 50_080),
      bar(1, 50_000, 50_200, 49_980, 50_150),
      bar(2, 50_150, 50_650, 50_100, 50_600),
    ]);
    expect(trade?.exitReason).toBe('target1');
    expect(trade?.exitPrice).toBe(50_600);
    // Fill 50,000 → exit 50,600 is 600 gross; risk at fill is 300.
    expect(trade?.grossPaise).toBe(600);
    expect(trade?.netPaise).toBeLessThan(600);
    expect(trade?.rMultiple).toBeGreaterThan(0);
    expect(trade?.rMultiple).toBeLessThan(2); // gross R:R was 2.0
  });

  it('closes the position at the last bar before force exit', () => {
    const trade = resolve(
      [
        bar(0, 50_000, 50_100, 49_950, 50_080),
        bar(1, 50_000, 50_120, 49_980, 50_100),
        bar(2, 50_100, 50_180, 50_050, 50_150), // last bar before force exit
        bar(3, 50_150, 50_200, 50_100, 50_180), // at/after force exit
      ],
      3,
    );
    expect(trade?.exitReason).toBe('session_close');
    expect(trade?.exitPrice).toBe(50_150);
  });

  it('records excursions from the fill, not from the planned entry', () => {
    const trade = resolve([
      bar(0, 50_000, 50_100, 49_950, 50_080),
      bar(1, 50_000, 50_300, 49_800, 50_100), // +300 favourable, −200 adverse
      bar(2, 50_100, 50_650, 50_050, 50_600),
    ]);
    expect(trade?.maxFavourable).toBe(650); // the target bar's high, not the target
    expect(trade?.maxAdverse).toBe(200);
  });

  it('returns null when nothing trades after the trigger', () => {
    expect(resolve([bar(0, 50_000, 50_100, 49_950, 50_080)])).toBeNull();
  });

  it('marks the trade unresolved when the data ends mid-position', () => {
    const trade = resolve([
      bar(0, 50_000, 50_100, 49_950, 50_080),
      bar(1, 50_000, 50_120, 49_980, 50_100),
    ]);
    expect(trade?.exitReason).toBe('unresolved');
  });
});

describe('summarisePaperTrades', () => {
  const make = (netPaise: number, rMultiple: number, exitReason: PaperTrade['exitReason']) =>
    ({
      direction: 'long',
      entryAt: T0,
      entryPrice: 50_000,
      exitAt: T0 + MINUTE,
      exitPrice: 50_000 + netPaise,
      exitReason,
      grossPaise: netPaise,
      costPaise: 146,
      netPaise,
      rMultiple,
      maxFavourable: 0,
      maxAdverse: 0,
      barsHeld: 4,
      reachedTarget2: false,
    }) satisfies PaperTrade;

  it('excludes unresolved trades from every statistic', () => {
    const stats = summarisePaperTrades([
      make(400, 1.3, 'target1'),
      make(-350, -1.1, 'stop'),
      make(9_999, 30, 'unresolved'),
    ]);
    expect(stats.trades).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
    expect(stats.expectancyR).toBeCloseTo((1.3 - 1.1) / 2, 10);
    expect(stats.profitFactor).toBeCloseTo(1.3 / 1.1, 10);
  });

  it('reports zeroed statistics rather than NaN for an empty set', () => {
    const stats = summarisePaperTrades([]);
    expect(stats.trades).toBe(0);
    expect(stats.expectancyR).toBe(0);
    expect(stats.profitFactor).toBeNull();
  });
});

describe('resolvePaperTrade invalidation before fill', () => {
  it('records no trade when the fill opens beyond the invalidation level', () => {
    // The trigger bar closes fine, then the next bar opens below the stop.
    // The setup died before it could be entered; it is not a −1R loser, it is
    // not a trade at all.
    const trade = resolvePaperTrade({
      direction: 'long',
      levels,
      triggeredAt: T0,
      bars: [bar(0, 50_000, 50_100, 49_950, 50_080), bar(1, 49_650, 49_700, 49_500, 49_600)],
      forceExitAt: T0 + 50 * 3 * MINUTE,
      costs: DEFAULT_COST_MODEL,
    });
    expect(trade).toBeNull();
  });

  it('still trades when the fill gaps toward but not past the invalidation', () => {
    // The slip rule is switched off here so this asserts the invalidation
    // guard alone: 49,800 leaves a third of the risk budget, which the default
    // tolerance would reject for its own separate reason.
    const trade = resolvePaperTrade({
      direction: 'long',
      levels,
      triggeredAt: T0,
      bars: [
        bar(0, 50_000, 50_100, 49_950, 50_080),
        bar(1, 49_800, 50_100, 49_750, 50_050),
        bar(2, 50_050, 50_650, 50_000, 50_600),
      ],
      forceExitAt: T0 + 50 * 3 * MINUTE,
      costs: DEFAULT_COST_MODEL,
      maxEntrySlipFraction: 1,
    });
    expect(trade?.entryPrice).toBe(49_800);
    expect(trade?.exitReason).toBe('target1');
  });
});

describe('resolvePaperTrade entry slippage', () => {
  const resolveWith = (open: number, maxEntrySlipFraction?: number) =>
    resolvePaperTrade({
      direction: 'long',
      levels, // entry ~50,000, invalidation 49,700 — a planned risk of 300
      triggeredAt: T0,
      bars: [
        bar(0, 50_000, 50_100, 49_950, 50_080),
        bar(1, open, open + 700, open - 60, open + 600),
        bar(2, open + 600, 50_700, open + 500, 50_650),
      ],
      forceExitAt: T0 + 50 * 3 * MINUTE,
      costs: DEFAULT_COST_MODEL,
      ...(maxEntrySlipFraction === undefined ? {} : { maxEntrySlipFraction }),
    });

  it('records no trade when the fill has spent most of the risk budget', () => {
    // Opens at 49,850: only 150 of the 300-paise budget is left, which is
    // exactly half — the rule rejects anything below half.
    expect(resolveWith(49_840)).toBeNull();
  });

  it('still trades a fill that leaves most of the budget intact', () => {
    expect(resolveWith(49_960)?.entryPrice).toBe(49_960);
  });

  it('honours a stricter tolerance', () => {
    expect(resolveWith(49_960, 0.05)).toBeNull();
  });
});
