import {
  type IntradayExit,
  type IntradayProjection,
  type PaperPosition,
  type PaperPositionEventKind,
  sessionOpen,
  type TradeIntent,
} from '@equitywise/shared';
import { ORB_CONFIG, type OrbConfig } from '../intraday/config.js';
import {
  type IntradayObservation,
  pendingIntradayProjection,
  stepProjection,
} from '../intraday/lifecycle.js';
import { PAPER_COSTS, type PaperCosts, paperCharges } from '../paper-journal.js';
import { type LedgerDraft, ledgerDrafts } from './ledger.js';

/**
 * A paper position is the intraday lifecycle projection plus money. This
 * module advances the projection by one observation and turns what changed
 * into ledger drafts and position events, so the repository only persists.
 */
export interface PositionEvent {
  kind: PaperPositionEventKind;
  at: number;
  pricePaise: number | null;
  shares: number | null;
  explanation: string;
}
export interface FillDraft {
  /** 0 entry, 1 Target 1 partial, 2 final exit. Idempotency key with the order. */
  leg: 0 | 1 | 2;
  at: number;
  pricePaise: number;
  shares: number;
  chargesPaise: number;
  resolution: 'OBSERVED' | 'UNAVAILABLE';
}
export interface AdvanceResult {
  position: PaperPosition;
  fills: FillDraft[];
  events: PositionEvent[];
  /** Built by the caller once fill ids exist: see `ledgerForFills`. */
  changed: boolean;
}

export function newPaperPosition(
  id: number,
  intent: TradeIntent,
  publishedAt: number,
): PaperPosition {
  return {
    id,
    intentId: intent.id,
    strategyId: intent.strategyId,
    strategyVersionId: intent.strategyVersionId,
    instrumentId: intent.instrumentId,
    symbol: intent.symbol,
    sector: intent.sector,
    direction: intent.direction,
    status: 'OPEN',
    projection: pendingIntradayProjection(publishedAt, null),
    lockedPaise: 0,
    grossRealisedPaise: 0,
    chargesPaise: 0,
    netRealisedPaise: 0,
    initialRiskPaise: null,
    exitReason: null,
    openedAt: null,
    closedAt: null,
  };
}

const legCharges = (
  direction: 'BUY' | 'SELL',
  fill: number,
  exit: number,
  shares: number,
  costs: PaperCosts,
) =>
  paperCharges(direction === 'BUY' ? fill : exit, direction === 'BUY' ? exit : fill, shares, costs);

/**
 * Applies one observation. `maxShares` is the engine's decision; the lifecycle
 * re-checks free cash at the actual fill and may size smaller, never larger.
 */
export function advancePosition(
  position: PaperPosition,
  intent: TradeIntent,
  observation: IntradayObservation,
  allocation: {
    equityPaise: number;
    availablePaise: number;
    riskBps: number;
    maxShares: number;
  } | null,
  config: OrbConfig = ORB_CONFIG,
  costs: PaperCosts = PAPER_COSTS,
  /** The session's square-off instant (special sessions differ from the config's 15:15). */
  squareOffAt: number | null = null,
): AdvanceResult {
  const prev = position.projection;
  if (
    position.status === 'CLOSED' ||
    observation.at <= prev.cursor ||
    observation.at > observation.receivedAt
  )
    return { position, fills: [], events: [], changed: false };
  const fills: FillDraft[] = [];
  const events: PositionEvent[] = [];
  const sign = intent.direction === 'BUY' ? 1 : -1;
  // A market-next entry is good for one candle. The first observation after
  // the window closes cancels it — it never fills late at a price the
  // strategy did not ask for.
  if (prev.fill === null && observation.at > intent.validUntil) {
    const cancelled: PaperPosition = {
      ...position,
      status: 'CLOSED',
      closedAt: observation.at,
      exitReason: 'SIGNAL_EXPIRED',
      projection: {
        ...prev,
        cursor: observation.at,
        status: 'SKIPPED',
        endedAt: observation.at,
        taken: false,
        reason: 'No observed price inside the entry window; no simulated entry recorded.',
      },
    };
    events.push({
      kind: 'UNRESOLVED',
      at: observation.at,
      pricePaise: null,
      shares: null,
      explanation: cancelled.projection.reason,
    });
    return { position: cancelled, fills, events, changed: true };
  }
  const effectiveConfig =
    squareOffAt === null
      ? config
      : {
          ...config,
          squareOffMinute:
            555 +
            Math.round((squareOffAt - sessionOpen(new Date(intent.signalAt)).getTime()) / 60_000),
        };
  let next: IntradayProjection = stepProjection(
    intent.evidence,
    prev,
    observation,
    allocation === null
      ? null
      : {
          capitalPaise: allocation.equityPaise,
          availablePaise: allocation.availablePaise,
          riskBps: allocation.riskBps,
          maxShares: allocation.maxShares,
        },
    effectiveConfig,
    costs,
  );
  if (next === prev) return { position, fills: [], events: [], changed: false };
  // The decision reserved cash for `decidedShares`; if the actual price still
  // leaves room for none, the trade is declined rather than opened empty.
  if (prev.fill === null && next.fill !== null && next.shares === 0)
    next = {
      ...next,
      status: 'SKIPPED',
      taken: false,
      skipReason: 'TOO_EXPENSIVE',
      fill: null,
      fillAt: null,
      effectiveStop: null,
      endedAt: observation.at,
      reason: 'The next observed price left no room for a single share within the limits.',
    };
  let p: PaperPosition = { ...position, projection: next };

  if (prev.fill === null && next.fill !== null) {
    fills.push({
      leg: 0,
      at: next.fillAt ?? observation.at,
      pricePaise: next.fill,
      shares: next.shares,
      chargesPaise: 0,
      resolution: next.resolution,
    });
    p = {
      ...p,
      lockedPaise: next.fill * next.shares,
      initialRiskPaise: Math.abs(next.fill - intent.stop) * next.shares,
      openedAt: next.fillAt,
    };
    events.push({
      kind: 'OPENED',
      at: next.fillAt ?? observation.at,
      pricePaise: next.fill,
      shares: next.shares,
      explanation: `Simulated entry: ${next.shares} shares at the next observed price with slippage.`,
    });
  }
  if (next.status === 'SKIPPED' && prev.status === 'PENDING') {
    p = {
      ...p,
      status: 'CLOSED',
      closedAt: observation.at,
      exitReason: next.skipReason === 'TOO_EXPENSIVE' ? 'QUANTITY_ZERO' : 'ENTRY_GAP_TOO_LARGE',
    };
    events.push({
      kind: 'UNRESOLVED',
      at: observation.at,
      pricePaise: observation.price,
      shares: null,
      explanation: next.reason,
    });
    return { position: p, fills, events, changed: true };
  }
  for (const leg of next.exits.slice(prev.exits.length)) {
    const fill = next.fill ?? intent.entry.reference;
    const charges = legCharges(intent.direction, fill, leg.price, leg.shares, costs);
    const gross = sign * (leg.price - fill) * leg.shares;
    const legIndex: 1 | 2 = leg.reason === 'TARGET_1' ? 1 : 2;
    fills.push({
      leg: legIndex,
      at: leg.at,
      pricePaise: leg.price,
      shares: leg.shares,
      chargesPaise: charges,
      resolution: next.resolution,
    });
    p = {
      ...p,
      lockedPaise: p.lockedPaise - fill * leg.shares,
      grossRealisedPaise: p.grossRealisedPaise + gross,
      chargesPaise: p.chargesPaise + charges,
      netRealisedPaise: p.netRealisedPaise + gross - charges,
    };
    events.push(exitEvent(leg, next));
  }
  if (
    next.target1At !== null &&
    prev.target1At === null &&
    next.effectiveStop !== prev.effectiveStop
  )
    events.push({
      kind: 'STOP_UPDATED',
      at: next.target1At,
      pricePaise: next.effectiveStop,
      shares: null,
      explanation: 'Target 1 reached; the stop moved to the entry level (breakeven).',
    });
  if (next.resolution === 'UNAVAILABLE' && prev.resolution === 'OBSERVED')
    events.push({
      kind: 'COVERAGE_BREAK',
      at: observation.at,
      pricePaise: null,
      shares: null,
      explanation: next.reason,
    });
  if (next.endedAt !== null && prev.endedAt === null) {
    const last = next.exits.at(-1);
    p = {
      ...p,
      status: 'CLOSED',
      closedAt: next.endedAt,
      exitReason: last
        ? EXIT_REASON[last.reason]
        : next.resolution === 'UNAVAILABLE'
          ? 'COVERAGE_UNAVAILABLE'
          : 'EOD_SQUARE_OFF',
    };
  }
  return { position: p, fills, events, changed: true };
}

const EXIT_REASON: Record<IntradayExit['reason'], PaperPositionEventKind> = {
  TARGET_1: 'TARGET1_PARTIAL',
  TARGET_2: 'TARGET2',
  STOP: 'STOP',
  BREAKEVEN_STOP: 'BREAKEVEN_STOP',
  EOD: 'EOD_SQUARE_OFF',
};
function exitEvent(leg: IntradayExit, next: IntradayProjection): PositionEvent {
  const text: Record<IntradayExit['reason'], string> = {
    TARGET_1: `Target 1 reached: ${leg.shares} shares booked.`,
    TARGET_2: `Target 2 reached: remaining ${leg.shares} shares booked.`,
    STOP: `Stop level reached: ${leg.shares} shares exited.`,
    BREAKEVEN_STOP: `Breakeven stop reached after Target 1: ${leg.shares} shares exited near the entry level.`,
    EOD: `End-of-day square-off: ${leg.shares} shares exited.`,
  };
  return {
    kind: EXIT_REASON[leg.reason],
    at: leg.at,
    pricePaise: leg.price,
    shares: leg.shares,
    explanation:
      `${text[leg.reason]} ${next.resolution === 'UNAVAILABLE' ? '(coverage was interrupted)' : ''}`.trim(),
  };
}

/** Ledger drafts for persisted fills (ids known). Entry locks cost; exits return cost + gross, then charges. */
export function ledgerForFills(
  portfolioId: number,
  position: PaperPosition,
  intent: TradeIntent,
  fills: readonly {
    id: number;
    leg: number;
    at: number;
    pricePaise: number;
    shares: number;
    chargesPaise: number;
  }[],
): LedgerDraft[] {
  const drafts: LedgerDraft[] = [];
  const sign = intent.direction === 'BUY' ? 1 : -1;
  const entry = position.projection.fill ?? intent.entry.reference;
  for (const f of fills) {
    if (f.leg === 0)
      drafts.push(ledgerDrafts.entry(portfolioId, f.id, f.at, f.pricePaise * f.shares));
    else {
      const cost = entry * f.shares;
      const gross = sign * (f.pricePaise - entry) * f.shares;
      drafts.push(ledgerDrafts.exit(portfolioId, f.id, f.at, cost + gross, cost));
      if (f.chargesPaise > 0)
        drafts.push(ledgerDrafts.charges(portfolioId, f.id, f.at, f.chargesPaise));
    }
  }
  return drafts;
}
