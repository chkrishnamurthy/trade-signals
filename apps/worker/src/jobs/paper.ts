import { decidePaperEntries, equitySnapshot, intentFromSignal, ORB_CONFIG } from '@equitywise/core';
import {
  applyPaperObservation,
  cancelPendingPaperEntry,
  getWorkerCheckpoint,
  hasUnresolvedRiskEvent,
  latestObservationId,
  listActivePaperPortfolios,
  listLivePaperTrades,
  listPaperObservationsSince,
  listSnapshotPortfolios,
  listUndecidedSignals,
  livePaperInstruments,
  loadPaperState,
  markPaperExitPending,
  openPaperPositionsMarked,
  paperEquityContext,
  paperLedgerBalances,
  paperLockedByPositions,
  paperMarks,
  paperReservedByPositions,
  reconcilePaperLedger,
  recordPaperDecisions,
  recordPaperRiskEvent,
  recordPaperSnapshot,
  resolvePaperPositionUnavailable,
  resolvePaperRiskEvents,
  setWorkerCheckpoint,
} from '@equitywise/db';
import { type ExchangeSession, istDateKey, type TradeIntent } from '@equitywise/shared';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { loadIndexConstituents } from '../universe.js';
import { isTradingSession, sessionToday } from './calendar-refresh.js';
import { loadIntradaySettings } from './intraday-orb.js';

/**
 * The per-user paper-trading jobs (docs/planning/paper-trading-plan.md §6, §9).
 *
 *   entries    — new intents × active portfolios → decisions, orders, reservations
 *   monitor    — stored observations since the checkpoint → fills, exits, ledger
 *   squareOff  — 15:15 onwards: cancel unfilled entries, flag EXIT_PENDING,
 *                and after the close resolve anything still open as unavailable
 *   snapshot   — equity, drawdown and exposure per portfolio
 *   reconcile  — ledger ⇔ positions ⇔ balances, nightly
 *
 * Every write is idempotent (unique keys in the repositories), so a job that
 * runs twice, or a worker restarted mid-cycle, changes nothing the second time.
 */
const HALT_RISK_KINDS = {
  DAILY_LOSS_LIMIT: 'DAILY_LOSS_HALT',
  DRAWDOWN_LIMIT: 'DRAWDOWN_HALT',
} as const;

export interface PaperJobs {
  entries(now?: number): Promise<{ portfolios: number; decided: number; accepted: number }>;
  monitor(now?: number): Promise<{ observations: number; moved: number }>;
  squareOff(now?: number): Promise<{ cancelled: number; pending: number; unresolved: number }>;
  snapshot(now?: number): Promise<number>;
  reconcile(now?: number): Promise<{ portfolios: number; mismatches: number }>;
}

export function createPaperJobs(context: WorkerContext, log: Logger): PaperJobs {
  const { db } = context;
  let sectors: Map<string, string> | null = null;
  const sectorOf = async (symbol: string) => {
    if (sectors === null) {
      const config = await loadIntradaySettings();
      sectors = new Map(
        (await loadIndexConstituents(config.universe)).map((c) => [c.symbol, c.sector]),
      );
    }
    return sectors.get(symbol) ?? null;
  };
  const checkpoint = (job: string, now: number, cursor: Record<string, unknown> = {}) =>
    setWorkerCheckpoint(db, job, { ...cursor, lastRunAt: now }, now);

  /** Sweeps unfilled entries of portfolios that switched off or paused since deciding. */
  const cancelForSettings = async (now: number) => {
    const active = new Map(
      (await listActivePaperPortfolios(db)).map((p) => [p.portfolio.id, p.settings]),
    );
    let cancelled = 0;
    for (const trade of await listLivePaperTrades(db)) {
      if (trade.filled) continue;
      const settings = active.get(trade.portfolioId);
      const reason =
        settings === undefined
          ? ('PAPER_TRADING_DISABLED' as const)
          : settings.entriesPaused
            ? ('ENTRIES_PAUSED' as const)
            : now > trade.validUntil + ORB_CONFIG.coverageGapMs
              ? ('SIGNAL_EXPIRED' as const)
              : null;
      if (reason === null) continue;
      const text = {
        PAPER_TRADING_DISABLED: 'Paper trading was switched off before the entry filled.',
        ENTRIES_PAUSED: 'New entries were paused before the entry filled.',
        SIGNAL_EXPIRED: 'No observed price arrived inside the entry window.',
      }[reason];
      if (await cancelPendingPaperEntry(db, trade.portfolioId, trade.positionId, reason, text, now))
        cancelled += 1;
    }
    return cancelled;
  };

  const entries: PaperJobs['entries'] = async (now = Date.now()) => {
    const session = await sessionToday(context, now);
    const result = { portfolios: 0, decided: 0, accepted: 0 };
    await cancelForSettings(now);
    if (!isTradingSession(session)) {
      await checkpoint('paper-entries', now, { skipped: session.kind });
      return result;
    }
    const tradingDate = istDateKey(new Date(now));
    for (const view of await listActivePaperPortfolios(db)) {
      result.portfolios += 1;
      const signals = await listUndecidedSignals(db, view.portfolio.id, tradingDate);
      if (signals.length === 0) continue;
      const intents: TradeIntent[] = [];
      for (const s of signals)
        intents.push(intentFromSignal({ ...s, sector: await sectorOf(s.symbol) }));
      const marks = await paperMarks(
        db,
        intents.map((i) => i.instrumentId),
      );
      const { peakEquityPaise, startOfDayEquityPaise } = await paperEquityContext(
        db,
        view.portfolio.id,
        tradingDate,
      );
      const state = await loadPaperState(
        db,
        view.portfolio.id,
        tradingDate,
        (instrumentId) => marks.get(instrumentId)?.price ?? null,
        peakEquityPaise,
        startOfDayEquityPaise,
      );
      const decisions = decidePaperEntries({
        intents,
        state,
        settings: view.settings,
        assignments: view.assignments,
        session,
        asOf: now,
      });
      const written = await recordPaperDecisions(db, view.portfolio.id, {
        intents,
        decisions,
        decidedAt: now,
        settingsVersion: view.settings.settingsVersion,
        squareOffAt: session.squareOffAt,
      });
      result.decided += written.orders;
      result.accepted += written.positions;
      // A halt that rejected something is a risk event until the day (or the user) resets it.
      for (const halt of ['DAILY_LOSS_LIMIT', 'DRAWDOWN_LIMIT'] as const) {
        if (!decisions.some((d) => d.reasonCode === halt)) continue;
        const kind = HALT_RISK_KINDS[halt];
        if (await hasUnresolvedRiskEvent(db, view.portfolio.id, kind)) continue;
        await recordPaperRiskEvent(db, {
          portfolioId: view.portfolio.id,
          at: now,
          kind,
          detail: {
            tradingDate,
            dayNetPaise: state.dayNetPaise,
            equityPaise: state.equityPaise,
            peakEquityPaise: state.peakEquityPaise,
          },
        });
        log.warn('risk halt', { portfolioId: view.portfolio.id, kind });
      }
      if (written.orders > 0)
        log.info('decisions', {
          portfolioId: view.portfolio.id,
          orders: written.orders,
          accepted: written.positions,
          reasons: decisions.map((d) => d.reasonCode ?? 'ACCEPTED'),
        });
    }
    await checkpoint('paper-entries', now, { tradingDate });
    return result;
  };

  const monitor: PaperJobs['monitor'] = async (now = Date.now()) => {
    const stored = await getWorkerCheckpoint(db, 'paper-monitor');
    let cursor = Number(stored?.lastObservationId ?? 0);
    // First run ever: nothing is live, so start from the newest row rather than
    // replaying the whole history of samples.
    if (stored === null) cursor = await latestObservationId(db);
    const live = await livePaperInstruments(db);
    let observations = 0;
    let moved = 0;
    if (live.size > 0) {
      const batch = await listPaperObservationsSince(db, cursor);
      for (const o of batch) {
        observations += 1;
        cursor = o.id;
        const portfolios = live.get(o.instrumentId);
        if (!portfolios) continue;
        for (const portfolioId of portfolios)
          moved += await applyPaperObservation(
            db,
            portfolioId,
            o.instrumentId,
            { at: o.at, receivedAt: o.receivedAt, price: o.price, continuous: o.continuous },
            { observationId: o.id },
          );
      }
    } else cursor = Math.max(cursor, await latestObservationId(db));
    await checkpoint('paper-monitor', now, { lastObservationId: cursor });
    if (moved > 0) log.info('positions advanced', { observations, moved });
    return { observations, moved };
  };

  const squareOff: PaperJobs['squareOff'] = async (now = Date.now()) => {
    const result = { cancelled: 0, pending: 0, unresolved: 0 };
    const session = await sessionToday(context, now);
    for (const trade of await listLivePaperTrades(db)) {
      const squareOffAt = trade.squareOffAt ?? session.squareOffAt;
      const closeAt = sessionCloseFor(trade, session);
      if (squareOffAt === null || now < squareOffAt) continue;
      if (!trade.filled) {
        if (
          await cancelPendingPaperEntry(
            db,
            trade.portfolioId,
            trade.positionId,
            'EOD_SQUARE_OFF',
            'The square-off time passed before the entry filled; no simulated entry recorded.',
            now,
          )
        )
          result.cancelled += 1;
        continue;
      }
      if (closeAt !== null && now > closeAt + 15_000) {
        // Past 15:30:15 with a live trade: alert once, then resolve as unavailable — never overnight.
        if (!(await hasUnresolvedRiskEvent(db, trade.portfolioId, 'OPEN_AFTER_CUTOFF'))) {
          await recordPaperRiskEvent(db, {
            portfolioId: trade.portfolioId,
            at: now,
            kind: 'OPEN_AFTER_CUTOFF',
            detail: { positionId: trade.positionId, tradingDate: trade.tradingDate },
          });
          log.error('paper trade open after the close', {
            portfolioId: trade.portfolioId,
            positionId: trade.positionId,
          });
        }
        if (await resolvePaperPositionUnavailable(db, trade.portfolioId, trade.positionId, now)) {
          result.unresolved += 1;
          await resolvePaperRiskEvents(db, trade.portfolioId, 'OPEN_AFTER_CUTOFF', now);
        }
        continue;
      }
      await markPaperExitPending(db, trade.positionId);
      result.pending += 1;
    }
    await checkpoint('paper-squareoff', now, result);
    return result;
  };

  const snapshot: PaperJobs['snapshot'] = async (now = Date.now()) => {
    const tradingDate = istDateKey(new Date(now));
    let written = 0;
    for (const portfolioId of await listSnapshotPortfolios(db)) {
      const { balances } = await paperLedgerBalances(db, portfolioId);
      const open = await openPaperPositionsMarked(db, portfolioId);
      const { peakEquityPaise } = await paperEquityContext(db, portfolioId, tradingDate);
      const snap = equitySnapshot(balances, open, peakEquityPaise);
      await recordPaperSnapshot(db, portfolioId, tradingDate, now, snap);
      written += 1;
    }
    await checkpoint('paper-snapshot', now, { written });
    return written;
  };

  const reconcile: PaperJobs['reconcile'] = async (now = Date.now()) => {
    let portfolios = 0;
    let mismatches = 0;
    const tradingDate = istDateKey(new Date(now));
    for (const portfolioId of await listSnapshotPortfolios(db)) {
      portfolios += 1;
      const ledger = await reconcilePaperLedger(db, portfolioId);
      const { balances } = await paperLedgerBalances(db, portfolioId);
      const locked = await paperLockedByPositions(db, portfolioId);
      const reserved = await paperReservedByPositions(db, portfolioId);
      const problems: Record<string, unknown> = {};
      if (ledger.mismatches.length > 0) problems.ledger = ledger.mismatches.slice(0, 5);
      if (locked !== balances.lockedPaise)
        problems.locked = { positions: locked, ledger: balances.lockedPaise };
      if (reserved !== balances.reservedPaise)
        problems.reserved = { positions: reserved, ledger: balances.reservedPaise };
      if (Object.keys(problems).length === 0) {
        await resolvePaperRiskEvents(db, portfolioId, 'RECONCILE_MISMATCH', now);
        continue;
      }
      mismatches += 1;
      if (!(await hasUnresolvedRiskEvent(db, portfolioId, 'RECONCILE_MISMATCH')))
        await recordPaperRiskEvent(db, {
          portfolioId,
          at: now,
          kind: 'RECONCILE_MISMATCH',
          detail: { tradingDate, ...problems },
        });
      log.error('paper ledger does not reconcile', { portfolioId, ...problems });
    }
    // Daily-loss halts end with the day; drawdown halts wait for the user.
    for (const portfolioId of await listSnapshotPortfolios(db))
      await resolvePaperRiskEvents(db, portfolioId, 'DAILY_LOSS_HALT', now);
    await checkpoint('paper-reconcile', now, { portfolios, mismatches });
    return { portfolios, mismatches };
  };

  return { entries, monitor, squareOff, snapshot, reconcile };
}

/** The close for a trade's own session date; today's session when they match. */
function sessionCloseFor(
  trade: { tradingDate: string; squareOffAt: number | null },
  session: ExchangeSession,
): number | null {
  if (trade.tradingDate === session.tradingDate) return session.closeAt;
  // A trade from an earlier session (worker down over the close): treat its
  // square-off plus fifteen minutes as the close it missed.
  return trade.squareOffAt === null ? null : trade.squareOffAt + 15 * 60_000;
}
