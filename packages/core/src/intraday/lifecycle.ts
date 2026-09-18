import {
  type IntradayEvidence,
  type IntradayExit,
  type IntradayProjection,
  type IntradaySkipReason,
  sessionOpen,
  terminalIntradayStatuses,
} from '@equitywise/shared';
import {
  estimatedFill,
  PAPER_COSTS,
  type PaperCosts,
  paperCharges,
  paperNet,
} from '../paper-journal.js';
import { ORB_CONFIG, type OrbConfig } from './config.js';

/** One sampled price. `continuous` is false when coverage broke before it. */
export interface IntradayObservation {
  at: number;
  receivedAt: number;
  price: number;
  continuous: boolean;
}

/** What the shared paper book offers a signal at fill time; null = not taken. */
export interface BookAllocation {
  capitalPaise: number;
  availablePaise: number;
  riskBps: number;
  /** A ceiling decided earlier (the paper engine's sizing); sizing never exceeds it. */
  maxShares?: number | undefined;
}

export function pendingIntradayProjection(
  publishedAt: number,
  skipReason: IntradaySkipReason | null = null,
): IntradayProjection {
  return {
    status: 'PENDING',
    cursor: publishedAt,
    taken: skipReason === null,
    skipReason,
    shares: 0,
    remainingShares: 0,
    fill: null,
    fillAt: null,
    effectiveStop: null,
    exits: [],
    target1At: null,
    endedAt: null,
    resolution: 'OBSERVED',
    reason:
      skipReason === null
        ? 'Published; simulated entry at the next observed price.'
        : 'Published; tracked without simulated shares.',
  };
}

/**
 * Shares for one trade: risk 1 % of capital over the per-share risk, capped by
 * the cash actually free (no leverage), then reduced until the round-trip
 * charges also fit. Zero is a legitimate answer ("too expensive").
 */
export function sizeTrade(
  fill: number,
  stop: number,
  allocation: BookAllocation,
  costs: PaperCosts = PAPER_COSTS,
): number {
  const perShare = Math.abs(fill - stop);
  if (
    ![fill, stop, allocation.capitalPaise, allocation.availablePaise, allocation.riskBps].every(
      Number.isSafeInteger,
    ) ||
    perShare <= 0 ||
    allocation.capitalPaise <= 0 ||
    allocation.availablePaise < 0
  )
    return 0;
  const budget = Math.floor((allocation.capitalPaise * allocation.riskBps) / 10_000);
  let shares = Math.min(
    Math.floor(budget / perShare),
    Math.floor(allocation.availablePaise / Math.max(fill, stop)),
  );
  const reserve = (n: number) =>
    Math.max(fill, stop) * n + paperCharges(Math.max(fill, stop), Math.max(fill, stop), n, costs);
  while (shares > 0 && reserve(shares) > allocation.availablePaise) shares -= 1;
  return shares;
}

/**
 * One pure step: apply one observation to a signal's projection. The worker
 * feeds sampled quotes in order; the replay feeds 1-minute opens/highs/lows.
 */
export function stepProjection(
  evidence: IntradayEvidence,
  previous: IntradayProjection,
  observation: IntradayObservation,
  allocation: BookAllocation | null,
  config: OrbConfig = ORB_CONFIG,
  costs: PaperCosts = PAPER_COSTS,
): IntradayProjection {
  if (
    terminalIntradayStatuses.includes(previous.status) ||
    observation.at <= previous.cursor ||
    observation.at > observation.receivedAt ||
    !Number.isSafeInteger(observation.price) ||
    observation.price <= 0
  )
    return previous;
  const next: IntradayProjection = { ...previous, cursor: observation.at };
  const gap =
    !observation.continuous || observation.receivedAt - observation.at > config.coverageGapMs;
  if (gap || previous.resolution === 'UNAVAILABLE')
    return {
      ...next,
      resolution: 'UNAVAILABLE',
      reason: 'Price coverage was interrupted; the outcome cannot be reconstructed from samples.',
    };

  const { direction, levels } = evidence;
  const sign = direction === 'BUY' ? 1 : -1;
  const tick = levels.tickSize;
  const exitPrice = (price: number) => estimatedFill(price, tick, direction, false, costs);
  const exitAll = (
    price: number,
    reason: IntradayExit['reason'],
    status: IntradayProjection['status'],
    why: string,
  ): IntradayProjection => ({
    ...next,
    status,
    remainingShares: 0,
    exits:
      next.remainingShares > 0
        ? [...next.exits, { at: observation.at, price, shares: next.remainingShares, reason }]
        : next.exits,
    endedAt: observation.at,
    reason: why,
  });

  if (previous.status === 'PENDING') {
    const fill = estimatedFill(observation.price, tick, direction, true, costs);
    if (sign * (fill - levels.ref) > (levels.ref * config.maxSlipBps) / 10_000)
      return {
        ...next,
        status: 'SKIPPED',
        taken: false,
        skipReason: 'ENTRY_SLIPPED',
        endedAt: observation.at,
        reason: `First observed price was more than ${config.maxSlipBps / 100}% past the signal close.`,
      };
    const shares =
      previous.taken && allocation
        ? Math.min(
            sizeTrade(fill, levels.stop, allocation, costs),
            allocation.maxShares ?? Number.MAX_SAFE_INTEGER,
          )
        : 0;
    const taken = previous.taken && shares > 0;
    return {
      ...next,
      status: 'ACTIVE',
      taken,
      skipReason: taken ? null : (previous.skipReason ?? 'TOO_EXPENSIVE'),
      shares,
      remainingShares: shares,
      fill,
      fillAt: observation.at,
      effectiveStop: levels.stop,
      reason: taken
        ? 'Simulated entry at the next observed price, with slippage.'
        : 'Tracked without simulated shares.',
    };
  }

  const stop = previous.effectiveStop ?? levels.stop;
  const fill = previous.fill ?? levels.ref;
  const squareOffAt =
    sessionOpen(new Date(evidence.signalAt)).getTime() + (config.squareOffMinute - 555) * 60_000;
  if (observation.at >= squareOffAt)
    return exitAll(
      exitPrice(observation.price),
      'EOD',
      'CLOSED_EOD',
      'Squared off on the first covered price at or after 15:15.',
    );
  if (sign * (observation.price - stop) <= 0) {
    // A gap through the stop exits at the worse observed price, never at the level.
    const worse =
      direction === 'BUY' ? Math.min(observation.price, stop) : Math.max(observation.price, stop);
    const breakeven = stop === fill;
    return exitAll(
      exitPrice(worse),
      breakeven ? 'BREAKEVEN_STOP' : 'STOP',
      'STOPPED_OUT',
      breakeven
        ? 'Breakeven stop observed after Target 1; remainder exited at the entry level.'
        : 'Stop level observed; remainder exited with slippage.',
    );
  }

  let state = next;
  if (state.status === 'ACTIVE' && sign * (observation.price - levels.target1) >= 0) {
    const partial =
      state.remainingShares >= 2 ? Math.floor(state.remainingShares * config.partialAtTarget1) : 0;
    state = {
      ...state,
      status: 'TARGET_1_HIT',
      target1At: observation.at,
      effectiveStop: fill,
      remainingShares: state.remainingShares - partial,
      exits:
        partial > 0
          ? [
              ...state.exits,
              {
                at: observation.at,
                price: exitPrice(levels.target1),
                shares: partial,
                reason: 'TARGET_1',
              },
            ]
          : state.exits,
      reason:
        partial > 0
          ? 'Target 1 observed; half booked and the stop moved to the entry level.'
          : 'Target 1 observed; stop moved to the entry level.',
    };
  }
  if (state.status === 'TARGET_1_HIT' && sign * (observation.price - levels.target2) >= 0)
    return {
      ...state,
      status: 'TARGET_2_HIT',
      remainingShares: 0,
      exits:
        state.remainingShares > 0
          ? [
              ...state.exits,
              {
                at: observation.at,
                price: exitPrice(levels.target2),
                shares: state.remainingShares,
                reason: 'TARGET_2',
              },
            ]
          : state.exits,
      endedAt: observation.at,
      reason: 'Target 2 observed; remainder exited at the target with slippage.',
    };
  return state;
}

/** Net simulated result of the closed legs; null before the first exit. */
export function realisedNet(
  evidence: IntradayEvidence,
  projection: IntradayProjection,
  costs: PaperCosts = PAPER_COSTS,
): number | null {
  if (projection.fill === null || projection.exits.length === 0) return null;
  const fill = projection.fill;
  return projection.exits.reduce(
    (sum, leg) =>
      sum + (leg.shares > 0 ? paperNet(evidence.direction, fill, leg.price, leg.shares, costs) : 0),
    0,
  );
}

/** Realised plus the open remainder marked at `price` (slippage applied). */
export function markNet(
  evidence: IntradayEvidence,
  projection: IntradayProjection,
  price: number | null,
  costs: PaperCosts = PAPER_COSTS,
): number | null {
  if (projection.fill === null || !projection.taken) return null;
  const realised = realisedNet(evidence, projection, costs) ?? 0;
  if (projection.remainingShares === 0) return realised;
  if (price === null || !Number.isSafeInteger(price) || price <= 0) return null;
  const exit = estimatedFill(price, evidence.levels.tickSize, evidence.direction, false, costs);
  return (
    realised +
    paperNet(evidence.direction, projection.fill, exit, projection.remainingShares, costs)
  );
}

/** The most the trade could lose at the published stop: shares × risk from the fill. */
export function initialRisk(
  evidence: IntradayEvidence,
  projection: IntradayProjection,
): number | null {
  if (projection.fill === null || projection.shares === 0) return null;
  return Math.abs(projection.fill - evidence.levels.stop) * projection.shares;
}
