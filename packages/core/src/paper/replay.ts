import type {
  ExchangeSession,
  PaperDecision,
  PaperLedgerEntry,
  PaperPosition,
  PaperSettings,
  PaperStrategyAssignment,
  TradeIntent,
} from '@equitywise/shared';
import { istMinutesOfDay } from '@equitywise/shared';
import { ORB_CONFIG, type OrbConfig } from '../intraday/config.js';
import { evaluateOrb } from '../intraday/evaluate.js';
import { markNet } from '../intraday/lifecycle.js';
import { minuteObservations, type ReplayStock } from '../intraday/replay.js';
import { PAPER_COSTS, type PaperCosts } from '../paper-journal.js';
import { decidePaperEntries } from './allocate.js';
import { intentFromSignal } from './intent.js';
import {
  appendLedger,
  type LedgerBalances,
  ledgerDrafts,
  openingBalances,
  reconstructLedger,
} from './ledger.js';
import { paperPerformance } from './performance.js';
import { advancePosition, ledgerForFills, newPaperPosition } from './position.js';
import { type EquitySnapshot, equitySnapshot } from './snapshot.js';
import { buildPortfolioState, type PendingClaim } from './state.js';

/**
 * One session through one paper portfolio, from stored candles: the same
 * evaluator, allocation rule, lifecycle and ledger the worker runs. Pure.
 * Fill tier is candle-based (pessimistic minute ordering; stop wins).
 */
export interface PortfolioReplayInput {
  sessionOpenMs: number;
  stocks: readonly ReplayStock[];
  indexMoveBps: number | null;
  capitalPaise: number;
  settings: PaperSettings;
  assignments: readonly PaperStrategyAssignment[];
  session: ExchangeSession;
  strategyVersionId?: number;
  portfolioId?: number;
  config?: OrbConfig;
  costs?: PaperCosts;
}
export interface PortfolioReplayResult {
  intents: TradeIntent[];
  decisions: PaperDecision[];
  positions: PaperPosition[];
  ledger: PaperLedgerEntry[];
  balances: LedgerBalances;
  snapshot: EquitySnapshot;
  performance: ReturnType<typeof paperPerformance>;
  ledgerMismatches: number;
}

export function replayPortfolio(input: PortfolioReplayInput): PortfolioReplayResult {
  const config = input.config ?? ORB_CONFIG;
  const costs = input.costs ?? PAPER_COSTS;
  const portfolioId = input.portfolioId ?? 1;
  const versionId = input.strategyVersionId ?? 1;
  const open = input.sessionOpenMs;
  // Symbol order, so intent ids — and therefore every downstream id — never depend on input order.
  const stocks = [...input.stocks].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const stockBy = new Map(stocks.map((s) => [s.symbol, s]));

  const ledger: PaperLedgerEntry[] = [];
  let balances = openingBalances();
  const append = (draft: Parameters<typeof appendLedger>[2]) => {
    const r = appendLedger(balances, ledger.length, draft);
    ledger.push(r.entry);
    balances = r.balances;
  };
  append(ledgerDrafts.opening(portfolioId, open, input.capitalPaise));

  const intents: TradeIntent[] = [];
  const decisions: PaperDecision[] = [];
  const positions = new Map<
    number,
    {
      position: PaperPosition;
      intent: TradeIntent;
      reserve: number;
      decidedShares: number;
      orderId: number;
    }
  >();
  const decided = new Set<string>();
  const signalled = new Set<string>();
  let nextId = 1;
  let fillSeq = 1;
  let peak = input.capitalPaise;
  let tradesToday = 0;
  let realisedToday = 0;

  const pendingClaims = (): PendingClaim[] =>
    [...positions.values()]
      .filter((p) => p.position.projection.fill === null && p.position.status !== 'CLOSED')
      .map((p) => ({
        instrumentId: p.intent.instrumentId,
        sector: p.intent.sector,
        notionalPaise: p.decidedShares * p.intent.entry.reference,
      }));
  const openRows = (lastPrice: (instrumentId: number) => number | null) =>
    [...positions.values()]
      .filter((p) => p.position.projection.fill !== null && p.position.status !== 'CLOSED')
      .map((p) => ({
        instrumentId: p.intent.instrumentId,
        sector: p.intent.sector,
        lockedPaise: p.position.lockedPaise,
        markNetPaise: markNet(
          p.intent.evidence,
          p.position.projection,
          lastPrice(p.intent.instrumentId),
          costs,
        ),
        netRealisedPaise: p.position.netRealisedPaise,
        position: p.position,
      }));
  const lastPriceAt = new Map<number, number>();

  const feed = (until: number) => {
    for (const entry of positions.values()) {
      if (entry.position.status === 'CLOSED') continue;
      const stock = stockBy.get(entry.intent.symbol);
      if (!stock) continue;
      for (const bar of stock.minutes) {
        if (
          bar.timestamp + 60_000 > until ||
          bar.timestamp + 1_000 <= entry.position.projection.cursor
        )
          continue;
        for (const obs of minuteObservations(bar, entry.intent.direction)) {
          if (entry.position.status === 'CLOSED') break;
          lastPriceAt.set(entry.intent.instrumentId, obs.price);
          const pending = entry.position.projection.fill === null;
          const result = advancePosition(
            entry.position,
            entry.intent,
            obs,
            pending
              ? {
                  equityPaise: input.capitalPaise,
                  availablePaise: balances.cashPaise + entry.reserve,
                  riskBps: 10_000, // caps were applied at decision time; maxShares is the ceiling
                  maxShares: entry.decidedShares,
                }
              : null,
            config,
            costs,
          );
          if (!result.changed) continue;
          if (pending) {
            // The reservation is released whatever happened; a fill then locks the actual cost.
            append(ledgerDrafts.release(portfolioId, entry.orderId, obs.at, entry.reserve));
            entry.reserve = 0;
          }
          const persisted = result.fills.map((f) => ({ ...f, id: fillSeq++ }));
          for (const draft of ledgerForFills(portfolioId, result.position, entry.intent, persisted))
            append(draft);
          entry.position = result.position;
          if (result.position.status === 'CLOSED')
            realisedToday += result.position.netRealisedPaise;
        }
        if (entry.position.status === 'CLOSED') break;
      }
    }
  };

  for (
    let close = open + (config.firstSignalCloseMinute - 555) * 60_000;
    istMinutesOfDay(new Date(close)) <= config.lastSignalCloseMinute;
    close += config.barMs
  ) {
    feed(close);
    const batch: TradeIntent[] = [];
    for (const stock of stocks) {
      const d = evaluateOrb({
        bars: stock.bars,
        asOf: close,
        tickSize: stock.tickSize,
        alreadySignalled: signalled.has(stock.symbol),
        session: { daily: stock.daily, indexMoveBps: input.indexMoveBps },
        config,
      });
      if (d.kind !== 'SIGNAL') continue;
      signalled.add(stock.symbol);
      const intent = intentFromSignal(
        {
          id: nextId++,
          strategyVersionId: versionId,
          instrumentId: hashInstrument(stock.symbol),
          symbol: stock.symbol,
          sector: stock.sector ?? null,
          evidence: d.evidence,
        },
        config,
      );
      intents.push(intent);
      batch.push(intent);
    }
    if (batch.length === 0) continue;
    const state = buildPortfolioState({
      balances,
      open: openRows((id) => lastPriceAt.get(id) ?? null),
      pending: pendingClaims(),
      realisedTodayPaise: realisedToday,
      startOfDayEquityPaise: input.capitalPaise,
      peakEquityPaise: peak,
      tradesToday,
      decidedKeys: decided,
    });
    peak = state.peakEquityPaise;
    const batchDecisions = decidePaperEntries({
      intents: batch,
      state,
      settings: input.settings,
      assignments: input.assignments,
      session: input.session,
      asOf: close,
      costs,
    });
    for (const decision of batchDecisions) {
      decisions.push(decision);
      const intent = batch.find((i) => i.id === decision.intentId);
      if (!intent) continue;
      decided.add(`${intent.strategyId}:${intent.instrumentId}:${intent.sessionDate}`);
      if (!decision.accepted || !decision.sizing) continue;
      const orderId = decision.intentId;
      append(ledgerDrafts.reserve(portfolioId, orderId, close, decision.sizing.reservePaise));
      positions.set(intent.id, {
        position: newPaperPosition(intent.id, intent, close),
        intent,
        reserve: decision.sizing.reservePaise,
        decidedShares: decision.shares,
        orderId,
      });
      tradesToday += 1;
    }
  }
  feed(open + 375 * 60_000);
  // Anything still pending after the session never filled: release it.
  for (const entry of positions.values())
    if (entry.reserve > 0) {
      append(ledgerDrafts.release(portfolioId, entry.orderId, open + 375 * 60_000, entry.reserve));
      entry.reserve = 0;
    }
  const rows = openRows((id) => lastPriceAt.get(id) ?? null);
  const snapshot = equitySnapshot(
    balances,
    rows.map((r) => ({ position: r.position, markNetPaise: r.markNetPaise })),
    peak,
  );
  const all = [...positions.values()].map((p) => p.position);
  return {
    intents,
    decisions,
    positions: all,
    ledger,
    balances,
    snapshot,
    performance: paperPerformance('portfolio', all),
    ledgerMismatches: reconstructLedger(ledger).mismatches.length,
  };
}

/** Stable synthetic instrument id for replay inputs that carry only a symbol. */
export function hashInstrument(symbol: string): number {
  let h = 7;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) % 1_000_003;
  return h;
}
