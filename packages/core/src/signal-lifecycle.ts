import {
  type SignalEvidence,
  type SignalProjection,
  sessionOpen,
  terminalSignalStates,
} from '@equitywise/shared';

export function pendingProjection(at: number): SignalProjection {
  return {
    state: 'ENTRY_PENDING',
    cursor: at,
    fill: null,
    exit: null,
    target1At: null,
    endedAt: null,
    resolution: 'OBSERVED',
    reason: 'Published; awaiting a prospective trigger observation.',
  };
}
export interface PriceObservation {
  at: number;
  receivedAt: number;
  price: number;
  continuous: boolean;
}
export function updateSignalStatus(
  evidence: SignalEvidence,
  previous: SignalProjection,
  observation: PriceObservation,
  expiresAt: number,
  options: { slippageBps?: number; moveToBreakeven?: boolean } = {},
): SignalProjection {
  if (
    terminalSignalStates.includes(previous.state) ||
    observation.at <= previous.cursor ||
    observation.at > observation.receivedAt ||
    !Number.isSafeInteger(observation.price) ||
    observation.price <= 0
  )
    return previous;
  const next = { ...previous, cursor: observation.at };
  const open = sessionOpen(new Date(evidence.confirmationAt)).getTime();
  const gap = !observation.continuous || observation.receivedAt - observation.at > 15_000;
  if (gap || previous.resolution === 'UNAVAILABLE') {
    return {
      ...next,
      resolution: 'UNAVAILABLE',
      ...(previous.state === 'ENTRY_PENDING' && observation.at >= expiresAt
        ? { state: 'EXPIRED' as const, endedAt: observation.at }
        : {}),
      reason: 'Feed coverage was interrupted. Outcome cannot be reconstructed from sampled prices.',
    };
  }
  const sign = evidence.direction === 'BUY' ? 1 : -1;
  const { trigger, invalidation, target1, target2, tickSize } = evidence.levels;
  const slipped = (price: number, fill: boolean): number => {
    const movement = sign * (fill ? 1 : -1);
    const raw = price + movement * Math.ceil((price * (options.slippageBps ?? 0)) / 10_000);
    return (movement > 0 ? Math.ceil(raw / tickSize) : Math.floor(raw / tickSize)) * tickSize;
  };
  const finish = (
    state: SignalProjection['state'],
    reason: string,
    exit: number | null,
  ): SignalProjection => ({ ...next, state, reason, exit, endedAt: observation.at });
  if (previous.state === 'ENTRY_PENDING') {
    if (observation.at >= expiresAt)
      return finish(
        'EXPIRED',
        'Three confirmation-anchored windows elapsed, or the 15:00 cutoff was reached.',
        null,
      );
    if (sign * (observation.price - invalidation) <= 0)
      return finish('INVALIDATED', 'Invalidation observed before the trigger.', null);
    if (sign * (observation.price - trigger) >= 0) {
      const fill = slipped(observation.price, true);
      if (
        fill <= 0 ||
        sign * (fill - invalidation) > 1.2 * evidence.indicators.atr ||
        sign * (target1 - fill) <= 0
      )
        return finish(
          'INVALIDATED',
          'Gap-adjusted simulated fill exceeded the risk limit or target premise.',
          null,
        );
      return {
        ...next,
        state: 'ACTIVE',
        fill,
        reason: 'Trigger observed prospectively; simulated fill includes configured slippage.',
      };
    }
    return next;
  }
  if (observation.at >= open + 365 * 60_000)
    return finish(
      'SQUARED_OFF',
      '15:20 session square-off on the first covered price observation.',
      slipped(observation.price, false),
    );
  // Breakeven takes effect only after the observation that recorded target 1.
  const stop =
    options.moveToBreakeven && previous.target1At !== null && previous.fill !== null
      ? previous.fill
      : invalidation;
  if (sign * (observation.price - stop) <= 0)
    return finish(
      'STOP_LOSS_HIT',
      'Invalidation observed; gaps use the worse observed price.',
      slipped(observation.price, false),
    );
  if (sign * (observation.price - target2) >= 0)
    return {
      ...finish(
        'TARGET_2_HIT',
        'Target 2 observed; full simulated exit at the target with slippage.',
        slipped(target2, false),
      ),
      target1At: previous.target1At ?? observation.at,
    };
  if (previous.target1At === null && sign * (observation.price - target1) >= 0)
    return {
      ...next,
      state: 'TARGET_1_HIT',
      target1At: observation.at,
      reason:
        'Target 1 observed; no partial realisation. Study continues to target 2 or invalidation.',
    };
  return next;
}
