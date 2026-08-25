import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  instruments,
  intradayRuns,
  intradaySignalEvents,
  intradaySignalFactors,
  intradaySignalReasons,
  intradaySignals,
} from '../schema/index.js';

/**
 * Intraday signal persistence.
 *
 * Three properties this layer must guarantee, because the engine above it is
 * pure and cannot:
 *
 *  - **A signal and its evidence are written together.** A signal row without
 *    its factor rows would leave the "why?" UI with nothing to read and no way
 *    to know it was truncated (CLAUDE.md hard rule 8). Every write is one
 *    transaction.
 *  - **Re-running a cycle is idempotent.** The evaluation loop can be
 *    triggered manually, and a partial run may be retried; nothing here
 *    accumulates duplicates when it is.
 *  - **Terminal is terminal.** A signal that ended stops satisfying the live
 *    partial unique index, which is what lets the same setup legitimately
 *    re-form later in the session after its cool-down.
 */

/** Terminal states. A signal in one of these is history, never a live setup. */
export const TERMINAL_SIGNAL_STATES = ['invalidated', 'expired', 'target_met'] as const;

export interface IntradayFactorInput {
  readonly category: string;
  readonly label: string;
  readonly score: number;
  readonly weight: number;
  readonly points: number;
  readonly detail: string;
}

export interface IntradayReasonInput {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly category: string;
  readonly polarity: string;
}

export interface IntradayEventInput {
  readonly at: Date;
  readonly kind: string;
  readonly message: string;
  readonly detail: string | null;
  readonly score: number;
  readonly state: string;
}

export interface IntradaySignalInput {
  readonly instrumentId: number;
  readonly strategyVersionId: number;
  readonly tradingDate: string;
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
  readonly invalidations: unknown;
  readonly indicatorSnapshot: unknown;
  readonly detectedAt: Date;
  readonly triggeredAt: Date | null;
  readonly updatedAt: Date;
  readonly factors: readonly IntradayFactorInput[];
  readonly reasons: readonly IntradayReasonInput[];
  readonly events: readonly IntradayEventInput[];
}

/**
 * Writes a new signal with its full evidence, atomically.
 *
 * Returns the new id, or null when a live signal for the same setup already
 * exists — the partial unique index is the authority on that, not a prior
 * SELECT, so two concurrent evaluation loops cannot both win the race.
 */
export async function createIntradaySignal(
  db: Database,
  input: IntradaySignalInput,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(intradaySignals)
      .values({
        instrumentId: input.instrumentId,
        strategyVersionId: input.strategyVersionId,
        tradingDate: input.tradingDate,
        setupKey: input.setupKey,
        kind: input.kind,
        direction: input.direction,
        strategy: input.strategy,
        state: input.state,
        regime: input.regime,
        score: input.score,
        quality: input.quality,
        scoring: input.scoring,
        entryLow: input.entryLow,
        entryHigh: input.entryHigh,
        invalidationLevel: input.invalidationLevel,
        target1: input.target1,
        target2: input.target2,
        riskPaise: input.riskPaise,
        rewardPaise: input.rewardPaise,
        riskReward: input.riskReward,
        costPaise: input.costPaise,
        netRewardPaise: input.netRewardPaise,
        netRiskPaise: input.netRiskPaise,
        netRiskReward: input.netRiskReward,
        referencePrice: input.referencePrice,
        triggerMinutes: input.triggerMinutes,
        setupMinutes: input.setupMinutes,
        trendMinutes: input.trendMinutes,
        invalidations: input.invalidations,
        indicatorSnapshot: input.indicatorSnapshot,
        detectedAt: input.detectedAt,
        triggeredAt: input.triggeredAt,
        updatedAt: input.updatedAt,
      })
      // A live signal for this setup already exists; that is the deduplication
      // working, not an error.
      .onConflictDoNothing()
      .returning({ id: intradaySignals.id });

    if (row === undefined) return null;

    if (input.factors.length > 0) {
      await tx
        .insert(intradaySignalFactors)
        .values(input.factors.map((factor) => ({ signalId: row.id, ...factor })));
    }
    if (input.reasons.length > 0) {
      await tx.insert(intradaySignalReasons).values(
        input.reasons.map((reason, position) => ({
          signalId: row.id,
          position,
          ...reason,
        })),
      );
    }
    if (input.events.length > 0) {
      await tx
        .insert(intradaySignalEvents)
        .values(input.events.map((event) => ({ signalId: row.id, ...event })))
        .onConflictDoNothing();
    }

    return row.id;
  });
}

export interface IntradaySignalUpdate {
  readonly id: number;
  readonly state: string;
  readonly quality: string;
  readonly score: number;
  readonly scoring: unknown;
  readonly holds: number;
  readonly maxFavourable: number;
  readonly maxAdverse: number;
  readonly triggeredAt: Date | null;
  readonly referencePrice: number | null;
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
  readonly updatedAt: Date;
  readonly endedAt: Date | null;
  readonly endReason: string | null;
  /** Timeline entries produced by this transition. */
  readonly events: readonly IntradayEventInput[];
  /** Replaces the factor rows, so the breakdown always matches the score. */
  readonly factors: readonly IntradayFactorInput[];
  readonly reasons: readonly IntradayReasonInput[];
}

/**
 * Updates a live signal and rewrites its evidence.
 *
 * The evidence is replaced wholesale rather than merged: a re-scored signal
 * whose reasons have changed must not keep the old ones alongside the new
 * ones, which would show a justification the current score was not built from.
 */
export async function updateIntradaySignal(
  db: Database,
  update: IntradaySignalUpdate,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(intradaySignals)
      .set({
        state: update.state,
        quality: update.quality,
        score: update.score,
        scoring: update.scoring,
        holds: update.holds,
        maxFavourable: update.maxFavourable,
        maxAdverse: update.maxAdverse,
        triggeredAt: update.triggeredAt,
        referencePrice: update.referencePrice,
        entryLow: update.entryLow,
        entryHigh: update.entryHigh,
        invalidationLevel: update.invalidationLevel,
        target1: update.target1,
        target2: update.target2,
        riskPaise: update.riskPaise,
        rewardPaise: update.rewardPaise,
        riskReward: update.riskReward,
        costPaise: update.costPaise,
        netRewardPaise: update.netRewardPaise,
        netRiskPaise: update.netRiskPaise,
        netRiskReward: update.netRiskReward,
        updatedAt: update.updatedAt,
        endedAt: update.endedAt,
        endReason: update.endReason,
      })
      .where(eq(intradaySignals.id, update.id));

    if (update.factors.length > 0) {
      await tx.delete(intradaySignalFactors).where(eq(intradaySignalFactors.signalId, update.id));
      await tx
        .insert(intradaySignalFactors)
        .values(update.factors.map((factor) => ({ signalId: update.id, ...factor })));
    }

    if (update.reasons.length > 0) {
      await tx.delete(intradaySignalReasons).where(eq(intradaySignalReasons.signalId, update.id));
      await tx.insert(intradaySignalReasons).values(
        update.reasons.map((reason, position) => ({
          signalId: update.id,
          position,
          ...reason,
        })),
      );
    }

    if (update.events.length > 0) {
      await tx
        .insert(intradaySignalEvents)
        .values(update.events.map((event) => ({ signalId: update.id, ...event })))
        // The same cycle re-run must not duplicate a timeline entry.
        .onConflictDoNothing();
    }
  });
}

export interface StoredIntradaySignal {
  readonly id: number;
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly tradingDate: string;
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
  readonly invalidations: unknown;
  readonly indicatorSnapshot: unknown;
  readonly detectedAt: Date;
  readonly triggeredAt: Date | null;
  readonly updatedAt: Date;
  readonly endedAt: Date | null;
  readonly endReason: string | null;
  readonly holds: number;
  readonly maxFavourable: number;
  readonly maxAdverse: number;
}

const SIGNAL_COLUMNS = {
  id: intradaySignals.id,
  instrumentId: intradaySignals.instrumentId,
  symbol: instruments.symbol,
  name: instruments.name,
  tradingDate: intradaySignals.tradingDate,
  setupKey: intradaySignals.setupKey,
  kind: intradaySignals.kind,
  direction: intradaySignals.direction,
  strategy: intradaySignals.strategy,
  state: intradaySignals.state,
  regime: intradaySignals.regime,
  score: intradaySignals.score,
  quality: intradaySignals.quality,
  scoring: intradaySignals.scoring,
  entryLow: intradaySignals.entryLow,
  entryHigh: intradaySignals.entryHigh,
  invalidationLevel: intradaySignals.invalidationLevel,
  target1: intradaySignals.target1,
  target2: intradaySignals.target2,
  riskPaise: intradaySignals.riskPaise,
  rewardPaise: intradaySignals.rewardPaise,
  riskReward: intradaySignals.riskReward,
  costPaise: intradaySignals.costPaise,
  netRewardPaise: intradaySignals.netRewardPaise,
  netRiskPaise: intradaySignals.netRiskPaise,
  netRiskReward: intradaySignals.netRiskReward,
  referencePrice: intradaySignals.referencePrice,
  triggerMinutes: intradaySignals.triggerMinutes,
  setupMinutes: intradaySignals.setupMinutes,
  trendMinutes: intradaySignals.trendMinutes,
  invalidations: intradaySignals.invalidations,
  indicatorSnapshot: intradaySignals.indicatorSnapshot,
  detectedAt: intradaySignals.detectedAt,
  triggeredAt: intradaySignals.triggeredAt,
  updatedAt: intradaySignals.updatedAt,
  endedAt: intradaySignals.endedAt,
  endReason: intradaySignals.endReason,
  holds: intradaySignals.holds,
  maxFavourable: intradaySignals.maxFavourable,
  maxAdverse: intradaySignals.maxAdverse,
} as const;

/** Every signal for a session, strongest first. */
export async function getIntradaySignals(
  db: Database,
  tradingDate: string,
  options: { readonly limit?: number } = {},
): Promise<StoredIntradaySignal[]> {
  return (
    db
      .select(SIGNAL_COLUMNS)
      .from(intradaySignals)
      .innerJoin(instruments, eq(instruments.id, intradaySignals.instrumentId))
      .where(eq(intradaySignals.tradingDate, tradingDate))
      // Live signals first, then by score. `NULLS FIRST` is explicit because
      // Postgres puts NULLs LAST on an ascending sort — the default ranks every
      // ended signal above every live one, and the row limit then truncates away
      // exactly the setups that still matter.
      .orderBy(sql`${intradaySignals.endedAt} ASC NULLS FIRST`, desc(intradaySignals.score))
      .limit(options.limit ?? 300)
  );
}

/**
 * The most recent session that has any intraday signals at all.
 *
 * Used when today has none — over a weekend or a holiday, showing the last
 * session's recorded setups, clearly labelled as history, is far more useful
 * than an empty page. The caller must still render them as history: a terminal
 * signal from Friday is not a live opportunity on Saturday.
 */
export async function latestIntradaySignalDate(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ tradingDate: intradaySignals.tradingDate })
    .from(intradaySignals)
    .orderBy(desc(intradaySignals.tradingDate))
    .limit(1);
  return row?.tradingDate ?? null;
}

/** Non-terminal signals for a session, keyed for the transition step. */
export async function getLiveIntradaySignals(
  db: Database,
  tradingDate: string,
): Promise<StoredIntradaySignal[]> {
  return db
    .select(SIGNAL_COLUMNS)
    .from(intradaySignals)
    .innerJoin(instruments, eq(instruments.id, intradaySignals.instrumentId))
    .where(and(eq(intradaySignals.tradingDate, tradingDate), isNull(intradaySignals.endedAt)))
    .orderBy(desc(intradaySignals.score));
}

export interface InstrumentSetup {
  readonly instrumentId: number;
  readonly kind: string;
  readonly direction: string;
  readonly state: string;
  readonly score: number;
  readonly quality: string;
  readonly entryLow: number;
  readonly entryHigh: number;
  readonly invalidationLevel: number;
  readonly target1: number;
  readonly netRiskReward: number | null;
}

/**
 * The strongest live setup for each of a specific set of instruments.
 *
 * A narrow projection on purpose. `getLiveIntradaySignals` returns whole
 * signals, jsonb snapshots included, because the transition step needs them;
 * the watchlist needs eleven scalars per row and refreshes every fifteen
 * seconds while the market is open, so pulling the snapshots there would be
 * megabytes an hour of JSON nothing reads.
 *
 * DISTINCT ON keys on the instrument with the highest score first: a name can
 * legitimately have several setups open at once, and a single column has room
 * for the best of them.
 */
export async function liveSetupsForInstruments(
  db: Database,
  tradingDate: string,
  instrumentIds: readonly number[],
): Promise<Map<number, InstrumentSetup>> {
  if (instrumentIds.length === 0) return new Map();

  const rows = await db
    .selectDistinctOn([intradaySignals.instrumentId], {
      instrumentId: intradaySignals.instrumentId,
      kind: intradaySignals.kind,
      direction: intradaySignals.direction,
      state: intradaySignals.state,
      score: intradaySignals.score,
      quality: intradaySignals.quality,
      entryLow: intradaySignals.entryLow,
      entryHigh: intradaySignals.entryHigh,
      invalidationLevel: intradaySignals.invalidationLevel,
      target1: intradaySignals.target1,
      netRiskReward: intradaySignals.netRiskReward,
    })
    .from(intradaySignals)
    .where(
      and(
        eq(intradaySignals.tradingDate, tradingDate),
        isNull(intradaySignals.endedAt),
        inArray(intradaySignals.instrumentId, [...instrumentIds]),
      ),
    )
    .orderBy(intradaySignals.instrumentId, desc(intradaySignals.score));

  return new Map(rows.map((row) => [row.instrumentId, row]));
}

/**
 * Setups that ended recently, for the cool-down.
 *
 * Without this a failing setup re-triggers on the very next cycle, because the
 * conditions that produced it are usually still true one bar later.
 */
export async function getRecentlyEndedSetups(
  db: Database,
  tradingDate: string,
  since: Date,
): Promise<{ instrumentId: number; setupKey: string; endedAt: Date }[]> {
  const rows = await db
    .select({
      instrumentId: intradaySignals.instrumentId,
      setupKey: intradaySignals.setupKey,
      endedAt: intradaySignals.endedAt,
    })
    .from(intradaySignals)
    .where(
      and(
        eq(intradaySignals.tradingDate, tradingDate),
        gte(intradaySignals.endedAt, since),
        inArray(intradaySignals.state, [...TERMINAL_SIGNAL_STATES]),
      ),
    );

  return rows.flatMap((row) => (row.endedAt === null ? [] : [{ ...row, endedAt: row.endedAt }]));
}

export interface IntradaySignalDetail {
  readonly signal: StoredIntradaySignal;
  readonly factors: readonly IntradayFactorInput[];
  readonly reasons: readonly IntradayReasonInput[];
  readonly events: readonly (IntradayEventInput & { readonly at: Date })[];
}

/** One signal with everything needed to explain it. Never recomputes. */
export async function getIntradaySignalDetail(
  db: Database,
  id: number,
): Promise<IntradaySignalDetail | null> {
  const [signal] = await db
    .select(SIGNAL_COLUMNS)
    .from(intradaySignals)
    .innerJoin(instruments, eq(instruments.id, intradaySignals.instrumentId))
    .where(eq(intradaySignals.id, id))
    .limit(1);
  if (signal === undefined) return null;

  const [factors, reasons, events] = await Promise.all([
    db
      .select({
        category: intradaySignalFactors.category,
        label: intradaySignalFactors.label,
        score: intradaySignalFactors.score,
        weight: intradaySignalFactors.weight,
        points: intradaySignalFactors.points,
        detail: intradaySignalFactors.detail,
      })
      .from(intradaySignalFactors)
      .where(eq(intradaySignalFactors.signalId, id))
      .orderBy(desc(intradaySignalFactors.weight)),
    db
      .select({
        key: intradaySignalReasons.key,
        label: intradaySignalReasons.label,
        detail: intradaySignalReasons.detail,
        category: intradaySignalReasons.category,
        polarity: intradaySignalReasons.polarity,
      })
      .from(intradaySignalReasons)
      .where(eq(intradaySignalReasons.signalId, id))
      .orderBy(asc(intradaySignalReasons.position)),
    db
      .select({
        at: intradaySignalEvents.at,
        kind: intradaySignalEvents.kind,
        message: intradaySignalEvents.message,
        detail: intradaySignalEvents.detail,
        score: intradaySignalEvents.score,
        state: intradaySignalEvents.state,
      })
      .from(intradaySignalEvents)
      .where(eq(intradaySignalEvents.signalId, id))
      .orderBy(asc(intradaySignalEvents.at)),
  ]);

  return { signal, factors, reasons, events };
}

/** Timeline entries for many signals at once, for the list view. */
export async function getIntradayEventsFor(
  db: Database,
  signalIds: readonly number[],
): Promise<Map<number, (IntradayEventInput & { at: Date })[]>> {
  if (signalIds.length === 0) return new Map();

  const rows = await db
    .select({
      signalId: intradaySignalEvents.signalId,
      at: intradaySignalEvents.at,
      kind: intradaySignalEvents.kind,
      message: intradaySignalEvents.message,
      detail: intradaySignalEvents.detail,
      score: intradaySignalEvents.score,
      state: intradaySignalEvents.state,
    })
    .from(intradaySignalEvents)
    .where(inArray(intradaySignalEvents.signalId, [...signalIds]))
    .orderBy(asc(intradaySignalEvents.at));

  const grouped = new Map<number, (IntradayEventInput & { at: Date })[]>();
  for (const { signalId, ...event } of rows) {
    const bucket = grouped.get(signalId);
    if (bucket === undefined) grouped.set(signalId, [event]);
    else bucket.push(event);
  }
  return grouped;
}

/** Factor rows for many signals at once, so the list can render breakdowns. */
export async function getIntradayFactorsFor(
  db: Database,
  signalIds: readonly number[],
): Promise<Map<number, IntradayFactorInput[]>> {
  if (signalIds.length === 0) return new Map();

  const rows = await db
    .select({
      signalId: intradaySignalFactors.signalId,
      category: intradaySignalFactors.category,
      label: intradaySignalFactors.label,
      score: intradaySignalFactors.score,
      weight: intradaySignalFactors.weight,
      points: intradaySignalFactors.points,
      detail: intradaySignalFactors.detail,
    })
    .from(intradaySignalFactors)
    .where(inArray(intradaySignalFactors.signalId, [...signalIds]))
    .orderBy(desc(intradaySignalFactors.weight));

  const grouped = new Map<number, IntradayFactorInput[]>();
  for (const { signalId, ...factor } of rows) {
    const bucket = grouped.get(signalId);
    if (bucket === undefined) grouped.set(signalId, [factor]);
    else bucket.push(factor);
  }
  return grouped;
}

/** Reason rows for many signals at once. */
export async function getIntradayReasonsFor(
  db: Database,
  signalIds: readonly number[],
): Promise<Map<number, IntradayReasonInput[]>> {
  if (signalIds.length === 0) return new Map();

  const rows = await db
    .select({
      signalId: intradaySignalReasons.signalId,
      key: intradaySignalReasons.key,
      label: intradaySignalReasons.label,
      detail: intradaySignalReasons.detail,
      category: intradaySignalReasons.category,
      polarity: intradaySignalReasons.polarity,
    })
    .from(intradaySignalReasons)
    .where(inArray(intradaySignalReasons.signalId, [...signalIds]))
    .orderBy(asc(intradaySignalReasons.position));

  const grouped = new Map<number, IntradayReasonInput[]>();
  for (const { signalId, ...reason } of rows) {
    const bucket = grouped.get(signalId);
    if (bucket === undefined) grouped.set(signalId, [reason]);
    else bucket.push(reason);
  }
  return grouped;
}

/**
 * Expires every live signal for a session.
 *
 * Called at the close: an intraday setup that outlives its session must not
 * reappear tomorrow as a live opportunity, and leaving it non-terminal would
 * also block the same setup from forming again.
 */
export async function expireOpenSignals(
  db: Database,
  tradingDate: string,
  at: Date,
  reason: string,
): Promise<number> {
  const rows = await db
    .update(intradaySignals)
    .set({ state: 'expired', endedAt: at, endReason: reason, updatedAt: at })
    .where(and(eq(intradaySignals.tradingDate, tradingDate), isNull(intradaySignals.endedAt)))
    .returning({ id: intradaySignals.id });

  if (rows.length > 0) {
    await db
      .insert(intradaySignalEvents)
      .values(
        rows.map((row) => ({
          signalId: row.id,
          at,
          kind: 'expired',
          message: reason,
          detail: null,
          score: 0,
          state: 'expired',
        })),
      )
      .onConflictDoNothing();
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Run bookkeeping
// ---------------------------------------------------------------------------

/** Opens a run row. Without one, a silent worker looks like a quiet market. */
export async function startIntradayRun(
  db: Database,
  tradingDate: string,
  regime: string,
  symbolsRequested: number,
): Promise<number> {
  const [row] = await db
    .insert(intradayRuns)
    .values({ tradingDate, regime, symbolsRequested })
    .returning({ id: intradayRuns.id });
  if (row === undefined) throw new Error('startIntradayRun: insert returned no row');
  return row.id;
}

export async function finishIntradayRun(
  db: Database,
  id: number,
  result: {
    readonly status: string;
    readonly symbolsEvaluated: number;
    readonly signalsCreated: number;
    readonly signalsUpdated: number;
    readonly skipped: unknown;
    readonly error?: string | null;
  },
): Promise<void> {
  await db
    .update(intradayRuns)
    .set({
      status: result.status,
      symbolsEvaluated: result.symbolsEvaluated,
      signalsCreated: result.signalsCreated,
      signalsUpdated: result.signalsUpdated,
      skipped: result.skipped,
      error: result.error ?? null,
      finishedAt: new Date(),
    })
    .where(eq(intradayRuns.id, id));
}

/** The most recent run for a session, for the freshness banner and the live-processing status. */
export async function latestIntradayRun(
  db: Database,
  tradingDate: string,
): Promise<{
  id: number;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  regime: string | null;
  symbolsRequested: number;
  symbolsEvaluated: number;
  signalsCreated: number;
  signalsUpdated: number;
  skippedCount: number;
  error: string | null;
} | null> {
  const [row] = await db
    .select({
      id: intradayRuns.id,
      startedAt: intradayRuns.startedAt,
      finishedAt: intradayRuns.finishedAt,
      status: intradayRuns.status,
      regime: intradayRuns.regime,
      symbolsRequested: intradayRuns.symbolsRequested,
      symbolsEvaluated: intradayRuns.symbolsEvaluated,
      signalsCreated: intradayRuns.signalsCreated,
      signalsUpdated: intradayRuns.signalsUpdated,
      // The count, not the reasons — the reasons are for a worker-side log, not
      // a page trying to answer "is this thing running?" in one glance.
      skippedCount: sql<number>`jsonb_array_length(${intradayRuns.skipped})`,
      error: intradayRuns.error,
    })
    .from(intradayRuns)
    .where(eq(intradayRuns.tradingDate, tradingDate))
    .orderBy(desc(intradayRuns.startedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Deletes intraday signal rows for sessions older than `before`.
 *
 * Intraday signals accumulate fast and only the recent ones are useful live.
 * Kept as an explicit call rather than a policy, so history is never discarded
 * without someone asking for it — the stored excursions are the raw material
 * for the future performance analysis.
 */
export async function pruneIntradaySignals(db: Database, before: string): Promise<number> {
  const rows = await db
    .delete(intradaySignals)
    .where(lt(intradaySignals.tradingDate, before))
    .returning({ id: intradaySignals.id });
  return rows.length;
}

/** Session-level counts for the summary cards, computed in one scan. */
export async function getIntradaySummary(
  db: Database,
  tradingDate: string,
): Promise<{
  live: number;
  longs: number;
  shorts: number;
  breakouts: number;
  breakdowns: number;
  invalidated: number;
  targetMet: number;
}> {
  const live = sql<boolean>`${intradaySignals.endedAt} IS NULL`;
  const [row] = await db
    .select({
      live: sql<number>`count(*) filter (where ${live})::int`,
      longs: sql<number>`count(*) filter (where ${live} and ${intradaySignals.direction} = 'long')::int`,
      shorts: sql<number>`count(*) filter (where ${live} and ${intradaySignals.direction} = 'short')::int`,
      breakouts: sql<number>`count(*) filter (where ${live} and ${intradaySignals.kind} = 'breakout')::int`,
      breakdowns: sql<number>`count(*) filter (where ${live} and ${intradaySignals.kind} = 'breakdown')::int`,
      invalidated: sql<number>`count(*) filter (where ${intradaySignals.state} = 'invalidated')::int`,
      targetMet: sql<number>`count(*) filter (where ${intradaySignals.state} = 'target_met')::int`,
    })
    .from(intradaySignals)
    .where(eq(intradaySignals.tradingDate, tradingDate));

  return (
    row ?? {
      live: 0,
      longs: 0,
      shorts: 0,
      breakouts: 0,
      breakdowns: 0,
      invalidated: 0,
      targetMet: 0,
    }
  );
}
