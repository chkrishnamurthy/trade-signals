import type {
  ExchangeSession,
  PaperDecision,
  PaperReasonCode,
  PaperSettings,
  PaperStrategyAssignment,
  TradeIntent,
} from '@equitywise/shared';
import type { PaperCosts } from '../paper-journal.js';
import { PAPER_COSTS } from '../paper-journal.js';
import { sizePaperEntry } from './sizing.js';
import type { PortfolioState } from './state.js';

export interface AllocationInput {
  /** Intents not yet decided for this portfolio, any order. */
  intents: readonly TradeIntent[];
  state: PortfolioState;
  settings: PaperSettings;
  assignments: readonly PaperStrategyAssignment[];
  session: Pick<ExchangeSession, 'kind' | 'entryCutoffAt'>;
  /** The batch instant, injected. Intents past `validUntil` are expired. */
  asOf: number;
  costs?: PaperCosts;
}

const TEXT: Record<PaperReasonCode, string> = {
  INSUFFICIENT_CASH: 'Not enough free virtual cash for even one share.',
  PORTFOLIO_RISK_LIMIT: 'Portfolio exposure limit reached.',
  DAILY_LOSS_LIMIT: 'Daily loss limit reached; no new trades today.',
  DRAWDOWN_LIMIT: 'Drawdown limit reached; new trades paused until resumed.',
  MAX_POSITIONS: 'Maximum open paper trades reached.',
  MAX_TRADES_PER_DAY: 'Maximum trades for the day reached.',
  STOCK_EXPOSURE_LIMIT: 'Exposure limit for this stock reached.',
  SECTOR_EXPOSURE_LIMIT: 'Exposure limit for this sector reached.',
  DUPLICATE_SIGNAL: 'Another signal for this stock was already taken this session.',
  CONFLICTING_SIGNAL: 'Strategies disagreed on direction for this stock; neither was taken.',
  EXISTING_POSITION: 'A paper trade in this stock is already live.',
  STRATEGY_DISABLED: 'This strategy is not enabled for the portfolio.',
  PAPER_TRADING_DISABLED: 'Paper trading is off.',
  ENTRIES_PAUSED: 'New entries are paused.',
  SIGNAL_BEFORE_ACTIVATION: 'The signal came before paper trading was switched on.',
  SIGNAL_EXPIRED: 'The entry window for this signal has passed.',
  MARKET_CLOSED: 'The exchange is closed.',
  AFTER_ENTRY_CUTOFF: 'Past the entry cutoff for the session.',
  STALE_MARKET_DATA: 'Market data was stale.',
  MISSING_CANDLE: 'A candle was missing.',
  ENTRY_GAP_TOO_LARGE: 'The next price was too far from the signal close.',
  INVALID_STOP: 'The stop level is not usable.',
  QUANTITY_ZERO: 'The limits allow no shares for this trade.',
  UNSUPPORTED_ENTRY_KIND: 'This entry rule is not supported yet.',
  EOD_SQUARE_OFF: 'Closed at the end-of-day square-off.',
  COVERAGE_UNAVAILABLE: 'Price coverage was interrupted; the outcome cannot be reconstructed.',
};
export const paperReasonText = (code: PaperReasonCode) => TEXT[code];

const bps = (base: number, points: number) => Math.floor((base * points) / 10_000);

/**
 * The shared-capital allocation rule (docs/planning/paper-trading-plan.md §10).
 * Deterministic: pre-filters, then conflicts by strategy priority, then an
 * explicit sort (priority, strength, symbol) — never database arrival order.
 * Returns one decision per intent, in the order they were considered.
 */
export function decidePaperEntries(input: AllocationInput): PaperDecision[] {
  const costs = input.costs ?? PAPER_COSTS;
  const { settings, session } = input;
  const priority = new Map(
    input.assignments.filter((a) => a.enabled).map((a) => [a.strategyId, a.priority]),
  );
  const decisions = new Map<number, PaperDecision>();
  const counts = { openPositions: input.state.openPositions, tradesToday: input.state.tradesToday };
  const reject = (intent: TradeIntent, code: PaperReasonCode) =>
    decisions.set(intent.id, {
      intentId: intent.id,
      strategyId: intent.strategyId,
      accepted: false,
      reasonCode: code,
      reasonText: TEXT[code],
      shares: 0,
      sizing: null,
      counts: { ...counts },
    });

  const halted: PaperReasonCode | null =
    input.state.dayNetPaise <= -bps(input.state.startOfDayEquityPaise, settings.dailyLossHaltBps)
      ? 'DAILY_LOSS_LIMIT'
      : input.state.equityPaise <=
          input.state.peakEquityPaise -
            bps(input.state.peakEquityPaise, settings.maxDrawdownHaltBps)
        ? 'DRAWDOWN_LIMIT'
        : null;

  // 1. Pre-filters that depend on the intent alone.
  const survivors: TradeIntent[] = [];
  for (const intent of input.intents) {
    if (decisions.has(intent.id)) continue;
    const key = `${intent.strategyId}:${intent.instrumentId}:${intent.sessionDate}`;
    if (!settings.enabled) reject(intent, 'PAPER_TRADING_DISABLED');
    else if (settings.entriesPaused) reject(intent, 'ENTRIES_PAUSED');
    else if (settings.enabledAt === null || intent.signalAt <= settings.enabledAt)
      reject(intent, 'SIGNAL_BEFORE_ACTIVATION');
    else if (!priority.has(intent.strategyId)) reject(intent, 'STRATEGY_DISABLED');
    else if (session.kind !== 'NORMAL' && session.kind !== 'SPECIAL' && session.kind !== 'MUHURAT')
      reject(intent, 'MARKET_CLOSED');
    else if (session.entryCutoffAt !== null && intent.signalAt > session.entryCutoffAt)
      reject(intent, 'AFTER_ENTRY_CUTOFF');
    else if (input.asOf > intent.validUntil) reject(intent, 'SIGNAL_EXPIRED');
    else if (intent.entry.kind !== 'MARKET_NEXT') reject(intent, 'UNSUPPORTED_ENTRY_KIND');
    else if (
      intent.riskDistance <= 0 ||
      (intent.direction === 'BUY'
        ? intent.stop >= intent.entry.reference
        : intent.stop <= intent.entry.reference)
    )
      reject(intent, 'INVALID_STOP');
    else if (halted) reject(intent, halted);
    else if (input.state.decidedKeys.has(key)) reject(intent, 'DUPLICATE_SIGNAL');
    else if (input.state.liveInstruments.has(intent.instrumentId))
      reject(intent, 'EXISTING_POSITION');
    else survivors.push(intent);
  }

  // 2. Conflicts within the batch: same instrument, opposite directions.
  const byInstrument = new Map<number, TradeIntent[]>();
  for (const intent of survivors)
    byInstrument.set(intent.instrumentId, [
      ...(byInstrument.get(intent.instrumentId) ?? []),
      intent,
    ]);
  const candidates: TradeIntent[] = [];
  for (const group of byInstrument.values()) {
    if (group.length === 1) {
      candidates.push(group[0] as TradeIntent);
      continue;
    }
    const rank = (i: TradeIntent) => priority.get(i.strategyId) ?? Number.MAX_SAFE_INTEGER;
    const best = Math.min(...group.map(rank));
    const top = group.filter((i) => rank(i) === best);
    const directions = new Set(top.map((i) => i.direction));
    if (directions.size > 1) {
      for (const i of group) reject(i, 'CONFLICTING_SIGNAL');
      continue;
    }
    // One winner per instrument: best priority, then strength, then symbol (stable).
    const winner = [...top].sort(
      (a, b) => b.sizing.strength - a.sizing.strength || a.id - b.id,
    )[0] as TradeIntent;
    candidates.push(winner);
    for (const i of group)
      if (i !== winner) reject(i, rank(i) === best ? 'DUPLICATE_SIGNAL' : 'CONFLICTING_SIGNAL');
  }

  // 3. Deterministic order, then sizing against a working copy of the state.
  candidates.sort(
    (a, b) =>
      (priority.get(a.strategyId) ?? 0) - (priority.get(b.strategyId) ?? 0) ||
      b.sizing.strength - a.sizing.strength ||
      a.symbol.localeCompare(b.symbol),
  );
  let working: PortfolioState = {
    ...input.state,
    exposureByInstrument: new Map(input.state.exposureByInstrument),
    exposureBySector: new Map(input.state.exposureBySector),
  };
  for (const intent of candidates) {
    if (counts.openPositions >= settings.maxOpenPositions) {
      reject(intent, 'MAX_POSITIONS');
      continue;
    }
    if (counts.tradesToday >= settings.maxTradesPerDay) {
      reject(intent, 'MAX_TRADES_PER_DAY');
      continue;
    }
    const sizing = sizePaperEntry(intent, working, settings, costs);
    if (sizing.shares < 1) {
      const code: PaperReasonCode =
        sizing.bindingCap === 'byCash' || sizing.bindingCap === 'charges'
          ? 'INSUFFICIENT_CASH'
          : sizing.bindingCap === 'byStock'
            ? 'STOCK_EXPOSURE_LIMIT'
            : sizing.bindingCap === 'bySector'
              ? 'SECTOR_EXPOSURE_LIMIT'
              : sizing.bindingCap === 'byPortfolio'
                ? 'PORTFOLIO_RISK_LIMIT'
                : 'QUANTITY_ZERO';
      decisions.set(intent.id, {
        intentId: intent.id,
        strategyId: intent.strategyId,
        accepted: false,
        reasonCode: code,
        reasonText: TEXT[code],
        shares: 0,
        sizing,
        counts: { ...counts },
      });
      continue;
    }
    const notional = sizing.shares * intent.entry.reference;
    const exposureByInstrument = new Map(working.exposureByInstrument);
    exposureByInstrument.set(
      intent.instrumentId,
      (exposureByInstrument.get(intent.instrumentId) ?? 0) + notional,
    );
    const exposureBySector = new Map(working.exposureBySector);
    if (intent.sector !== null)
      exposureBySector.set(intent.sector, (exposureBySector.get(intent.sector) ?? 0) + notional);
    working = {
      ...working,
      cashPaise: working.cashPaise - sizing.reservePaise,
      reservedPaise: working.reservedPaise + sizing.reservePaise,
      exposureByInstrument,
      exposureBySector,
      totalExposurePaise: working.totalExposurePaise + notional,
    };
    counts.openPositions += 1;
    counts.tradesToday += 1;
    decisions.set(intent.id, {
      intentId: intent.id,
      strategyId: intent.strategyId,
      accepted: true,
      reasonCode: null,
      reasonText: `Accepted: ${sizing.shares} simulated shares (bound by ${sizing.bindingCap}).`,
      shares: sizing.shares,
      sizing,
      counts: { ...counts },
    });
  }
  // Decision order: pre-filter rejections as met, then candidates in allocation order.
  // The order is part of the answer — it says who got capital first.
  return [...decisions.values()];
}
