import { intradayEvidenceSchema } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import type { Bar } from '../types.js';
import { evaluateOrb, type OrbInput } from './evaluate.js';
import {
  BUY_EXPECTED,
  BUY_SIGNAL_AT,
  BUY_SIGNAL_BAR,
  buySession,
  ist,
  priorSessionBars,
  SELL_EXPECTED,
  SELL_SIGNAL_BAR,
  SESSION,
  SESSION_INPUT,
  SESSION_OPEN,
  sellSession,
  TICK,
  todayPreamble,
} from './fixture.js';

const input = (bars: readonly Bar[], overrides: Partial<OrbInput> = {}): OrbInput => ({
  bars,
  asOf: BUY_SIGNAL_AT + 2_000,
  tickSize: TICK,
  alreadySignalled: false,
  session: SESSION_INPUT,
  ...overrides,
});
const withSignal = (candle: Partial<Bar>): Bar[] => [
  ...priorSessionBars(),
  ...todayPreamble(),
  { ...BUY_SIGNAL_BAR, ...candle },
];

describe('evaluateOrb — BUY fixture', () => {
  const decision = evaluateOrb(input(buySession()));
  it('publishes with the hand-computed evidence', () => {
    expect(decision.kind).toBe('SIGNAL');
    if (decision.kind !== 'SIGNAL') return;
    const e = decision.evidence;
    expect(e.direction).toBe('BUY');
    expect(e.sessionDate).toBe('2026-09-17');
    expect(e.signalAt).toBe(BUY_SIGNAL_AT);
    expect(e.candle).toEqual(BUY_SIGNAL_BAR);
    expect(e.openingRange).toEqual(BUY_EXPECTED.openingRange);
    expect(e.vwap).toBe(BUY_EXPECTED.vwap);
    expect(e.relativeVolume).toBeCloseTo(BUY_EXPECTED.relativeVolume, 10);
    expect(e.bodyRatio).toBeCloseTo(BUY_EXPECTED.bodyRatio, 10);
    expect(e.extensionBps).toBeCloseTo(BUY_EXPECTED.extensionBps, 10);
    expect(e.levels).toEqual(BUY_EXPECTED.levels);
    expect(e.checks.map((c) => c.id)).toEqual([
      'or_range',
      'volume',
      'body',
      'breakout',
      'extension',
      'risk',
    ]);
    expect(e.checks.every((c) => c.passed)).toBe(true);
    expect(intradayEvidenceSchema.safeParse(e).success).toBe(true);
  });
  it('is deterministic', () => {
    expect(evaluateOrb(input(buySession()))).toEqual(decision);
  });
});

describe('evaluateOrb — SELL mirror', () => {
  it('publishes the mirrored levels', () => {
    const decision = evaluateOrb(input(sellSession()));
    expect(decision.kind).toBe('SIGNAL');
    if (decision.kind !== 'SIGNAL') return;
    expect(decision.evidence.direction).toBe('SELL');
    expect(decision.evidence.candle).toEqual(SELL_SIGNAL_BAR);
    expect(decision.evidence.vwap).toBe(SELL_EXPECTED.vwap);
    expect(decision.evidence.bodyRatio).toBeCloseTo(SELL_EXPECTED.bodyRatio, 10);
    expect(decision.evidence.extensionBps).toBeCloseTo(SELL_EXPECTED.extensionBps, 10);
    expect(decision.evidence.levels).toEqual(SELL_EXPECTED.levels);
    expect(intradayEvidenceSchema.safeParse(decision.evidence).success).toBe(true);
  });
});

describe('evaluateOrb — no lookahead', () => {
  it('a later candle cannot change an earlier decision', () => {
    const future: Bar[] = [
      {
        timestamp: BUY_SIGNAL_AT,
        open: 295_640,
        high: 320_000,
        low: 250_000,
        close: 300_000,
        volume: 900_000,
      },
      {
        timestamp: BUY_SIGNAL_AT + 300_000,
        open: 300_000,
        high: 300_000,
        low: 100_000,
        close: 100_000,
        volume: 900_000,
      },
    ];
    const truncated = evaluateOrb(input(buySession()));
    const extended = evaluateOrb(input([...buySession(), ...future]));
    expect(extended).toEqual(truncated);
    // And the flat candle before the signal stays a non-signal when the signal candle exists.
    const earlier = { asOf: SESSION_OPEN + 6 * 300_000 + 2_000 };
    expect(evaluateOrb(input(buySession(), earlier))).toEqual(
      evaluateOrb(input([...priorSessionBars(), ...todayPreamble()], earlier)),
    );
    expect(evaluateOrb(input(buySession(), earlier)).kind).toBe('REJECT');
  });
  it('never reads the forming candle', () => {
    // asOf one second before the signal candle closes: the breakout candle does not exist yet.
    // The decision bar is the flat 09:40 candle, by now too old to publish — never a signal.
    const d = evaluateOrb(input(buySession(), { asOf: BUY_SIGNAL_AT - 1_000 }));
    expect(d).toMatchObject({ kind: 'REJECT', reason: 'LATE' });
    const atFlatClose = evaluateOrb(input(buySession(), { asOf: BUY_SIGNAL_AT - 300_000 + 2_000 }));
    expect(atFlatClose).toMatchObject({ kind: 'REJECT', reason: 'VOLUME' }); // 40,000 vs 41,500 baseline
  });
});

describe('evaluateOrb — rejections', () => {
  const reason = (bars: Bar[], overrides: Partial<OrbInput> = {}) => {
    const d = evaluateOrb(input(bars, overrides));
    return d.kind === 'REJECT' ? d.reason : 'SIGNAL';
  };
  it('WARMUP with fewer than 250 prior candles', () => {
    expect(reason([...priorSessionBars().slice(-100), ...todayPreamble(), BUY_SIGNAL_BAR])).toBe(
      'WARMUP',
    );
  });
  it('INCOHERENT_BARS on a gap in today’s candles', () => {
    const bars = buySession();
    bars.splice(bars.length - 3, 1);
    expect(reason(bars)).toBe('INCOHERENT_BARS');
  });
  it('OUTSIDE_WINDOW after 14:30 and for a stale session date', () => {
    const late = withSignal({ timestamp: ist(SESSION, 14, 30) });
    const flat = todayPreamble();
    const filler: Bar[] = [];
    for (let t = SESSION_OPEN + 6 * 300_000; t < ist(SESSION, 14, 30); t += 300_000)
      filler.push({ ...flat[3]!, timestamp: t });
    const bars = [...priorSessionBars(), ...flat, ...filler, ...late.slice(-1)];
    expect(reason(bars, { asOf: ist(SESSION, 14, 35, 2) })).toBe('OUTSIDE_WINDOW');
    expect(reason(buySession(), { asOf: ist({ year: 2026, month: 9, day: 18 }, 9, 50, 2) })).toBe(
      'OUTSIDE_WINDOW',
    );
  });
  it('LATE when evaluated more than 30 s after the close', () => {
    expect(reason(buySession(), { asOf: BUY_SIGNAL_AT + 30_001 })).toBe('LATE');
    expect(reason(buySession(), { asOf: BUY_SIGNAL_AT + 30_000 })).toBe('SIGNAL');
  });
  it('ALREADY_SIGNALLED once per stock per day', () => {
    expect(reason(buySession(), { alreadySignalled: true })).toBe('ALREADY_SIGNALLED');
  });
  it('session filters block the day', () => {
    expect(reason(buySession(), { session: { ...SESSION_INPUT, indexMoveBps: 201 } })).toBe(
      'INDEX_SHOCK',
    );
    expect(reason(buySession(), { session: { ...SESSION_INPUT, indexMoveBps: null } })).toBe(
      'INDEX_UNAVAILABLE',
    );
    expect(
      reason(buySession(), {
        session: { ...SESSION_INPUT, daily: SESSION_INPUT.daily.slice(-19) },
      }),
    ).toBe('HISTORY_INCOMPLETE');
  });
  it('OR_RANGE when the range is too narrow', () => {
    // Opening candles o 2942.00 h 2946.00 l 2941.00 c 2944.00: width 500 / mid 294350 = 16.99 bps < 25
    const bars = buySession();
    for (let i = 300; i < 303; i += 1)
      bars[i] = { ...bars[i]!, open: 294_200, high: 294_600, low: 294_100, close: 294_400 };
    expect(reason(bars)).toBe('OR_RANGE');
  });
  it('VOLUME when the candle is thin', () => {
    // 1.5 × 41,500 = 62,250: 62,249 fails, 62,250 passes
    expect(reason(withSignal({ volume: 62_249 }))).toBe('VOLUME');
    expect(reason(withSignal({ volume: 62_250 }))).toBe('SIGNAL');
  });
  it('BODY when the candle is mostly wick', () => {
    // body 495 / range 1000 → 0.495
    expect(reason(withSignal({ open: 295_145, close: 295_640 }))).toBe('BODY');
  });
  it('NO_BREAKOUT when the close is inside the range or on the wrong side of VWAP', () => {
    expect(reason(withSignal({ open: 294_000, close: 294_900, high: 295_000, low: 293_900 }))).toBe(
      'NO_BREAKOUT',
    );
  });
  it('EXTENDED when the close is more than 50 bps past the range edge', () => {
    // 2966.00: (296600 − 295000) / 295000 = 54.2 bps
    expect(reason(withSignal({ open: 295_100, close: 296_600, high: 296_700, low: 295_000 }))).toBe(
      'EXTENDED',
    );
  });
  it('STOP_TOO_WIDE when the range plus extension exceeds 1.20 %', () => {
    // Opening range h 2950.00 l 2921.00 → width 2900 / 293550 = 98.8 bps (allowed);
    // stop 292100 − 146 = 291954 → 291950; ref 295640 → risk 3690 = 1.25 % > 1.20 %
    const bars = buySession();
    for (let i = 300; i < 303; i += 1) bars[i] = { ...bars[i]!, low: 292_100 };
    expect(reason(bars)).toBe('STOP_TOO_WIDE');
  });
});
