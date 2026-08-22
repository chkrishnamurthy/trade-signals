import type { IntradayConfig } from './config.js';
import { pastForceExit } from './session.js';
import type {
  IntradayEvaluation,
  IntradaySnapshot,
  InvalidationRule,
  SignalCandidate,
  SignalKind,
  SignalQuality,
  SignalState,
  TechnicalLevels,
  TradeDirection,
} from './types.js';

/**
 * Signal lifecycle: state transitions, deduplication, cool-down, excursions.
 *
 * Pure. The caller owns storage and passes the current live signals in; this
 * decides what changes. That split is what lets the same transition logic run
 * against a database in the worker and against an in-memory array in a
 * backtest, and it is why every decision here is a function of its arguments
 * rather than of a clock.
 *
 * Three problems this solves, all of which make an intraday feed unusable if
 * left unsolved:
 *
 *   - **Duplicate spam.** A breakout that holds for forty minutes is ONE
 *     signal that stays valid, not fourteen identical cards. Identity is the
 *     `setupKey`, which the strategy anchors to the level it broke.
 *   - **Zombie signals.** A setup whose premise has failed must stop being
 *     displayed as an opportunity. Every signal carries its own invalidation
 *     conditions and they are checked on every cycle.
 *   - **Re-firing.** A signal that just failed will usually still satisfy the
 *     entry conditions on the next bar. The cool-down stops it coming
 *     straight back.
 */

/** A signal as the caller stores it. */
export interface LiveSignal {
  readonly id: string;
  readonly symbol: string;
  /** Stable setup identity — `kind|anchor`. */
  readonly setupKey: string;
  readonly kind: SignalKind;
  readonly direction: TradeDirection;
  readonly state: SignalState;
  readonly score: number;
  readonly quality: SignalQuality;
  readonly levels: TechnicalLevels;
  readonly invalidations: readonly InvalidationRule[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly triggeredAt: number | null;
  /** Price when the signal triggered, paise. Null before the trigger. */
  readonly referencePrice: number | null;
  /** Evaluations survived since the trigger. */
  readonly holds: number;
  /** Best excursion in the signal's favour since trigger, paise. */
  readonly maxFavourable: number;
  /** Worst excursion against it since trigger, paise. */
  readonly maxAdverse: number;
  readonly endedAt: number | null;
  readonly endReason: string | null;
}

/** Timeline entries — the audit trail behind "why does this say what it says". */
export type SignalEventKind =
  | 'detected'
  | 'state_change'
  | 'score_change'
  | 'target_reached'
  | 'invalidated'
  | 'expired';

export interface SignalEvent {
  readonly setupKey: string;
  readonly at: number;
  readonly kind: SignalEventKind;
  readonly message: string;
  readonly detail: string | null;
  readonly score: number;
  readonly state: SignalState;
}

export interface SignalCreation {
  readonly candidate: SignalCandidate;
  readonly state: SignalState;
  readonly triggeredAt: number | null;
  readonly referencePrice: number | null;
}

export interface SignalUpdate {
  readonly id: string;
  readonly state: SignalState;
  readonly score: number;
  readonly quality: SignalQuality;
  readonly holds: number;
  readonly maxFavourable: number;
  readonly maxAdverse: number;
  readonly triggeredAt: number | null;
  readonly referencePrice: number | null;
  /** Replaces the stored levels only when the signal has not yet triggered. */
  readonly levels: TechnicalLevels;
  readonly endedAt: number | null;
  readonly endReason: string | null;
}

export interface TransitionInput {
  /** Non-terminal signals for this symbol. */
  readonly existing: readonly LiveSignal[];
  readonly evaluation: IntradayEvaluation;
  /** Setup keys that ended recently, with when — for the cool-down. */
  readonly recentlyEnded: readonly { readonly setupKey: string; readonly endedAt: number }[];
  readonly at: Date;
}

export interface TransitionResult {
  readonly created: readonly SignalCreation[];
  readonly updated: readonly SignalUpdate[];
  readonly events: readonly SignalEvent[];
}

export function transition(input: TransitionInput, config: IntradayConfig): TransitionResult {
  const { existing, evaluation, recentlyEnded, at } = input;
  const now = at.getTime();
  const snapshot = evaluation.snapshot;

  const byKey = new Map(evaluation.candidates.map((candidate) => [candidate.setupKey, candidate]));
  const created: SignalCreation[] = [];
  const updated: SignalUpdate[] = [];
  const events: SignalEvent[] = [];

  const handled = new Set<string>();
  const forceExit = pastForceExit(at, config);
  const dataUsable = evaluation.dataQuality.usable;

  for (const signal of existing) {
    handled.add(signal.setupKey);
    const candidate = byKey.get(signal.setupKey) ?? null;
    const excursions = updateExcursions(signal, snapshot);

    const base = {
      id: signal.id,
      holds: signal.holds,
      maxFavourable: excursions.maxFavourable,
      maxAdverse: excursions.maxAdverse,
      triggeredAt: signal.triggeredAt,
      referencePrice: signal.referencePrice,
      levels: candidate !== null && signal.triggeredAt === null ? candidate.levels : signal.levels,
      score: candidate?.score ?? signal.score,
      quality: candidate?.quality ?? signal.quality,
    };

    const end = (state: SignalState, kind: SignalEventKind, message: string): void => {
      updated.push({ ...base, state, endedAt: now, endReason: message });
      events.push({
        setupKey: signal.setupKey,
        at: now,
        kind,
        message,
        detail: null,
        score: base.score,
        state,
      });
    };

    // --- Terminal checks, in the order that matters ------------------------
    // Invalidation first: a signal that is both invalidated and out of time is
    // invalidated, and recording it as merely expired would hide a failure.
    const live = isLive(signal.state);
    const fired = live ? firedInvalidation(signal, snapshot, dataUsable) : null;
    if (fired !== null) {
      end('invalidated', 'invalidated', fired);
      continue;
    }

    if (live && reachedTarget(signal, snapshot, 2)) {
      end('target_met', 'target_reached', 'Reached the second technical target');
      continue;
    }

    if (forceExit && live) {
      end('expired', 'expired', 'Session is ending — intraday setups must be closed out');
      continue;
    }

    if (!live && now - signal.createdAt > config.lifecycle.setupTimeoutMinutes * 60_000) {
      end('expired', 'expired', 'Setup never triggered within its window');
      continue;
    }

    if (live && now - signal.updatedAt > config.lifecycle.staleAfterMinutes * 60_000) {
      end('expired', 'expired', 'No fresh data — the signal can no longer be validated');
      continue;
    }

    if (candidate === null) {
      // The strategy no longer produces this setup. A live signal survives on
      // its own invalidation conditions — the setup stopping being detectable
      // is not the same as it having failed — but an untriggered one is gone.
      if (!live) {
        end('expired', 'expired', 'Setup conditions no longer present');
        continue;
      }
      updated.push({ ...base, state: signal.state, endedAt: null, endReason: null });
      continue;
    }

    // --- Promotion ---------------------------------------------------------
    const next = promote(signal, candidate, config);
    const holds = isLive(next.state) ? signal.holds + 1 : signal.holds;

    updated.push({
      ...base,
      holds,
      state: next.state,
      triggeredAt: next.triggeredAt,
      referencePrice: next.referencePrice,
      endedAt: null,
      endReason: null,
    });

    if (next.state !== signal.state) {
      events.push({
        setupKey: signal.setupKey,
        at: now,
        kind: 'state_change',
        message: STATE_MESSAGE[next.state],
        detail: candidate.reasons[0]?.detail ?? null,
        score: candidate.score,
        state: next.state,
      });
    } else if (Math.abs(candidate.score - signal.score) >= config.lifecycle.scoreChangeThreshold) {
      events.push({
        setupKey: signal.setupKey,
        at: now,
        kind: 'score_change',
        message: `Score ${candidate.score > signal.score ? 'increased' : 'decreased'} ${signal.score} → ${candidate.score}`,
        detail: null,
        score: candidate.score,
        state: next.state,
      });
    }

    if (isLive(next.state) && reachedTarget(signal, snapshot, 1)) {
      events.push({
        setupKey: signal.setupKey,
        at: now,
        kind: 'target_reached',
        message: 'Reached the first technical target',
        detail: null,
        score: candidate.score,
        state: next.state,
      });
    }
  }

  // --- New signals ---------------------------------------------------------
  for (const candidate of evaluation.candidates) {
    if (handled.has(candidate.setupKey)) continue;

    const cooldown = recentlyEnded.find((entry) => entry.setupKey === candidate.setupKey);
    if (
      cooldown !== undefined &&
      now - cooldown.endedAt < config.lifecycle.cooldownMinutes * 60_000
    ) {
      continue;
    }

    const state: SignalState = candidate.triggered
      ? 'triggered'
      : candidate.quality === 'watch'
        ? 'watching'
        : 'forming';

    created.push({
      candidate,
      state,
      triggeredAt: candidate.triggered ? now : null,
      referencePrice: candidate.triggered ? snapshot.price : null,
    });

    events.push({
      setupKey: candidate.setupKey,
      at: now,
      kind: 'detected',
      message: STATE_MESSAGE[state],
      detail: candidate.reasons[0]?.detail ?? null,
      score: candidate.score,
      state,
    });
  }

  return { created, updated, events };
}

const STATE_MESSAGE: Record<SignalState, string> = {
  watching: 'Setup detected — watching',
  forming: 'Setup forming',
  triggered: 'Trigger condition met',
  confirmed: 'Trigger confirmed by the following bar',
  active: 'Setup active and still valid',
  invalidated: 'Setup invalidated',
  expired: 'Setup expired',
  target_met: 'Second technical target reached',
};

function isLive(state: SignalState): boolean {
  return state === 'triggered' || state === 'confirmed' || state === 'active';
}

/**
 * The next state, given the current one and a fresh candidate.
 *
 * The `triggered → confirmed` step requires a SECOND evaluation in which the
 * setup is still valid. That is the whole value of the state: it is where the
 * false starts die.
 */
function promote(
  signal: LiveSignal,
  candidate: SignalCandidate,
  config: IntradayConfig,
): { state: SignalState; triggeredAt: number | null; referencePrice: number | null } {
  const keep = { triggeredAt: signal.triggeredAt, referencePrice: signal.referencePrice };

  switch (signal.state) {
    case 'watching':
      if (candidate.triggered) {
        return {
          state: 'triggered',
          triggeredAt: signal.updatedAt,
          referencePrice: candidate.levels.entryHigh,
        };
      }
      return { state: candidate.quality === 'watch' ? 'watching' : 'forming', ...keep };

    case 'forming':
      if (candidate.triggered) {
        return {
          state: 'triggered',
          triggeredAt: signal.updatedAt,
          referencePrice: candidate.levels.entryHigh,
        };
      }
      return { state: 'forming', ...keep };

    case 'triggered':
      return {
        state: signal.holds + 1 >= config.lifecycle.confirmationBars ? 'confirmed' : 'triggered',
        ...keep,
      };

    case 'confirmed':
      return { state: 'active', ...keep };

    default:
      return { state: signal.state, ...keep };
  }
}

/**
 * Whether any of the signal's own invalidation conditions has fired.
 *
 * Checked on a CLOSING basis, using the last closed bar's close. An intrabar
 * wick through a level is not the same as the market accepting a price there,
 * and stopping out on wicks would invalidate almost every valid setup.
 *
 * When the data is not usable, nothing is invalidated: acting on a stale or
 * incomplete feed is how a live setup gets killed by a missing candle.
 */
function firedInvalidation(
  signal: LiveSignal,
  snapshot: IntradaySnapshot,
  dataUsable: boolean,
): string | null {
  if (!dataUsable) return null;

  for (const rule of signal.invalidations) {
    switch (rule.kind) {
      case 'price_below':
        if (snapshot.price < rule.level) return rule.label;
        break;
      case 'price_above':
        if (snapshot.price > rule.level) return rule.label;
        break;
      case 'vwap_lost':
        if (snapshot.vwap !== null && snapshot.price < snapshot.vwap) return rule.label;
        break;
      case 'vwap_reclaimed':
        if (snapshot.vwap !== null && snapshot.price > snapshot.vwap) return rule.label;
        break;
      case 'momentum_reversed': {
        const histogram = snapshot.macdHistogram;
        if (histogram === null) break;
        const against = signal.direction === 'long' ? histogram < 0 : histogram > 0;
        if (against) return rule.label;
        break;
      }
      case 'session_end':
        // Handled by the clock, not by a price. Ignored here on purpose.
        break;
    }
  }
  return null;
}

/** True once price has closed beyond the numbered technical target. */
function reachedTarget(signal: LiveSignal, snapshot: IntradaySnapshot, which: 1 | 2): boolean {
  const target = which === 1 ? signal.levels.target1 : signal.levels.target2;
  return signal.direction === 'long' ? snapshot.price >= target : snapshot.price <= target;
}

/**
 * Maximum favourable and adverse excursion since the trigger, in paise.
 *
 * Measured against the bar's HIGH and LOW rather than its close, because that
 * is what actually happened during the bar — and because these two numbers are
 * the foundation of every honest performance question that can be asked later:
 * did the setup ever work, and how much heat did it take first.
 *
 * Nothing accumulates before the trigger: excursion from a price that was
 * never a reference is meaningless.
 */
function updateExcursions(
  signal: LiveSignal,
  snapshot: IntradaySnapshot,
): { maxFavourable: number; maxAdverse: number } {
  const reference = signal.referencePrice;
  if (reference === null) return { maxFavourable: 0, maxAdverse: 0 };

  const favourable =
    signal.direction === 'long'
      ? snapshot.lastBarHigh - reference
      : reference - snapshot.lastBarLow;
  const adverse =
    signal.direction === 'long'
      ? reference - snapshot.lastBarLow
      : snapshot.lastBarHigh - reference;

  return {
    maxFavourable: Math.max(signal.maxFavourable, Math.round(favourable)),
    maxAdverse: Math.max(signal.maxAdverse, Math.round(adverse)),
  };
}
