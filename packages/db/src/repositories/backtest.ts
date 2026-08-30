import { and, asc, desc, eq, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { backtestRuns, backtestSignals, backtestTrades, instruments } from '../schema/index.js';

/**
 * Backtest run, signal and outcome persistence.
 *
 * Two properties this module exists to guarantee:
 *
 *  - **Nothing here can touch a live table.** Every statement names a
 *    `backtest_*` table. A replay cannot contaminate `/signals/performance`
 *    because it has no way to reach it.
 *  - **A session is written atomically with its progress bump.** That single
 *    transaction is what makes a killed run resumable for free: `sessions_done`
 *    and the rows it counts either both landed or neither did, so restarting
 *    from `sessions_done` can never double-count or skip.
 *
 * Figures are per share, in paise. No quantity, no capital, no position
 * (CLAUDE.md).
 */

export type BacktestStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface BacktestRunInput {
  readonly label: string | null;
  readonly strategyVersionId: number;
  readonly barSource: 'stored' | 'archive';
  readonly datasetId: string | null;
  readonly gitRevision: string;
  readonly universe: readonly string[];
  /** False when today's index membership was applied to past dates. */
  readonly universeDated: boolean;
  readonly fromDate: string;
  readonly toDate: string;
  readonly cycleMinutes: number;
  readonly overrides: Record<string, unknown>;
}

/**
 * Opens a run in `queued`.
 *
 * Queued rather than running, even when a script is about to execute it
 * immediately, so that one lifecycle covers both the CLI path and the future
 * worker-claimed path rather than two subtly different ones.
 */
export async function createBacktestRun(db: Database, input: BacktestRunInput): Promise<number> {
  const [row] = await db
    .insert(backtestRuns)
    .values({
      label: input.label,
      status: 'queued',
      strategyVersionId: input.strategyVersionId,
      barSource: input.barSource,
      datasetId: input.datasetId,
      gitRevision: input.gitRevision,
      universe: [...input.universe],
      universeDated: input.universeDated,
      fromDate: input.fromDate,
      toDate: input.toDate,
      cycleMinutes: input.cycleMinutes,
      overrides: input.overrides,
    })
    .returning({ id: backtestRuns.id });

  if (row === undefined) throw new Error('createBacktestRun: insert returned no row');
  return row.id;
}

/** Moves a run to `running` and records how many sessions it will cover. */
export async function startBacktestRun(
  db: Database,
  runId: number,
  sessionsTotal: number,
): Promise<void> {
  await db
    .update(backtestRuns)
    .set({ status: 'running', sessionsTotal, startedAt: new Date() })
    .where(eq(backtestRuns.id, runId));
}

// ---------------------------------------------------------------------------
// Session results
// ---------------------------------------------------------------------------

export interface BacktestSignalInput {
  readonly instrumentId: number;
  readonly setupKey: string;
  readonly kind: string;
  readonly direction: string;
  readonly strategy: string;
  readonly state: string;
  readonly regime: string;
  readonly score: number;
  readonly quality: string;
  readonly scoring: unknown;
  readonly entryLow: number;
  readonly entryHigh: number;
  readonly invalidationLevel: number;
  readonly target1: number;
  readonly target2: number;
  readonly riskPaise: number;
  readonly rewardPaise: number;
  readonly riskReward: number | null;
  readonly costPaise: number;
  readonly netRewardPaise: number;
  readonly netRiskPaise: number;
  readonly netRiskReward: number | null;
  readonly referencePrice: number | null;
  readonly triggerMinutes: number;
  readonly setupMinutes: number;
  readonly trendMinutes: number;
  readonly indicatorSnapshot: unknown;
  readonly factors: unknown;
  readonly reasons: unknown;
  readonly events: unknown;
  readonly detectedAt: Date;
  readonly triggeredAt: Date | null;
  readonly endedAt: Date | null;
  readonly endReason: string | null;
  /**
   * The graded outcome, when the signal triggered and produced one.
   *
   * Attached to the signal rather than supplied as a parallel list because the
   * trade's foreign key is the signal id, which does not exist until the insert
   * returns. Pairing them here removes the chance of mismatching the two.
   */
  readonly trade: BacktestTradeInput | null;
}

export interface BacktestTradeInput {
  readonly entryAt: Date;
  readonly entryPrice: number;
  readonly exitAt: Date;
  readonly exitPrice: number;
  readonly exitReason: string;
  readonly grossPaise: number;
  readonly costPaise: number;
  readonly netPaise: number;
  readonly rMultiple: number;
  readonly maxFavourable: number;
  readonly maxAdverse: number;
  readonly barsHeld: number;
  readonly reachedTarget2: boolean;
}

export interface BacktestSessionResult {
  readonly runId: number;
  readonly tradingDate: string;
  /**
   * This session's 1-based position in the run's date list.
   *
   * Progress is taken from the ordinal rather than counted from stored rows,
   * because a quiet session legitimately produces no signals at all. Deriving
   * `sessions_done` from `backtest_signals` reported 56/57 on a run that had
   * finished every session — and a resume built on that count would have
   * redone the quiet session forever.
   */
  readonly sessionOrdinal: number;
  readonly signals: readonly BacktestSignalInput[];
  /** Symbols the engine actually measured this session. */
  readonly symbolsEvaluated: number;
  /** Individual `evaluateIntraday` calls, for a throughput figure. */
  readonly evaluations: number;
}

/**
 * Writes one session's results and advances the run, atomically.
 *
 * Re-running a session is safe: its existing rows are deleted first, so a
 * resumed or repeated run converges rather than accumulating. Signal and trade
 * totals are recounted from storage for the same reason — an incremented
 * counter would drift every time a session was rewritten — while progress uses
 * the caller's session ordinal, because a quiet session that stored nothing
 * still finished.
 */
export async function recordBacktestSession(
  db: Database,
  input: BacktestSessionResult,
): Promise<void> {
  const { runId, tradingDate, signals } = input;

  await db.transaction(async (tx) => {
    // Trades cascade from signals, so one delete clears both.
    await tx
      .delete(backtestSignals)
      .where(and(eq(backtestSignals.runId, runId), eq(backtestSignals.tradingDate, tradingDate)));

    if (signals.length > 0) {
      const inserted = await tx
        .insert(backtestSignals)
        .values(
          signals.map((signal) => ({
            runId,
            tradingDate,
            instrumentId: signal.instrumentId,
            setupKey: signal.setupKey,
            kind: signal.kind,
            direction: signal.direction,
            strategy: signal.strategy,
            state: signal.state,
            regime: signal.regime,
            score: signal.score,
            quality: signal.quality,
            scoring: signal.scoring,
            entryLow: signal.entryLow,
            entryHigh: signal.entryHigh,
            invalidationLevel: signal.invalidationLevel,
            target1: signal.target1,
            target2: signal.target2,
            riskPaise: signal.riskPaise,
            rewardPaise: signal.rewardPaise,
            riskReward: signal.riskReward,
            costPaise: signal.costPaise,
            netRewardPaise: signal.netRewardPaise,
            netRiskPaise: signal.netRiskPaise,
            netRiskReward: signal.netRiskReward,
            referencePrice: signal.referencePrice,
            triggerMinutes: signal.triggerMinutes,
            setupMinutes: signal.setupMinutes,
            trendMinutes: signal.trendMinutes,
            indicatorSnapshot: signal.indicatorSnapshot,
            factors: signal.factors,
            reasons: signal.reasons,
            events: signal.events,
            detectedAt: signal.detectedAt,
            triggeredAt: signal.triggeredAt,
            endedAt: signal.endedAt,
            endReason: signal.endReason,
          })),
        )
        .returning({ id: backtestSignals.id });

      // Postgres returns RETURNING rows in the order of the VALUES list, which
      // is what pairs a trade with its signal. Asserted rather than assumed:
      // a silent mismatch would attach outcomes to the wrong setups, and every
      // per-strategy statistic downstream would be wrong in a way that still
      // looks entirely plausible.
      if (inserted.length !== signals.length) {
        throw new Error(
          `recordBacktestSession: inserted ${inserted.length} signals for ${signals.length} inputs`,
        );
      }

      const trades = signals.flatMap((signal, index) => {
        const { trade } = signal;
        const id = inserted[index]?.id;
        if (trade === null || id === undefined) return [];
        return [
          {
            runId,
            signalId: id,
            instrumentId: signal.instrumentId,
            tradingDate,
            kind: signal.kind,
            strategy: signal.strategy,
            direction: signal.direction,
            regime: signal.regime,
            score: signal.score,
            quality: signal.quality,
            entryAt: trade.entryAt,
            entryPrice: trade.entryPrice,
            exitAt: trade.exitAt,
            exitPrice: trade.exitPrice,
            exitReason: trade.exitReason,
            grossPaise: trade.grossPaise,
            costPaise: trade.costPaise,
            netPaise: trade.netPaise,
            rMultiple: trade.rMultiple,
            maxFavourable: trade.maxFavourable,
            maxAdverse: trade.maxAdverse,
            barsHeld: trade.barsHeld,
            reachedTarget2: trade.reachedTarget2,
          },
        ];
      });

      if (trades.length > 0) await tx.insert(backtestTrades).values(trades);
    }

    // Signal and trade totals are recomputed from the stored rows, so a
    // rewritten session converges instead of double-counting. Progress is the
    // high-water ordinal for the same reason — GREATEST makes re-running an
    // earlier session idempotent rather than making the run appear to reverse.
    await tx
      .update(backtestRuns)
      .set({
        sessionsDone: sql`GREATEST(${backtestRuns.sessionsDone}, ${input.sessionOrdinal})`,
        signalsGenerated: sql`(
          SELECT count(*)::int FROM ${backtestSignals} WHERE ${backtestSignals.runId} = ${runId}
        )`,
        tradesRecorded: sql`(
          SELECT count(*)::int FROM ${backtestTrades} WHERE ${backtestTrades.runId} = ${runId}
        )`,
        symbolsEvaluated: sql`${backtestRuns.symbolsEvaluated} + ${input.symbolsEvaluated}`,
        evaluations: sql`${backtestRuns.evaluations} + ${input.evaluations}`,
      })
      .where(eq(backtestRuns.id, runId));
  });
}

/**
 * Trading dates that produced at least one stored signal.
 *
 * NOT a resume cursor, despite the obvious temptation. A session that produced
 * no signals writes no rows and is therefore absent here even though it ran to
 * completion — resuming from this set would replay every quiet session on every
 * restart. A real resume needs a per-session record, which arrives with the
 * worker-driven runner.
 */
export async function sessionsWithStoredSignals(db: Database, runId: number): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ tradingDate: backtestSignals.tradingDate })
    .from(backtestSignals)
    .where(eq(backtestSignals.runId, runId));
  return new Set(rows.map((row) => row.tradingDate));
}

export interface BacktestFinish {
  readonly status: Extract<BacktestStatus, 'succeeded' | 'failed' | 'cancelled'>;
  readonly summary?: unknown;
  readonly rejections?: Record<string, number>;
  readonly error?: string;
}

export async function finishBacktestRun(
  db: Database,
  runId: number,
  finish: BacktestFinish,
): Promise<void> {
  await db
    .update(backtestRuns)
    .set({
      status: finish.status,
      finishedAt: new Date(),
      ...(finish.summary === undefined ? {} : { summary: finish.summary }),
      ...(finish.rejections === undefined ? {} : { rejections: finish.rejections }),
      ...(finish.error === undefined ? {} : { error: finish.error }),
    })
    .where(eq(backtestRuns.id, runId));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface StoredBacktestRun {
  readonly id: number;
  readonly label: string | null;
  readonly status: string;
  readonly barSource: string;
  readonly datasetId: string | null;
  readonly gitRevision: string;
  readonly universe: unknown;
  readonly universeDated: boolean;
  readonly fromDate: string;
  readonly toDate: string;
  readonly cycleMinutes: number;
  readonly overrides: unknown;
  readonly sessionsTotal: number;
  readonly sessionsDone: number;
  readonly evaluations: number;
  readonly signalsGenerated: number;
  readonly tradesRecorded: number;
  readonly summary: unknown;
  readonly rejections: unknown;
  readonly error: string | null;
  readonly queuedAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
}

const RUN_COLUMNS = {
  id: backtestRuns.id,
  label: backtestRuns.label,
  status: backtestRuns.status,
  barSource: backtestRuns.barSource,
  datasetId: backtestRuns.datasetId,
  gitRevision: backtestRuns.gitRevision,
  universe: backtestRuns.universe,
  universeDated: backtestRuns.universeDated,
  fromDate: backtestRuns.fromDate,
  toDate: backtestRuns.toDate,
  cycleMinutes: backtestRuns.cycleMinutes,
  overrides: backtestRuns.overrides,
  sessionsTotal: backtestRuns.sessionsTotal,
  sessionsDone: backtestRuns.sessionsDone,
  evaluations: backtestRuns.evaluations,
  signalsGenerated: backtestRuns.signalsGenerated,
  tradesRecorded: backtestRuns.tradesRecorded,
  summary: backtestRuns.summary,
  rejections: backtestRuns.rejections,
  error: backtestRuns.error,
  queuedAt: backtestRuns.queuedAt,
  startedAt: backtestRuns.startedAt,
  finishedAt: backtestRuns.finishedAt,
} as const;

export async function listBacktestRuns(db: Database, limit = 25): Promise<StoredBacktestRun[]> {
  return db
    .select(RUN_COLUMNS)
    .from(backtestRuns)
    .orderBy(desc(backtestRuns.queuedAt))
    .limit(limit);
}

export async function getBacktestRun(
  db: Database,
  runId: number,
): Promise<StoredBacktestRun | null> {
  const [row] = await db
    .select(RUN_COLUMNS)
    .from(backtestRuns)
    .where(eq(backtestRuns.id, runId))
    .limit(1);
  return row ?? null;
}

export interface StoredBacktestTrade {
  readonly id: number;
  readonly signalId: number;
  readonly symbol: string;
  readonly tradingDate: string;
  readonly kind: string;
  readonly strategy: string;
  readonly direction: string;
  readonly regime: string;
  readonly score: number;
  readonly quality: string;
  readonly entryAt: Date;
  readonly entryPrice: number;
  readonly exitAt: Date;
  readonly exitPrice: number;
  readonly exitReason: string;
  readonly grossPaise: number;
  readonly costPaise: number;
  readonly netPaise: number;
  readonly rMultiple: number;
  readonly maxFavourable: number;
  readonly maxAdverse: number;
  readonly barsHeld: number;
}

export async function getBacktestTrades(
  db: Database,
  runId: number,
): Promise<StoredBacktestTrade[]> {
  return db
    .select({
      id: backtestTrades.id,
      signalId: backtestTrades.signalId,
      symbol: instruments.symbol,
      tradingDate: backtestTrades.tradingDate,
      kind: backtestTrades.kind,
      strategy: backtestTrades.strategy,
      direction: backtestTrades.direction,
      regime: backtestTrades.regime,
      score: backtestTrades.score,
      quality: backtestTrades.quality,
      entryAt: backtestTrades.entryAt,
      entryPrice: backtestTrades.entryPrice,
      exitAt: backtestTrades.exitAt,
      exitPrice: backtestTrades.exitPrice,
      exitReason: backtestTrades.exitReason,
      grossPaise: backtestTrades.grossPaise,
      costPaise: backtestTrades.costPaise,
      netPaise: backtestTrades.netPaise,
      rMultiple: backtestTrades.rMultiple,
      maxFavourable: backtestTrades.maxFavourable,
      maxAdverse: backtestTrades.maxAdverse,
      barsHeld: backtestTrades.barsHeld,
    })
    .from(backtestTrades)
    .innerJoin(instruments, eq(instruments.id, backtestTrades.instrumentId))
    .where(eq(backtestTrades.runId, runId))
    .orderBy(asc(backtestTrades.tradingDate), asc(backtestTrades.entryAt));
}

/**
 * Deletes all but the newest `keep` runs.
 *
 * Backtest signals and trades are the only tables that grow per experiment, and
 * a parameter sweep writes a run per grid point. Signals and trades cascade.
 */
export async function pruneBacktestRuns(db: Database, keep: number): Promise<number> {
  if (keep < 0) throw new RangeError(`pruneBacktestRuns: keep must be >= 0, got ${keep}`);

  const survivors = await db
    .select({ id: backtestRuns.id })
    .from(backtestRuns)
    .orderBy(desc(backtestRuns.queuedAt))
    .limit(keep);

  const deleted =
    survivors.length === 0
      ? await db.delete(backtestRuns).returning({ id: backtestRuns.id })
      : await db
          .delete(backtestRuns)
          .where(
            notInArray(
              backtestRuns.id,
              survivors.map((row) => row.id),
            ),
          )
          .returning({ id: backtestRuns.id });

  return deleted.length;
}
