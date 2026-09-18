import {
  advancePosition,
  appendLedger,
  buildPortfolioState,
  type IntradayObservation,
  type LedgerBalances,
  type LedgerDraft,
  ledgerDrafts,
  ledgerForFills,
  markNet,
  ORB_CONFIG,
  ORB_STRATEGY_ID,
  type OrbConfig,
  openingBalances,
  PAPER_COSTS,
  PAPER_DEFAULT_LIMITS,
  PAPER_ENGINE_REVISION,
  PAPER_STARTING_CAPITAL_PAISE,
  type PortfolioState,
  reconstructLedger,
} from '@equitywise/core';
import {
  type ExchangeSession,
  type PaperDecision,
  type PaperLedgerEntry,
  type PaperLimits,
  type PaperPosition,
  type PaperSettings,
  type PaperStrategyAssignment,
  paperLimitsSchema,
  paperPositionSchema,
  type TradeIntent,
  tradeIntentSchema,
} from '@equitywise/shared';
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  exchangeSessions,
  instrumentProviderRefs,
  paperAuditEvents,
  paperFills,
  paperLedgerEntries,
  paperOrders,
  paperPortfolios,
  paperPositionEvents,
  paperPositions,
  paperRiskEvents,
  paperSettings,
  paperStrategyAssignments,
  workerCheckpoints,
} from '../schema/paper.js';

/** Advisory lock namespace for per-portfolio writes (802 = intraday instruments). */
const LOCK = 804;

export class PaperConflict extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = 'PaperConflict';
  }
}

export interface PaperPortfolioView {
  portfolio: {
    id: number;
    userId: number;
    startingCapitalPaise: number;
    resetGeneration: number;
    createdAt: number;
  };
  settings: PaperSettings;
  assignments: PaperStrategyAssignment[];
}

function settingsView(row: typeof paperSettings.$inferSelect): PaperSettings {
  return {
    enabled: row.enabled,
    enabledAt: row.enabledAt?.getTime() ?? null,
    entriesPaused: row.entriesPaused,
    settingsVersion: row.settingsVersion,
    riskBps: row.riskBps,
    maxOpenPositions: row.maxOpenPositions,
    maxTradesPerDay: row.maxTradesPerDay,
    maxPositionExposureBps: row.maxPositionExposureBps,
    maxPortfolioExposureBps: row.maxPortfolioExposureBps,
    maxStockExposureBps: row.maxStockExposureBps,
    maxSectorExposureBps: row.maxSectorExposureBps,
    dailyLossHaltBps: row.dailyLossHaltBps,
    maxDrawdownHaltBps: row.maxDrawdownHaltBps,
  };
}

async function viewFor(
  db: Database,
  portfolio: typeof paperPortfolios.$inferSelect,
): Promise<PaperPortfolioView> {
  const [settings] = await db
    .select()
    .from(paperSettings)
    .where(eq(paperSettings.portfolioId, portfolio.id));
  if (!settings) throw new Error(`paper portfolio ${portfolio.id} has no settings row`);
  const assignments = await db
    .select()
    .from(paperStrategyAssignments)
    .where(eq(paperStrategyAssignments.portfolioId, portfolio.id))
    .orderBy(asc(paperStrategyAssignments.priority), asc(paperStrategyAssignments.strategyId));
  return {
    portfolio: {
      id: portfolio.id,
      userId: portfolio.userId,
      startingCapitalPaise: portfolio.startingCapitalPaise,
      resetGeneration: portfolio.resetGeneration,
      createdAt: portfolio.createdAt.getTime(),
    },
    settings: settingsView(settings),
    assignments: assignments.map((a) => ({
      strategyId: a.strategyId,
      enabled: a.enabled,
      priority: a.priority,
    })),
  };
}

/** The user's portfolio, or null. Every other read goes through this so the user scope is one place. */
export async function getPaperPortfolio(
  db: Database,
  userId: number,
): Promise<PaperPortfolioView | null> {
  const [row] = await db.select().from(paperPortfolios).where(eq(paperPortfolios.userId, userId));
  return row ? viewFor(db, row) : null;
}

/**
 * Creates the user's portfolio on first use: OFF, default limits, ORB-VC
 * assigned, and the opening balance on the ledger. Idempotent under the
 * unique user index.
 */
export async function ensurePaperPortfolio(
  db: Database,
  userId: number,
  now: number,
  capitalPaise = PAPER_STARTING_CAPITAL_PAISE,
  limits: PaperLimits = PAPER_DEFAULT_LIMITS,
): Promise<PaperPortfolioView> {
  const existing = await getPaperPortfolio(db, userId);
  if (existing) return existing;
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(paperPortfolios)
      .values({ userId, startingCapitalPaise: capitalPaise, createdAt: new Date(now) })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const [row] = await tx
        .select()
        .from(paperPortfolios)
        .where(eq(paperPortfolios.userId, userId));
      if (!row) throw new Error('paper portfolio vanished');
      return viewFor(tx, row);
    }
    await tx.insert(paperSettings).values({
      portfolioId: created.id,
      ...paperLimitsSchema.parse(limits),
      updatedAt: new Date(now),
    });
    await tx.insert(paperStrategyAssignments).values({
      portfolioId: created.id,
      strategyId: ORB_STRATEGY_ID,
      enabled: true,
      priority: 10,
      updatedAt: new Date(now),
    });
    await appendPaperLedger(
      tx,
      created.id,
      created.resetGeneration,
      ledgerDrafts.opening(created.id, now, capitalPaise),
    );
    await tx.insert(paperAuditEvents).values({
      at: new Date(now),
      userId,
      portfolioId: created.id,
      event: 'PORTFOLIO_CREATED',
      detail: { capitalPaise },
      ipAddress: null,
    });
    return viewFor(tx, created);
  });
}

export interface SettingsPatch extends Partial<PaperLimits> {
  enabled?: boolean;
  entriesPaused?: boolean;
}
/**
 * Applies a settings change with optimistic concurrency and an audit row per
 * kind of change. `enabledAt` is set here, never taken from a client.
 */
export async function updatePaperSettings(
  db: Database,
  userId: number,
  patch: SettingsPatch,
  options: { expectedVersion: number; now: number; ipAddress?: string | null },
): Promise<PaperPortfolioView> {
  return db.transaction(async (tx) => {
    const [portfolio] = await tx
      .select()
      .from(paperPortfolios)
      .where(eq(paperPortfolios.userId, userId));
    if (!portfolio) throw new PaperConflict('No paper portfolio.', 404);
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK}, ${portfolio.id})`);
    const [current] = await tx
      .select()
      .from(paperSettings)
      .where(eq(paperSettings.portfolioId, portfolio.id))
      .for('update');
    if (!current) throw new PaperConflict('No paper settings.', 404);
    if (current.settingsVersion !== options.expectedVersion)
      throw new PaperConflict('Settings changed elsewhere; reload and try again.', 409);
    // The limits schema is strict: feed it only the limit columns, never the flags.
    const limits = paperLimitsSchema.parse({
      ...limitsOf(settingsView(current)),
      ...stripFlags(patch),
    });
    const now = new Date(options.now);
    const audit: { event: string; detail: Record<string, unknown> }[] = [];
    const set: Partial<typeof paperSettings.$inferInsert> = {
      ...limits,
      settingsVersion: current.settingsVersion + 1,
      updatedAt: now,
    };
    if (patch.enabled !== undefined && patch.enabled !== current.enabled) {
      set.enabled = patch.enabled;
      if (patch.enabled) set.enabledAt = now;
      else set.disabledAt = now;
      audit.push({
        event: patch.enabled ? 'PAPER_ENABLED' : 'PAPER_DISABLED',
        detail: { limits, assignments: await assignmentsOf(tx, portfolio.id) },
      });
    }
    if (patch.entriesPaused !== undefined && patch.entriesPaused !== current.entriesPaused) {
      set.entriesPaused = patch.entriesPaused;
      set.entriesPausedAt = patch.entriesPaused ? now : null;
      audit.push({ event: patch.entriesPaused ? 'ENTRIES_PAUSED' : 'ENTRIES_RESUMED', detail: {} });
    }
    const before = settingsView(current);
    const changedLimits = Object.fromEntries(
      Object.entries(limits).filter(([k, v]) => before[k as keyof PaperLimits] !== v),
    );
    if (Object.keys(changedLimits).length > 0)
      audit.push({
        event: 'SETTINGS_CHANGED',
        detail: {
          before: Object.fromEntries(
            Object.keys(changedLimits).map((k) => [k, before[k as keyof PaperLimits]]),
          ),
          after: changedLimits,
        },
      });
    await tx.update(paperSettings).set(set).where(eq(paperSettings.portfolioId, portfolio.id));
    for (const a of audit)
      await tx.insert(paperAuditEvents).values({
        at: now,
        userId,
        portfolioId: portfolio.id,
        event: a.event,
        detail: a.detail,
        ipAddress: options.ipAddress ?? null,
      });
    return viewFor(tx, portfolio);
  });
}
const stripFlags = (patch: SettingsPatch): Partial<PaperLimits> => {
  const { enabled: _e, entriesPaused: _p, ...limits } = patch;
  return limits;
};
const limitsOf = (s: PaperSettings): PaperLimits => ({
  riskBps: s.riskBps,
  maxOpenPositions: s.maxOpenPositions,
  maxTradesPerDay: s.maxTradesPerDay,
  maxPositionExposureBps: s.maxPositionExposureBps,
  maxPortfolioExposureBps: s.maxPortfolioExposureBps,
  maxStockExposureBps: s.maxStockExposureBps,
  maxSectorExposureBps: s.maxSectorExposureBps,
  dailyLossHaltBps: s.dailyLossHaltBps,
  maxDrawdownHaltBps: s.maxDrawdownHaltBps,
});
const assignmentsOf = async (db: Database, portfolioId: number) =>
  (
    await db
      .select()
      .from(paperStrategyAssignments)
      .where(eq(paperStrategyAssignments.portfolioId, portfolioId))
  ).map((a) => ({ strategyId: a.strategyId, enabled: a.enabled, priority: a.priority }));

export async function setPaperStrategy(
  db: Database,
  userId: number,
  assignment: PaperStrategyAssignment,
  options: { now: number; ipAddress?: string | null },
): Promise<PaperPortfolioView> {
  return db.transaction(async (tx) => {
    const [portfolio] = await tx
      .select()
      .from(paperPortfolios)
      .where(eq(paperPortfolios.userId, userId));
    if (!portfolio) throw new PaperConflict('No paper portfolio.', 404);
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK}, ${portfolio.id})`);
    const now = new Date(options.now);
    await tx
      .insert(paperStrategyAssignments)
      .values({ portfolioId: portfolio.id, ...assignment, updatedAt: now })
      .onConflictDoUpdate({
        target: [paperStrategyAssignments.portfolioId, paperStrategyAssignments.strategyId],
        set: { enabled: assignment.enabled, priority: assignment.priority, updatedAt: now },
      });
    await tx.insert(paperAuditEvents).values({
      at: now,
      userId,
      portfolioId: portfolio.id,
      event: assignment.enabled ? 'STRATEGY_ENABLED' : 'STRATEGY_DISABLED',
      detail: { ...assignment },
      ipAddress: options.ipAddress ?? null,
    });
    return viewFor(tx, portfolio);
  });
}

// ---------------------------------------------------------------------------
// Ledger

export async function paperLedgerBalances(
  db: Database,
  portfolioId: number,
): Promise<{ balances: LedgerBalances; lastSequence: number }> {
  const [last] = await db
    .select()
    .from(paperLedgerEntries)
    .where(eq(paperLedgerEntries.portfolioId, portfolioId))
    .orderBy(desc(paperLedgerEntries.sequence))
    .limit(1);
  if (!last) return { balances: openingBalances(), lastSequence: 0 };
  return {
    balances: {
      cashPaise: last.cashAfterPaise,
      reservedPaise: last.reservedAfterPaise,
      lockedPaise: last.lockedAfterPaise,
    },
    lastSequence: last.sequence,
  };
}

/** Appends under the caller's portfolio lock. A duplicate idempotency key is a no-op (returns null). */
export async function appendPaperLedger(
  db: Database,
  portfolioId: number,
  resetGeneration: number,
  draft: LedgerDraft,
): Promise<PaperLedgerEntry | null> {
  const [dup] = await db
    .select({ id: paperLedgerEntries.id })
    .from(paperLedgerEntries)
    .where(eq(paperLedgerEntries.idempotencyKey, draft.idempotencyKey))
    .limit(1);
  if (dup) return null;
  const { balances, lastSequence } = await paperLedgerBalances(db, portfolioId);
  const { entry } = appendLedger(balances, lastSequence, draft);
  const [row] = await db
    .insert(paperLedgerEntries)
    .values({
      portfolioId,
      sequence: entry.sequence,
      at: new Date(entry.at),
      kind: entry.kind,
      amountPaise: entry.amountPaise,
      cashAfterPaise: entry.cashAfterPaise,
      reservedAfterPaise: entry.reservedAfterPaise,
      lockedAfterPaise: entry.lockedAfterPaise,
      lockedDeltaPaise: entry.lockedDeltaPaise,
      refKind: entry.refKind,
      refId: entry.refId,
      idempotencyKey: entry.idempotencyKey,
      resetGeneration,
    })
    .onConflictDoNothing()
    .returning({ id: paperLedgerEntries.id });
  return row ? entry : null;
}

export async function listPaperLedger(
  db: Database,
  userId: number,
  range?: { from?: number; to?: number },
): Promise<PaperLedgerEntry[]> {
  const view = await getPaperPortfolio(db, userId);
  if (!view) return [];
  const where = [eq(paperLedgerEntries.portfolioId, view.portfolio.id)];
  if (range?.from !== undefined) where.push(gte(paperLedgerEntries.at, new Date(range.from)));
  if (range?.to !== undefined) where.push(lte(paperLedgerEntries.at, new Date(range.to)));
  const rows = await db
    .select()
    .from(paperLedgerEntries)
    .where(and(...where))
    .orderBy(asc(paperLedgerEntries.sequence));
  return rows.map((r) => ({
    sequence: r.sequence,
    at: r.at.getTime(),
    kind: r.kind as PaperLedgerEntry['kind'],
    amountPaise: r.amountPaise,
    cashAfterPaise: r.cashAfterPaise,
    reservedAfterPaise: r.reservedAfterPaise,
    lockedAfterPaise: r.lockedAfterPaise,
    lockedDeltaPaise: r.lockedDeltaPaise,
    refKind: r.refKind as PaperLedgerEntry['refKind'],
    refId: r.refId,
    idempotencyKey: r.idempotencyKey,
  }));
}

/** Replays the whole book and compares every recorded balance. Empty = reconciled. */
export async function reconcilePaperLedger(db: Database, portfolioId: number) {
  const rows = await db
    .select()
    .from(paperLedgerEntries)
    .where(eq(paperLedgerEntries.portfolioId, portfolioId))
    .orderBy(asc(paperLedgerEntries.sequence));
  return reconstructLedger(
    rows.map((r) => ({
      sequence: r.sequence,
      at: r.at.getTime(),
      kind: r.kind as PaperLedgerEntry['kind'],
      amountPaise: r.amountPaise,
      cashAfterPaise: r.cashAfterPaise,
      reservedAfterPaise: r.reservedAfterPaise,
      lockedAfterPaise: r.lockedAfterPaise,
      lockedDeltaPaise: r.lockedDeltaPaise,
      refKind: r.refKind as PaperLedgerEntry['refKind'],
      refId: r.refId,
      idempotencyKey: r.idempotencyKey,
    })),
  );
}

// ---------------------------------------------------------------------------
// Positions and decisions

function positionView(row: typeof paperPositions.$inferSelect): PaperPosition {
  return paperPositionSchema.parse({
    id: row.id,
    intentId: row.intentId,
    strategyId: row.strategyId,
    strategyVersionId: row.strategyVersionId,
    instrumentId: row.instrumentId,
    symbol: row.symbol,
    sector: row.sector,
    direction: row.direction,
    status: row.status,
    projection: row.projection,
    lockedPaise: row.lockedPaise,
    grossRealisedPaise: row.grossRealisedPaise,
    chargesPaise: row.chargesPaise,
    netRealisedPaise: row.netRealisedPaise,
    initialRiskPaise: row.initialRiskPaise,
    exitReason: row.exitReason,
    openedAt: row.openedAt?.getTime() ?? null,
    closedAt: row.closedAt?.getTime() ?? null,
  });
}

export async function listPaperPositions(
  db: Database,
  userId: number,
  filter: { tradingDate?: string; live?: boolean } = {},
): Promise<PaperPosition[]> {
  const view = await getPaperPortfolio(db, userId);
  if (!view) return [];
  const where = [eq(paperPositions.portfolioId, view.portfolio.id)];
  if (filter.tradingDate) where.push(eq(paperPositions.tradingDate, filter.tradingDate));
  if (filter.live) where.push(ne(paperPositions.status, 'CLOSED'));
  const rows = await db
    .select()
    .from(paperPositions)
    .where(and(...where))
    .orderBy(desc(paperPositions.id));
  return rows.map(positionView);
}

/**
 * The decision-time state of a portfolio for `tradingDate`, from the ledger,
 * the live trades (marked at `lastPrice`), today's closed trades and today's
 * decisions. Read inside the caller's transaction.
 */
export async function loadPaperState(
  db: Database,
  portfolioId: number,
  tradingDate: string,
  lastPrice: (instrumentId: number) => number | null,
  peakEquityPaise: number,
  startOfDayEquityPaise: number,
): Promise<PortfolioState> {
  const { balances } = await paperLedgerBalances(db, portfolioId);
  const rows = await db
    .select({ position: paperPositions, order: paperOrders })
    .from(paperPositions)
    .innerJoin(paperOrders, eq(paperOrders.id, paperPositions.orderId))
    .where(eq(paperPositions.portfolioId, portfolioId));
  const live = rows.filter((r) => r.position.status !== 'CLOSED');
  const open = live
    .filter((r) => r.position.projection.fill !== null)
    .map((r) => ({
      instrumentId: r.position.instrumentId,
      sector: r.position.sector,
      lockedPaise: r.position.lockedPaise,
      markNetPaise: markNet(
        r.order.intent.evidence,
        r.position.projection,
        lastPrice(r.position.instrumentId),
      ),
      netRealisedPaise: r.position.netRealisedPaise,
    }));
  const pending = live
    .filter((r) => r.position.projection.fill === null)
    .map((r) => ({
      instrumentId: r.position.instrumentId,
      sector: r.position.sector,
      notionalPaise: r.position.decidedShares * r.order.intent.entry.reference,
    }));
  const today = rows.filter((r) => r.position.tradingDate === tradingDate);
  const orders = await db
    .select({
      strategyId: paperOrders.strategyId,
      instrumentId: paperOrders.instrumentId,
      intent: paperOrders.intent,
    })
    .from(paperOrders)
    .where(and(eq(paperOrders.portfolioId, portfolioId), eq(paperOrders.side, 'ENTRY')));
  return buildPortfolioState({
    balances,
    open,
    pending,
    realisedTodayPaise: today
      .filter((r) => r.position.status === 'CLOSED')
      .reduce((s, r) => s + r.position.netRealisedPaise, 0),
    startOfDayEquityPaise,
    peakEquityPaise,
    tradesToday: today.length,
    decidedKeys: new Set(
      orders.map((o) => `${o.strategyId}:${o.instrumentId}:${o.intent.sessionDate}`),
    ),
  });
}

/**
 * Persists one batch of decisions: an order per intent, and for accepted ones
 * a pending position plus the RESERVE ledger entry — all under the portfolio
 * lock, all idempotent (a re-run of the same batch inserts nothing).
 */
export async function recordPaperDecisions(
  db: Database,
  portfolioId: number,
  input: {
    intents: readonly TradeIntent[];
    decisions: readonly PaperDecision[];
    decidedAt: number;
    settingsVersion: number;
    squareOffAt: number | null;
  },
): Promise<{ orders: number; positions: number }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK}, ${portfolioId})`);
    const [portfolio] = await tx
      .select()
      .from(paperPortfolios)
      .where(eq(paperPortfolios.id, portfolioId));
    if (!portfolio) throw new PaperConflict('No paper portfolio.', 404);
    let orders = 0;
    let positions = 0;
    for (const decision of input.decisions) {
      const intent = input.intents.find((i) => i.id === decision.intentId);
      if (!intent) continue;
      const [order] = await tx
        .insert(paperOrders)
        .values({
          portfolioId,
          intentId: intent.id,
          strategyId: intent.strategyId,
          strategyVersionId: intent.strategyVersionId,
          instrumentId: intent.instrumentId,
          direction: intent.direction,
          side: 'ENTRY',
          leg: 0,
          kind: intent.entry.kind,
          requestedShares: decision.shares,
          status: decision.accepted ? 'ACCEPTED' : 'REJECTED',
          reasonCode: decision.reasonCode,
          reasonText: decision.reasonText,
          decidedAt: new Date(input.decidedAt),
          validUntil: new Date(intent.validUntil),
          settingsVersion: input.settingsVersion,
          engineRevision: PAPER_ENGINE_REVISION,
          decision: { sizing: decision.sizing, counts: decision.counts },
          intent: tradeIntentSchema.parse(intent),
          resetGeneration: portfolio.resetGeneration,
        })
        .onConflictDoNothing()
        .returning({ id: paperOrders.id });
      if (!order) continue;
      orders += 1;
      if (!decision.accepted || !decision.sizing) continue;
      const [position] = await tx
        .insert(paperPositions)
        .values({
          portfolioId,
          orderId: order.id,
          intentId: intent.id,
          strategyId: intent.strategyId,
          strategyVersionId: intent.strategyVersionId,
          instrumentId: intent.instrumentId,
          symbol: intent.symbol,
          sector: intent.sector,
          direction: intent.direction,
          tradingDate: intent.sessionDate,
          status: 'OPEN',
          projection: { ...pendingProjection(input.decidedAt) },
          decidedShares: decision.shares,
          reservePaise: decision.sizing.reservePaise,
          squareOffAt: input.squareOffAt === null ? null : new Date(input.squareOffAt),
          resetGeneration: portfolio.resetGeneration,
        })
        .onConflictDoNothing()
        .returning({ id: paperPositions.id });
      if (!position) continue;
      positions += 1;
      await appendPaperLedger(
        tx,
        portfolioId,
        portfolio.resetGeneration,
        ledgerDrafts.reserve(portfolioId, order.id, input.decidedAt, decision.sizing.reservePaise),
      );
    }
    return { orders, positions };
  });
}
const pendingProjection = (at: number) => ({
  status: 'PENDING' as const,
  cursor: at,
  taken: true,
  skipReason: null,
  shares: 0,
  remainingShares: 0,
  fill: null,
  fillAt: null,
  effectiveStop: null,
  exits: [],
  target1At: null,
  endedAt: null,
  resolution: 'OBSERVED' as const,
  reason: 'Accepted; simulated entry at the next observed price.',
});

/**
 * Applies one observation to every live paper trade on `instrumentId` in
 * `portfolioId`. Fills, events and ledger entries are keyed so a replayed
 * observation changes nothing. Returns how many positions moved.
 */
export async function applyPaperObservation(
  db: Database,
  portfolioId: number,
  instrumentId: number,
  observation: IntradayObservation,
  options: { observationId?: number | null; config?: OrbConfig } = {},
): Promise<number> {
  const config = options.config ?? ORB_CONFIG;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK}, ${portfolioId})`);
    const [portfolio] = await tx
      .select()
      .from(paperPortfolios)
      .where(eq(paperPortfolios.id, portfolioId));
    if (!portfolio) return 0;
    const rows = await tx
      .select({ position: paperPositions, order: paperOrders })
      .from(paperPositions)
      .innerJoin(paperOrders, eq(paperOrders.id, paperPositions.orderId))
      .where(
        and(
          eq(paperPositions.portfolioId, portfolioId),
          eq(paperPositions.instrumentId, instrumentId),
          ne(paperPositions.status, 'CLOSED'),
        ),
      );
    let moved = 0;
    for (const { position: row, order } of rows) {
      const intent = order.intent;
      const current = positionView(row);
      const pending = current.projection.fill === null;
      const { balances } = await paperLedgerBalances(tx, portfolioId);
      const result = advancePosition(
        current,
        intent,
        observation,
        pending
          ? {
              // The decision already applied every cap; the fill re-checks only free cash
              // (the reservation plus whatever is unreserved) and never exceeds decidedShares.
              equityPaise: balances.cashPaise + balances.reservedPaise + balances.lockedPaise,
              availablePaise: balances.cashPaise + row.reservePaise,
              riskBps: 10_000,
              maxShares: row.decidedShares,
            }
          : null,
        config,
        PAPER_COSTS,
        row.squareOffAt?.getTime() ?? null,
      );
      if (!result.changed) continue;
      moved += 1;
      if (pending) {
        await appendPaperLedger(
          tx,
          portfolioId,
          portfolio.resetGeneration,
          ledgerDrafts.release(portfolioId, order.id, observation.at, row.reservePaise),
        );
        await tx
          .update(paperOrders)
          .set({ status: result.position.projection.fill !== null ? 'FILLED' : 'CANCELLED' })
          .where(and(eq(paperOrders.id, order.id), eq(paperOrders.status, 'ACCEPTED')));
      }
      const persisted: {
        id: number;
        leg: number;
        at: number;
        pricePaise: number;
        shares: number;
        chargesPaise: number;
      }[] = [];
      for (const f of result.fills) {
        const [fill] = await tx
          .insert(paperFills)
          .values({
            orderId: order.id,
            portfolioId,
            positionId: row.id,
            leg: f.leg,
            at: new Date(f.at),
            receivedAt: new Date(observation.receivedAt),
            pricePaise: f.pricePaise,
            shares: f.shares,
            chargesPaise: f.chargesPaise,
            resolution: f.resolution,
            observationId: options.observationId ?? null,
          })
          .onConflictDoNothing()
          .returning({ id: paperFills.id });
        if (fill) persisted.push({ ...f, id: fill.id });
      }
      for (const draft of ledgerForFills(portfolioId, result.position, intent, persisted))
        await appendPaperLedger(tx, portfolioId, portfolio.resetGeneration, draft);
      let sequence = row.sequence;
      for (const e of result.events) {
        sequence += 1;
        await tx
          .insert(paperPositionEvents)
          .values({
            positionId: row.id,
            sequence,
            kind: e.kind,
            at: new Date(e.at),
            recordedAt: new Date(observation.receivedAt),
            pricePaise: e.pricePaise,
            shares: e.shares,
            explanation: e.explanation,
            observationId: options.observationId ?? null,
          })
          .onConflictDoNothing();
      }
      const p = result.position;
      await tx
        .update(paperPositions)
        .set({
          status: p.status,
          projection: p.projection,
          lockedPaise: p.lockedPaise,
          grossRealisedPaise: p.grossRealisedPaise,
          chargesPaise: p.chargesPaise,
          netRealisedPaise: p.netRealisedPaise,
          initialRiskPaise: p.initialRiskPaise,
          exitReason: p.exitReason,
          sequence,
          openedAt: p.openedAt === null ? null : new Date(p.openedAt),
          closedAt: p.closedAt === null ? null : new Date(p.closedAt),
        })
        .where(eq(paperPositions.id, row.id));
    }
    return moved;
  });
}

export async function listPaperEvents(
  db: Database,
  userId: number,
  positionIds: readonly number[],
) {
  const view = await getPaperPortfolio(db, userId);
  if (!view || positionIds.length === 0) return [];
  return db
    .select({
      positionId: paperPositionEvents.positionId,
      sequence: paperPositionEvents.sequence,
      kind: paperPositionEvents.kind,
      at: paperPositionEvents.at,
      pricePaise: paperPositionEvents.pricePaise,
      shares: paperPositionEvents.shares,
      explanation: paperPositionEvents.explanation,
    })
    .from(paperPositionEvents)
    .innerJoin(paperPositions, eq(paperPositions.id, paperPositionEvents.positionId))
    .where(
      and(
        eq(paperPositions.portfolioId, view.portfolio.id),
        inArray(paperPositionEvents.positionId, [...positionIds]),
      ),
    )
    .orderBy(asc(paperPositionEvents.positionId), asc(paperPositionEvents.sequence));
}

// ---------------------------------------------------------------------------
// Operational tables

export async function recordPaperRiskEvent(
  db: Database,
  input: { portfolioId: number | null; at: number; kind: string; detail: Record<string, unknown> },
) {
  await db.insert(paperRiskEvents).values({
    portfolioId: input.portfolioId,
    at: new Date(input.at),
    kind: input.kind,
    detail: input.detail,
  });
}
export async function listPaperAudit(db: Database, userId: number, limit = 50) {
  const view = await getPaperPortfolio(db, userId);
  if (!view) return [];
  return db
    .select({
      at: paperAuditEvents.at,
      event: paperAuditEvents.event,
      detail: paperAuditEvents.detail,
    })
    .from(paperAuditEvents)
    .where(eq(paperAuditEvents.portfolioId, view.portfolio.id))
    .orderBy(desc(paperAuditEvents.id))
    .limit(limit);
}
export async function getWorkerCheckpoint(
  db: Database,
  job: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(workerCheckpoints).where(eq(workerCheckpoints.job, job));
  return row?.cursor ?? null;
}
/** The checkpoint with its write time — for "how old is this report". */
export async function getWorkerCheckpointRow(
  db: Database,
  job: string,
): Promise<{ cursor: Record<string, unknown>; updatedAt: number } | null> {
  const [row] = await db.select().from(workerCheckpoints).where(eq(workerCheckpoints.job, job));
  return row ? { cursor: row.cursor, updatedAt: row.updatedAt.getTime() } : null;
}
export async function setWorkerCheckpoint(
  db: Database,
  job: string,
  cursor: Record<string, unknown>,
  now: number,
  runId: string | null = null,
) {
  await db
    .insert(workerCheckpoints)
    .values({ job, cursor, runId, updatedAt: new Date(now) })
    .onConflictDoUpdate({
      target: workerCheckpoints.job,
      set: { cursor, runId, updatedAt: new Date(now) },
    });
}
export async function upsertExchangeSession(
  db: Database,
  session: ExchangeSession,
  source: string,
  now: number,
) {
  const value = {
    exchange: 'NSE',
    tradingDate: session.tradingDate,
    kind: session.kind,
    openAt: session.openAt === null ? null : new Date(session.openAt),
    closeAt: session.closeAt === null ? null : new Date(session.closeAt),
    entryCutoffAt: session.entryCutoffAt === null ? null : new Date(session.entryCutoffAt),
    squareOffAt: session.squareOffAt === null ? null : new Date(session.squareOffAt),
    source,
    note: session.note,
    updatedAt: new Date(now),
  };
  await db
    .insert(exchangeSessions)
    .values(value)
    .onConflictDoUpdate({
      target: [exchangeSessions.exchange, exchangeSessions.tradingDate],
      set: value,
    });
}
export async function getExchangeSession(
  db: Database,
  tradingDate: string,
): Promise<ExchangeSession | null> {
  const [row] = await db
    .select()
    .from(exchangeSessions)
    .where(
      and(eq(exchangeSessions.exchange, 'NSE'), eq(exchangeSessions.tradingDate, tradingDate)),
    );
  if (!row) return null;
  return {
    tradingDate: row.tradingDate,
    kind: row.kind as ExchangeSession['kind'],
    openAt: row.openAt?.getTime() ?? null,
    closeAt: row.closeAt?.getTime() ?? null,
    entryCutoffAt: row.entryCutoffAt?.getTime() ?? null,
    squareOffAt: row.squareOffAt?.getTime() ?? null,
    note: row.note,
  };
}
export async function upsertInstrumentProviderRef(
  db: Database,
  instrumentId: number,
  providerId: string,
  providerRef: string,
  now: number,
) {
  await db
    .insert(instrumentProviderRefs)
    .values({
      instrumentId,
      providerId,
      providerRef,
      firstSeenAt: new Date(now),
      lastSeenAt: new Date(now),
    })
    .onConflictDoUpdate({
      target: [instrumentProviderRefs.instrumentId, instrumentProviderRefs.providerId],
      set: { providerRef, lastSeenAt: new Date(now) },
    });
}
