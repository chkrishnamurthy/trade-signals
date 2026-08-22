import {
  isPreOpen,
  istMinutesOfDay,
  isWeekend,
  MARKET_CLOSE_MINUTES,
  MARKET_OPEN_MINUTES,
  minutesSinceOpen,
} from '@signal/shared';
import type { IntradayConfig, RegimeProfile } from './config.js';
import type { SessionRegime } from './types.js';

/**
 * Where in the trading day an instant falls.
 *
 * Pure: the instant is passed in, never read from a clock (CLAUDE.md hard
 * rule 1), which is what lets a backtest replay any day through the same
 * regime logic the live path uses.
 *
 * Holiday-unaware by construction — the trading calendar is a data question
 * and belongs to the caller, which has the provider's market status. This
 * answers only "what does the clock say".
 */

/** The regime an instant falls in. */
export function sessionRegime(at: Date, config: IntradayConfig): SessionRegime {
  if (isWeekend(at)) return 'closed';
  if (isPreOpen(at)) return 'pre_open';

  const minutes = istMinutesOfDay(at);
  if (minutes < MARKET_OPEN_MINUTES || minutes >= MARKET_CLOSE_MINUTES) return 'closed';

  const elapsed = minutesSinceOpen(at);
  const { openingEnds, earlyEnds, midEnds, afternoonEnds } = config.regimeBoundaries;
  if (elapsed < openingEnds) return 'opening';
  if (elapsed < earlyEnds) return 'early';
  if (elapsed < midEnds) return 'mid';
  if (elapsed < afternoonEnds) return 'afternoon';
  return 'closing';
}

/** The threshold adjustments for a regime. Non-trading regimes emit nothing. */
export function regimeProfile(regime: SessionRegime, config: IntradayConfig): RegimeProfile {
  if (regime === 'pre_open' || regime === 'closed') {
    return { volumeMultiplier: 1, scorePenalty: 100, allowNewSignals: false };
  }
  return config.regimes[regime];
}

/** Minutes left in the continuous session. Zero once it has closed. */
export function minutesToClose(at: Date): number {
  return Math.max(0, MARKET_CLOSE_MINUTES - istMinutesOfDay(at));
}

/**
 * Whether a NEW signal may be emitted at this instant.
 *
 * Three gates, each of which exists because of a specific failure:
 *   - warm-up, because indicators computed off six bars are noise;
 *   - the closing cutoff, because an intraday setup with twenty minutes left
 *     cannot reach a target and must be exited before the bell regardless;
 *   - the regime's own `allowNewSignals`.
 */
export function canEmitNewSignal(
  at: Date,
  config: IntradayConfig,
): { readonly allowed: boolean; readonly reason: string | null } {
  const regime = sessionRegime(at, config);
  if (regime === 'closed' || regime === 'pre_open') {
    return { allowed: false, reason: 'Market is not in continuous trading' };
  }

  const elapsed = minutesSinceOpen(at);
  if (elapsed < config.session.warmupMinutes) {
    const remaining = config.session.warmupMinutes - elapsed;
    return { allowed: false, reason: `Session warm-up — ${remaining} more minutes of data needed` };
  }

  const remaining = minutesToClose(at);
  if (remaining <= config.session.noNewSignalsBeforeCloseMinutes) {
    return {
      allowed: false,
      reason: `Too close to the session end — ${remaining} minutes left, an intraday setup needs more`,
    };
  }

  if (!regimeProfile(regime, config).allowNewSignals) {
    return { allowed: false, reason: `No new setups during the ${regime} regime` };
  }

  return { allowed: true, reason: null };
}

/** True once live signals must be treated as out of time. */
export function pastForceExit(at: Date, config: IntradayConfig): boolean {
  return minutesToClose(at) <= config.session.forceExitBeforeCloseMinutes;
}

/** Human label for a regime, used in evidence strings and the UI. */
export const REGIME_LABEL: Record<SessionRegime, string> = {
  pre_open: 'Pre-open',
  opening: 'Opening',
  early: 'Early session',
  mid: 'Mid session',
  afternoon: 'Afternoon',
  closing: 'Closing period',
  closed: 'Closed',
};
