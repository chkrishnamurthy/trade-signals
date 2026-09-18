import type {
  ExchangeSession,
  PaperSettings,
  PaperStrategyAssignment,
  TradeIntent,
} from '@equitywise/shared';
import { evaluateOrb } from '../intraday/evaluate.js';
import {
  BUY_SIGNAL_AT,
  buySession,
  ist,
  SESSION,
  SESSION_INPUT,
  SESSION_OPEN,
} from '../intraday/fixture.js';
import { PAPER_DEFAULT_LIMITS, PAPER_STARTING_CAPITAL_PAISE } from './config.js';
import { intentFromSignal, ORB_STRATEGY_ID } from './intent.js';

/**
 * Paper-engine fixtures built from the ORB-VC worked example. Every expected
 * value in the tests next to this file is computed by hand in a comment.
 */
export const CAPITAL = PAPER_STARTING_CAPITAL_PAISE; // ₹2,00,000
export const ENABLED_AT = SESSION_OPEN + 60_000; // 09:16, before any signal

export function relianceIntent(): TradeIntent {
  const d = evaluateOrb({
    bars: buySession(),
    asOf: BUY_SIGNAL_AT + 2_000,
    tickSize: 5,
    alreadySignalled: false,
    session: SESSION_INPUT,
  });
  if (d.kind !== 'SIGNAL') throw new Error('fixture must signal');
  return intentFromSignal({
    id: 1,
    strategyVersionId: 1,
    instrumentId: 101,
    symbol: 'RELIANCE',
    sector: 'Energy',
    evidence: d.evidence,
  });
}
/** A synthetic intent: `ref` and `stop` in paise, everything else from the worked example. */
export function intent(overrides: Partial<TradeIntent> & { id: number }): TradeIntent {
  const base = relianceIntent();
  const ref = overrides.entry?.reference ?? base.entry.reference;
  const stop = overrides.stop ?? base.stop;
  const risk = Math.abs(ref - stop);
  const sign = (overrides.direction ?? base.direction) === 'BUY' ? 1 : -1;
  return {
    ...base,
    riskDistance: risk,
    target1: ref + sign * risk,
    target2: ref + sign * 2 * risk,
    ...overrides,
    entry: { ...base.entry, ...overrides.entry },
  };
}
export const settings = (overrides: Partial<PaperSettings> = {}): PaperSettings => ({
  ...PAPER_DEFAULT_LIMITS,
  enabled: true,
  enabledAt: ENABLED_AT,
  entriesPaused: false,
  settingsVersion: 1,
  ...overrides,
});
export const assignments: PaperStrategyAssignment[] = [
  { strategyId: ORB_STRATEGY_ID, enabled: true, priority: 10 },
];
export const session: ExchangeSession = {
  tradingDate: '2026-09-17',
  kind: 'NORMAL',
  openAt: SESSION_OPEN,
  closeAt: ist(SESSION, 15, 30),
  entryCutoffAt: ist(SESSION, 14, 30),
  squareOffAt: ist(SESSION, 15, 15),
  note: null,
};
