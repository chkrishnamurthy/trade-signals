import {
  type EquitySnapshot,
  estimatedFill,
  ledgerDrafts,
  markNet,
  PAPER_COSTS,
  paperCharges,
} from '@equitywise/core';
import {
  type IntradayEvidence,
  intradayEvidenceSchema,
  type PaperPosition,
  type PaperReasonCode,
  type TradeIntent,
} from '@equitywise/shared';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, ne, notExists, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { intradaySignals } from '../schema/intraday.js';
import {
  paperEquitySnapshots,
  paperFills,
  paperLedgerEntries,
  paperOrders,
  paperPortfolios,
  paperPositionEvents,
  paperPositions,
  paperRiskEvents,
  paperSettings,
  workerCheckpoints,
} from '../schema/paper.js';
import { signalObservations, signalQuotes } from '../schema/vwap-signals.js';
import {
  appendPaperLedger,
  getPaperPortfolio,
  type PaperPortfolioView,
  paperLedgerBalances,
} from './paper.js';

/**
 * The worker's and the page's reads and the few worker-only writes that the
 * ledger/position path in `paper.ts` does not cover: which portfolios are
 * live, which intents they have not decided, cancellations, the unresolved
 * close, snapshots and the operator's health view. Same rules as `paper.ts`:
 * user-facing reads take `userId`; worker writes take the portfolio lock.
 */
const LOCK = 804;

// ---------------------------------------------------------------------------
// Worker reads

/** Every portfolio with paper trading switched on, with settings and assignments. */
export async function listActivePaperPortfolios(db: Database): Promise<PaperPortfolioView[]> {
  const rows = await db
    .select({ userId: paperPortfolios.userId })
    .from(paperPortfolios)
    .innerJoin(paperSettings, eq(paperSettings.portfolioId, paperPortfolios.id))
    .where(eq(paperSettings.enabled, true))
    .orderBy(asc(paperPortfolios.id));
  const views: PaperPortfolioView[] = [];
  for (const r of rows) {
    const view = await getPaperPortfolio(db, r.userId);
    if (view) views.push(view);
  }
  return views;
}

/** Published signals of the session this portfolio has not decided yet. */
export async function listUndecidedSignals(db: Database, portfolioId: number, tradingDate: string) {
  const rows = await db
    .select({
      id: intradaySignals.id,
      instrumentId: intradaySignals.instrumentId,
      strategyVersionId: intradaySignals.strategyVersionId,
      symbol: intradaySignals.symbol,
      publishedAt: intradaySignals.publishedAt,
      evidence: intradaySignals.evidence,
    })
    .from(intradaySignals)
    .where(
      and(
        eq(intradaySignals.tradingDate, tradingDate),
        notExists(
          db
            .select({ one: sql`1` })
            .from(paperOrders)
            .where(
              and(
                eq(paperOrders.portfolioId, portfolioId),
                eq(paperOrders.intentId, intradaySignals.id),
                eq(paperOrders.side, 'ENTRY'),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(intradaySignals.id));
  return rows.map((r) => ({
    ...r,
    publishedAt: r.publishedAt.getTime(),
    evidence: intradayEvidenceSchema.parse(r.evidence) as IntradayEvidence,
  }));
}

/**
 * Peak equity and start-of-day equity for the halts, from the snapshot
 * series; before the first snapshot both are the ledger's book value.
 */
export async function paperEquityContext(db: Database, portfolioId: number, tradingDate: string) {
  const { balances } = await paperLedgerBalances(db, portfolioId);
  const book = balances.cashPaise + balances.reservedPaise + balances.lockedPaise;
  const [latest] = await db
    .select()
    .from(paperEquitySnapshots)
    .where(eq(paperEquitySnapshots.portfolioId, portfolioId))
    .orderBy(desc(paperEquitySnapshots.at))
    .limit(1);
  const [previousDay] = await db
    .select()
    .from(paperEquitySnapshots)
    .where(
      and(
        eq(paperEquitySnapshots.portfolioId, portfolioId),
        sql`${paperEquitySnapshots.tradingDate} < ${tradingDate}`,
      ),
    )
    .orderBy(desc(paperEquitySnapshots.at))
    .limit(1);
  return {
    peakEquityPaise: Math.max(latest?.peakEquityPaise ?? 0, book),
    startOfDayEquityPaise: previousDay?.equityPaise ?? book,
  };
}

/** Instruments with a live paper trade anywhere, and the portfolios holding them. */
export async function livePaperInstruments(db: Database): Promise<Map<number, number[]>> {
  const rows = await db
    .selectDistinct({
      instrumentId: paperPositions.instrumentId,
      portfolioId: paperPositions.portfolioId,
    })
    .from(paperPositions)
    .where(ne(paperPositions.status, 'CLOSED'));
  const map = new Map<number, number[]>();
  for (const r of rows)
    map.set(r.instrumentId, [...(map.get(r.instrumentId) ?? []), r.portfolioId]);
  return map;
}

export interface StoredObservation {
  id: number;
  instrumentId: number;
  at: number;
  receivedAt: number;
  price: number;
  continuous: boolean;
}
/** Sampled prices after `afterId`, in insertion order — the monitor's queue. */
export async function listPaperObservationsSince(
  db: Database,
  afterId: number,
  limit = 2_000,
): Promise<StoredObservation[]> {
  const rows = await db
    .select()
    .from(signalObservations)
    .where(gt(signalObservations.id, afterId))
    .orderBy(asc(signalObservations.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    instrumentId: r.instrumentId,
    at: r.observedAt.getTime(),
    receivedAt: r.receivedAt.getTime(),
    price: r.price,
    continuous: r.continuous,
  }));
}
export async function latestObservationId(db: Database): Promise<number> {
  const [row] = await db
    .select({ id: sql<number | null>`max(${signalObservations.id})` })
    .from(signalObservations);
  return Number(row?.id ?? 0);
}

/** Last sampled price per instrument, for marks. */
export async function paperMarks(
  db: Database,
  instrumentIds: readonly number[],
): Promise<Map<number, { price: number; at: number }>> {
  if (instrumentIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(signalQuotes)
    .where(inArray(signalQuotes.instrumentId, [...instrumentIds]));
  return new Map(rows.map((r) => [r.instrumentId, { price: r.price, at: r.observedAt.getTime() }]));
}

export interface LivePaperRow {
  positionId: number;
  portfolioId: number;
  instrumentId: number;
  status: string;
  filled: boolean;
  tradingDate: string;
  squareOffAt: number | null;
  validUntil: number;
  remainingShares: number;
}
/** Every not-closed paper trade across portfolios (the square-off and sweeps). */
export async function listLivePaperTrades(db: Database): Promise<LivePaperRow[]> {
  const rows = await db
    .select({ position: paperPositions, order: paperOrders })
    .from(paperPositions)
    .innerJoin(paperOrders, eq(paperOrders.id, paperPositions.orderId))
    .where(ne(paperPositions.status, 'CLOSED'))
    .orderBy(asc(paperPositions.id));
  return rows.map(({ position, order }) => ({
    positionId: position.id,
    portfolioId: position.portfolioId,
    instrumentId: position.instrumentId,
    status: position.status,
    filled: position.projection.fill !== null,
    tradingDate: position.tradingDate,
    squareOffAt: position.squareOffAt?.getTime() ?? null,
    validUntil: order.intent.validUntil,
    remainingShares: position.projection.remainingShares,
  }));
}

// ---------------------------------------------------------------------------
// Worker writes

/**
 * Cancels an accepted-but-unfilled entry: the order moves to CANCELLED (or
 * EXPIRED), the reservation is released, the position closes with the reason.
 * A no-op when the trade filled meanwhile — the monitor won that race.
 */
export async function cancelPendingPaperEntry(
  db: Database,
  portfolioId: number,
  positionId: number,
  reason: PaperReasonCode,
  explanation: string,
  now: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK}, ${portfolioId})`);
    const [row] = await tx
      .select({ position: paperPositions, order: paperOrders, portfolio: paperPortfolios })
      .from(paperPositions)
      .innerJoin(paperOrders, eq(paperOrders.id, paperPositions.orderId))
      .innerJoin(paperPortfolios, eq(paperPortfolios.id, paperPositions.portfolioId))
      .where(and(eq(paperPositions.id, positionId), eq(paperPositions.portfolioId, portfolioId)))
      .for('update');
    if (!row || row.position.status === 'CLOSED' || row.position.projection.fill !== null)
      return false;
    await appendPaperLedger(
      tx,
      portfolioId,
      row.portfolio.resetGeneration,
      ledgerDrafts.release(portfolioId, row.order.id, now, row.position.reservePaise),
    );
    await tx
      .update(paperOrders)
      .set({ status: reason === 'SIGNAL_EXPIRED' ? 'EXPIRED' : 'CANCELLED' })
      .where(and(eq(paperOrders.id, row.order.id), eq(paperOrders.status, 'ACCEPTED')));
    const sequence = row.position.sequence + 1;
    await tx.insert(paperPositionEvents).values({
      positionId,
      sequence,
      kind: 'UNRESOLVED',
      at: new Date(now),
      recordedAt: new Date(now),
      pricePaise: null,
      shares: null,
      explanation,
      observationId: null,
    });
    await tx
      .update(paperPositions)
      .set({
        status: 'CLOSED',
        closedAt: new Date(now),
        exitReason: reason,
        sequence,
        projection: {
          ...row.position.projection,
          cursor: Math.max(row.position.projection.cursor, now),
          status: 'SKIPPED',
          taken: false,
          endedAt: now,
          reason: explanation,
        },
      })
      .where(eq(paperPositions.id, positionId));
    return true;
  });
}

/** OPEN → EXIT_PENDING once the square-off instant has passed; idempotent. */
export async function markPaperExitPending(db: Database, positionId: number): Promise<void> {
  await db
    .update(paperPositions)
    .set({ status: 'EXIT_PENDING' })
    .where(and(eq(paperPositions.id, positionId), eq(paperPositions.status, 'OPEN')));
}

/**
 * The unresolved close: no covered observation squared the trade off before
 * the session ended. The remainder exits at the last sampled price (or, with
 * no sample at all, at the entry price for a zero gross) with
 * `resolution = UNAVAILABLE`, so the ledger balances and the trade is
 * excluded from every performance rate. Never carried overnight.
 */
export async function resolvePaperPositionUnavailable(
  db: Database,
  portfolioId: number,
  positionId: number,
  now: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK}, ${portfolioId})`);
    const [row] = await tx
      .select({ position: paperPositions, order: paperOrders, portfolio: paperPortfolios })
      .from(paperPositions)
      .innerJoin(paperOrders, eq(paperOrders.id, paperPositions.orderId))
      .innerJoin(paperPortfolios, eq(paperPortfolios.id, paperPositions.portfolioId))
      .where(and(eq(paperPositions.id, positionId), eq(paperPositions.portfolioId, portfolioId)))
      .for('update');
    if (!row || row.position.status === 'CLOSED') return false;
    const p = row.position.projection;
    if (p.fill === null)
      return cancelPendingPaperEntry(
        tx,
        portfolioId,
        positionId,
        'EOD_SQUARE_OFF',
        'Session ended without an observed next price; no simulated entry recorded.',
        now,
      );
    const intent: TradeIntent = row.order.intent;
    const [quote] = await tx
      .select()
      .from(signalQuotes)
      .where(eq(signalQuotes.instrumentId, row.position.instrumentId));
    const shares = p.remainingShares;
    const sign = intent.direction === 'BUY' ? 1 : -1;
    const exit =
      quote && quote.price > 0
        ? estimatedFill(quote.price, intent.tickSize, intent.direction, false, PAPER_COSTS)
        : p.fill;
    const charges =
      shares > 0
        ? paperCharges(
            intent.direction === 'BUY' ? p.fill : exit,
            intent.direction === 'BUY' ? exit : p.fill,
            shares,
            PAPER_COSTS,
          )
        : 0;
    const gross = sign * (exit - p.fill) * shares;
    let sequence = row.position.sequence;
    let fillId: number | null = null;
    if (shares > 0) {
      const [fill] = await tx
        .insert(paperFills)
        .values({
          orderId: row.order.id,
          portfolioId,
          positionId,
          leg: 2,
          at: new Date(now),
          receivedAt: new Date(now),
          pricePaise: exit,
          shares,
          chargesPaise: charges,
          resolution: 'UNAVAILABLE',
          observationId: null,
        })
        .onConflictDoNothing()
        .returning({ id: paperFills.id });
      if (!fill) return false;
      fillId = fill.id;
      const cost = p.fill * shares;
      await appendPaperLedger(
        tx,
        portfolioId,
        row.portfolio.resetGeneration,
        ledgerDrafts.exit(portfolioId, fill.id, now, cost + gross, cost),
      );
      if (charges > 0)
        await appendPaperLedger(
          tx,
          portfolioId,
          row.portfolio.resetGeneration,
          ledgerDrafts.charges(portfolioId, fill.id, now, charges),
        );
    }
    const explanation =
      'Session ended without a covered square-off observation; closed at the last sampled price and marked unavailable.';
    sequence += 1;
    await tx.insert(paperPositionEvents).values({
      positionId,
      sequence,
      kind: 'UNRESOLVED',
      at: new Date(now),
      recordedAt: new Date(now),
      pricePaise: shares > 0 ? exit : null,
      shares: shares > 0 ? shares : null,
      explanation,
      observationId: null,
    });
    await tx
      .update(paperPositions)
      .set({
        status: 'CLOSED',
        closedAt: new Date(now),
        exitReason: 'COVERAGE_UNAVAILABLE',
        sequence,
        lockedPaise: 0,
        grossRealisedPaise: row.position.grossRealisedPaise + gross,
        chargesPaise: row.position.chargesPaise + charges,
        netRealisedPaise: row.position.netRealisedPaise + gross - charges,
        projection: {
          ...p,
          cursor: Math.max(p.cursor, now),
          status: 'CLOSED_EOD',
          remainingShares: 0,
          exits:
            shares > 0 ? [...p.exits, { at: now, price: exit, shares, reason: 'EOD' }] : p.exits,
          endedAt: now,
          resolution: 'UNAVAILABLE',
          reason: explanation,
        },
      })
      .where(eq(paperPositions.id, positionId));
    void fillId;
    return true;
  });
}

export async function recordPaperSnapshot(
  db: Database,
  portfolioId: number,
  tradingDate: string,
  at: number,
  snapshot: EquitySnapshot,
): Promise<void> {
  await db
    .insert(paperEquitySnapshots)
    .values({
      portfolioId,
      tradingDate,
      at: new Date(at),
      cashPaise: snapshot.cashPaise,
      reservedPaise: snapshot.reservedPaise,
      lockedPaise: snapshot.lockedPaise,
      unrealisedPaise: snapshot.unrealisedPaise,
      equityPaise: snapshot.equityPaise,
      peakEquityPaise: snapshot.peakEquityPaise,
      drawdownPaise: snapshot.drawdownPaise,
      exposurePaise: snapshot.exposurePaise,
      marksComplete: snapshot.marksComplete,
    })
    .onConflictDoNothing();
}

/** Portfolios that need a snapshot: switched on, or still holding a live trade. */
export async function listSnapshotPortfolios(db: Database): Promise<number[]> {
  const enabled = await db
    .select({ id: paperPortfolios.id })
    .from(paperPortfolios)
    .innerJoin(paperSettings, eq(paperSettings.portfolioId, paperPortfolios.id))
    .where(eq(paperSettings.enabled, true));
  const live = await db
    .selectDistinct({ id: paperPositions.portfolioId })
    .from(paperPositions)
    .where(ne(paperPositions.status, 'CLOSED'));
  return [...new Set([...enabled, ...live].map((r) => r.id))].sort((a, b) => a - b);
}

/** Open trades of one portfolio with their marks — the snapshot's input. */
export async function openPaperPositionsMarked(
  db: Database,
  portfolioId: number,
): Promise<{ position: PaperPosition; markNetPaise: number | null; lastPrice: number | null }[]> {
  const rows = await db
    .select({ position: paperPositions, order: paperOrders })
    .from(paperPositions)
    .innerJoin(paperOrders, eq(paperOrders.id, paperPositions.orderId))
    .where(and(eq(paperPositions.portfolioId, portfolioId), ne(paperPositions.status, 'CLOSED')));
  const marks = await paperMarks(
    db,
    rows.map((r) => r.position.instrumentId),
  );
  return rows.map(({ position, order }) => {
    const mark = marks.get(position.instrumentId);
    const view = positionFromRow(position);
    return {
      position: view,
      markNetPaise: markNet(order.intent.evidence, position.projection, mark?.price ?? null),
      lastPrice: mark?.price ?? null,
    };
  });
}

export function positionFromRow(row: typeof paperPositions.$inferSelect): PaperPosition {
  return {
    id: row.id,
    intentId: row.intentId,
    strategyId: row.strategyId,
    strategyVersionId: row.strategyVersionId,
    instrumentId: row.instrumentId,
    symbol: row.symbol,
    sector: row.sector,
    direction: row.direction as PaperPosition['direction'],
    status: row.status as PaperPosition['status'],
    projection: row.projection,
    lockedPaise: row.lockedPaise,
    grossRealisedPaise: row.grossRealisedPaise,
    chargesPaise: row.chargesPaise,
    netRealisedPaise: row.netRealisedPaise,
    initialRiskPaise: row.initialRiskPaise,
    exitReason: row.exitReason as PaperPosition['exitReason'],
    openedAt: row.openedAt?.getTime() ?? null,
    closedAt: row.closedAt?.getTime() ?? null,
  };
}

export async function unresolvedRiskEvents(db: Database, kinds?: readonly string[]) {
  const where = [isNull(paperRiskEvents.resolvedAt)];
  if (kinds && kinds.length > 0) where.push(inArray(paperRiskEvents.kind, [...kinds]));
  return db
    .select()
    .from(paperRiskEvents)
    .where(and(...where))
    .orderBy(desc(paperRiskEvents.at));
}
export async function resolvePaperRiskEvents(
  db: Database,
  portfolioId: number,
  kind: string,
  now: number,
): Promise<void> {
  await db
    .update(paperRiskEvents)
    .set({ resolvedAt: new Date(now) })
    .where(
      and(
        eq(paperRiskEvents.portfolioId, portfolioId),
        eq(paperRiskEvents.kind, kind),
        isNull(paperRiskEvents.resolvedAt),
      ),
    );
}
export async function hasUnresolvedRiskEvent(
  db: Database,
  portfolioId: number,
  kind: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: paperRiskEvents.id })
    .from(paperRiskEvents)
    .where(
      and(
        eq(paperRiskEvents.portfolioId, portfolioId),
        eq(paperRiskEvents.kind, kind),
        isNull(paperRiskEvents.resolvedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

// ---------------------------------------------------------------------------
// Page reads (user-scoped)

export interface PaperDecisionRow {
  orderId: number;
  intentId: number;
  strategyId: string;
  strategyVersionId: number;
  instrumentId: number;
  symbol: string;
  direction: 'BUY' | 'SELL';
  status: string;
  reasonCode: string | null;
  reasonText: string;
  requestedShares: number;
  decidedAt: number;
  signalAt: number;
  decision: typeof paperOrders.$inferSelect.decision;
  levels: { reference: number; stop: number; target1: number; target2: number };
}
/** The decisions taken for a session, oldest first. */
export async function listPaperDecisions(
  db: Database,
  userId: number,
  tradingDate: string,
): Promise<PaperDecisionRow[]> {
  const view = await getPaperPortfolio(db, userId);
  if (!view) return [];
  const rows = await db
    .select()
    .from(paperOrders)
    .where(
      and(
        eq(paperOrders.portfolioId, view.portfolio.id),
        eq(paperOrders.side, 'ENTRY'),
        sql`${paperOrders.intent}->>'sessionDate' = ${tradingDate}`,
      ),
    )
    .orderBy(asc(paperOrders.decidedAt), asc(paperOrders.id));
  return rows.map((r) => ({
    orderId: r.id,
    intentId: r.intentId,
    strategyId: r.strategyId,
    strategyVersionId: r.strategyVersionId,
    instrumentId: r.instrumentId,
    symbol: r.intent.symbol,
    direction: r.intent.direction,
    status: r.status,
    reasonCode: r.reasonCode,
    reasonText: r.reasonText,
    requestedShares: r.requestedShares,
    decidedAt: r.decidedAt.getTime(),
    signalAt: r.intent.signalAt,
    decision: r.decision,
    levels: {
      reference: r.intent.entry.reference,
      stop: r.intent.stop,
      target1: r.intent.target1,
      target2: r.intent.target2,
    },
  }));
}

export interface PaperTradeFilter {
  from?: string;
  to?: string;
  symbol?: string;
  strategyId?: string;
  strategyVersionId?: number;
  outcome?: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'UNRESOLVED';
  exitReason?: string;
}
/** Closed paper trades, newest first, paged. `total` is the filtered count. */
export async function listClosedPaperTrades(
  db: Database,
  userId: number,
  filter: PaperTradeFilter,
  page: { page: number; pageSize: number },
): Promise<{ trades: PaperPosition[]; total: number }> {
  const view = await getPaperPortfolio(db, userId);
  if (!view) return { trades: [], total: 0 };
  const where = [
    eq(paperPositions.portfolioId, view.portfolio.id),
    eq(paperPositions.status, 'CLOSED'),
  ];
  if (filter.from) where.push(gte(paperPositions.tradingDate, filter.from));
  if (filter.to) where.push(lte(paperPositions.tradingDate, filter.to));
  if (filter.symbol) where.push(eq(paperPositions.symbol, filter.symbol.toUpperCase()));
  if (filter.strategyId) where.push(eq(paperPositions.strategyId, filter.strategyId));
  if (filter.strategyVersionId !== undefined)
    where.push(eq(paperPositions.strategyVersionId, filter.strategyVersionId));
  if (filter.exitReason) where.push(eq(paperPositions.exitReason, filter.exitReason));
  if (filter.outcome === 'UNRESOLVED')
    where.push(sql`${paperPositions.projection}->>'resolution' = 'UNAVAILABLE'`);
  else if (filter.outcome) {
    where.push(sql`${paperPositions.projection}->>'resolution' = 'OBSERVED'`);
    where.push(sql`${paperPositions.openedAt} is not null`);
    if (filter.outcome === 'WIN') where.push(gt(paperPositions.netRealisedPaise, 0));
    else if (filter.outcome === 'LOSS') where.push(sql`${paperPositions.netRealisedPaise} < 0`);
    else where.push(eq(paperPositions.netRealisedPaise, 0));
  }
  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(paperPositions)
    .where(and(...where));
  const rows = await db
    .select()
    .from(paperPositions)
    .where(and(...where))
    .orderBy(desc(paperPositions.closedAt), desc(paperPositions.id))
    .limit(page.pageSize)
    .offset((page.page - 1) * page.pageSize);
  return { trades: rows.map(positionFromRow), total: count?.total ?? 0 };
}

/** Every closed trade in a date range (performance grouping happens in core). */
export async function listPaperTradesForPerformance(
  db: Database,
  userId: number,
  from: string | null,
): Promise<PaperPosition[]> {
  const view = await getPaperPortfolio(db, userId);
  if (!view) return [];
  const where = [
    eq(paperPositions.portfolioId, view.portfolio.id),
    eq(paperPositions.status, 'CLOSED'),
  ];
  if (from) where.push(gte(paperPositions.tradingDate, from));
  const rows = await db
    .select()
    .from(paperPositions)
    .where(and(...where))
    .orderBy(asc(paperPositions.closedAt));
  return rows.map(positionFromRow);
}

export async function listPaperSnapshots(
  db: Database,
  userId: number,
  from: string | null,
): Promise<
  {
    at: number;
    tradingDate: string;
    equityPaise: number | null;
    peakEquityPaise: number;
    drawdownPaise: number | null;
    cashPaise: number;
    exposurePaise: number;
    marksComplete: boolean;
  }[]
> {
  const view = await getPaperPortfolio(db, userId);
  if (!view) return [];
  const where = [eq(paperEquitySnapshots.portfolioId, view.portfolio.id)];
  if (from) where.push(gte(paperEquitySnapshots.tradingDate, from));
  const rows = await db
    .select()
    .from(paperEquitySnapshots)
    .where(and(...where))
    .orderBy(asc(paperEquitySnapshots.at));
  return rows.map((r) => ({
    at: r.at.getTime(),
    tradingDate: r.tradingDate,
    equityPaise: r.equityPaise,
    peakEquityPaise: r.peakEquityPaise,
    drawdownPaise: r.drawdownPaise,
    cashPaise: r.cashPaise,
    exposurePaise: r.exposurePaise,
    marksComplete: r.marksComplete,
  }));
}

/** Net realised per trading date from closed trades — the daily P&L strip. */
export async function paperDailyNet(
  db: Database,
  userId: number,
  from: string | null,
): Promise<{ tradingDate: string; netPaise: number; trades: number }[]> {
  const view = await getPaperPortfolio(db, userId);
  if (!view) return [];
  const where = [
    eq(paperPositions.portfolioId, view.portfolio.id),
    eq(paperPositions.status, 'CLOSED'),
  ];
  if (from) where.push(gte(paperPositions.tradingDate, from));
  const rows = await db
    .select({
      tradingDate: paperPositions.tradingDate,
      netPaise: sql<number>`coalesce(sum(${paperPositions.netRealisedPaise}),0)::bigint`,
      trades: sql<number>`count(*)::int`,
    })
    .from(paperPositions)
    .where(and(...where))
    .groupBy(paperPositions.tradingDate)
    .orderBy(asc(paperPositions.tradingDate));
  return rows.map((r) => ({
    tradingDate: r.tradingDate,
    netPaise: Number(r.netPaise),
    trades: r.trades,
  }));
}

export async function listUserRiskEvents(db: Database, userId: number, limit = 20) {
  const view = await getPaperPortfolio(db, userId);
  if (!view) return [];
  const rows = await db
    .select()
    .from(paperRiskEvents)
    .where(eq(paperRiskEvents.portfolioId, view.portfolio.id))
    .orderBy(desc(paperRiskEvents.at))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    at: r.at.getTime(),
    kind: r.kind,
    detail: r.detail,
    resolvedAt: r.resolvedAt?.getTime() ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Operator health

export interface PaperHealth {
  portfolios: { total: number; enabled: number; withLiveTrades: number };
  openAfterCutoff: number;
  unresolvedRiskEvents: { kind: string; count: number }[];
  lastCycles: Record<string, { at: number; cursor: Record<string, unknown> } | null>;
  ledgerMismatches: number;
}
export async function paperHealth(db: Database, closeAt: number | null): Promise<PaperHealth> {
  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(paperPortfolios);
  const [enabled] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(paperSettings)
    .where(eq(paperSettings.enabled, true));
  const [live] = await db
    .select({ n: sql<number>`count(distinct ${paperPositions.portfolioId})::int` })
    .from(paperPositions)
    .where(ne(paperPositions.status, 'CLOSED'));
  const trades = await listLivePaperTrades(db);
  const openAfterCutoff =
    closeAt === null
      ? 0
      : trades.filter((t) => t.squareOffAt !== null && Date.now() > closeAt + 15_000).length;
  const events = await db
    .select({ kind: paperRiskEvents.kind, count: sql<number>`count(*)::int` })
    .from(paperRiskEvents)
    .where(isNull(paperRiskEvents.resolvedAt))
    .groupBy(paperRiskEvents.kind);
  const checkpoints = await db.select().from(workerCheckpoints);
  const lastCycles: PaperHealth['lastCycles'] = {};
  for (const job of [
    'feed',
    'paper-entries',
    'paper-monitor',
    'paper-squareoff',
    'paper-snapshot',
    'paper-reconcile',
  ])
    lastCycles[job] = null;
  for (const c of checkpoints) lastCycles[c.job] = { at: c.updatedAt.getTime(), cursor: c.cursor };
  const [mismatch] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(paperRiskEvents)
    .where(and(eq(paperRiskEvents.kind, 'RECONCILE_MISMATCH'), isNull(paperRiskEvents.resolvedAt)));
  return {
    portfolios: { total: total?.n ?? 0, enabled: enabled?.n ?? 0, withLiveTrades: live?.n ?? 0 },
    openAfterCutoff,
    unresolvedRiskEvents: events.map((e) => ({ kind: e.kind, count: e.count })),
    lastCycles,
    ledgerMismatches: mismatch?.n ?? 0,
  };
}

/** Ledger totals for the reconcile job: positions' locked cost versus the book. */
export async function paperLockedByPositions(db: Database, portfolioId: number): Promise<number> {
  const [row] = await db
    .select({ locked: sql<number>`coalesce(sum(${paperPositions.lockedPaise}),0)::bigint` })
    .from(paperPositions)
    .where(and(eq(paperPositions.portfolioId, portfolioId), ne(paperPositions.status, 'CLOSED')));
  return Number(row?.locked ?? 0);
}
export async function paperReservedByPositions(db: Database, portfolioId: number): Promise<number> {
  const [row] = await db
    .select({ reserved: sql<number>`coalesce(sum(${paperPositions.reservePaise}),0)::bigint` })
    .from(paperPositions)
    .where(
      and(
        eq(paperPositions.portfolioId, portfolioId),
        ne(paperPositions.status, 'CLOSED'),
        sql`${paperPositions.projection}->>'fill' is null`,
      ),
    );
  return Number(row?.reserved ?? 0);
}
export async function paperLedgerEntryCount(db: Database, portfolioId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(paperLedgerEntries)
    .where(eq(paperLedgerEntries.portfolioId, portfolioId));
  return row?.n ?? 0;
}

export interface PaperTradeDetail {
  position: PaperPosition;
  decidedShares: number;
  levels: { reference: number; stop: number; target1: number; target2: number };
  squareOffAt: number | null;
  evidence: IntradayEvidence;
}
/** Positions with what the page needs beyond the projection: decided shares, levels, evidence. */
export async function listPaperTradesDetailed(
  db: Database,
  userId: number,
  filter: { tradingDate?: string; live?: boolean; ids?: readonly number[] } = {},
): Promise<PaperTradeDetail[]> {
  const view = await getPaperPortfolio(db, userId);
  if (!view) return [];
  const where = [eq(paperPositions.portfolioId, view.portfolio.id)];
  if (filter.tradingDate) where.push(eq(paperPositions.tradingDate, filter.tradingDate));
  if (filter.live) where.push(ne(paperPositions.status, 'CLOSED'));
  if (filter.ids) {
    if (filter.ids.length === 0) return [];
    where.push(inArray(paperPositions.id, [...filter.ids]));
  }
  const rows = await db
    .select({ position: paperPositions, order: paperOrders })
    .from(paperPositions)
    .innerJoin(paperOrders, eq(paperOrders.id, paperPositions.orderId))
    .where(and(...where))
    .orderBy(desc(paperPositions.id));
  return rows.map(({ position, order }) => ({
    position: positionFromRow(position),
    decidedShares: position.decidedShares,
    levels: {
      reference: order.intent.entry.reference,
      stop: order.intent.stop,
      target1: order.intent.target1,
      target2: order.intent.target2,
    },
    squareOffAt: position.squareOffAt?.getTime() ?? null,
    evidence: order.intent.evidence,
  }));
}
