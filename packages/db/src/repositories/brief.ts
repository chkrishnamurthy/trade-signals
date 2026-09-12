import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  dailyIndicators,
  instruments,
  signalFactors,
  signals,
  watchlistItems,
  watchlists,
} from '../schema/index.js';

/**
 * Set-based reads for the Daily Market Brief (`/today`).
 *
 * Every function here answers "for THIS set of instruments on THIS session,
 * give me one thing" in a single bounded query — never one query per
 * instrument. The brief aggregates ~50 names across two sessions, so an N+1
 * pattern would be dozens of round trips for a page that must render fast and
 * degrade safely. Nothing here recomputes an indicator or a signal; it reads
 * what the worker's end-of-day pass persisted (hard rule 8).
 */

/** One completed session that has indicator rows, with its coverage and freshness. */
export interface IndicatorSession {
  /** IST trading date, `YYYY-MM-DD`. */
  readonly tradingDate: string;
  /** How many instruments have an indicator row for the session. */
  readonly instrumentCount: number;
  /** Max `computed_at` across the session, or null. */
  readonly completedAt: Date | null;
}

/** The most recent completed sessions, newest first. */
export async function recentIndicatorSessions(
  db: Database,
  limit: number,
): Promise<IndicatorSession[]> {
  const rows = await db
    .select({
      tradingDate: dailyIndicators.tradingDate,
      instrumentCount: sql<number>`count(*)::int`,
      completedAt: sql<Date | null>`max(${dailyIndicators.computedAt})`,
    })
    .from(dailyIndicators)
    .groupBy(dailyIndicators.tradingDate)
    .orderBy(desc(dailyIndicators.tradingDate))
    .limit(limit);

  return rows.map((row) => ({
    tradingDate: row.tradingDate,
    instrumentCount: Number(row.instrumentCount),
    completedAt: row.completedAt === null ? null : new Date(row.completedAt),
  }));
}

export interface BriefIndicatorRow {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly close: number;
  readonly changePercent: number | null;
  readonly sma20: number | null;
  readonly sma50: number | null;
  readonly rsi14: number | null;
  readonly macdHistogram: number | null;
  readonly relativeVolume: number | null;
  readonly barCount: number;
}

/** Indicator rows for a set of instruments on one session, keyed by instrument. */
export async function indicatorsForInstrumentsOnDate(
  db: Database,
  instrumentIds: readonly number[],
  tradingDate: string,
): Promise<Map<number, BriefIndicatorRow>> {
  if (instrumentIds.length === 0) return new Map();

  const rows = await db
    .select({
      instrumentId: dailyIndicators.instrumentId,
      symbol: instruments.symbol,
      name: instruments.name,
      close: dailyIndicators.close,
      changePercent: dailyIndicators.changePercent,
      sma20: dailyIndicators.sma20,
      sma50: dailyIndicators.sma50,
      rsi14: dailyIndicators.rsi14,
      macdHistogram: dailyIndicators.macdHistogram,
      relativeVolume: dailyIndicators.relativeVolume,
      barCount: dailyIndicators.barCount,
    })
    .from(dailyIndicators)
    .innerJoin(instruments, eq(instruments.id, dailyIndicators.instrumentId))
    .where(
      and(
        eq(dailyIndicators.tradingDate, tradingDate),
        inArray(dailyIndicators.instrumentId, [...instrumentIds]),
      ),
    );

  return new Map(rows.map((row) => [row.instrumentId, row]));
}

export interface BriefSignalRow {
  readonly signalId: number;
  readonly instrumentId: number;
  readonly direction: string;
  readonly strength: number;
  readonly setups: readonly string[];
  readonly close: number;
}

/**
 * Stored signals for a set of instruments on one session, keyed by instrument.
 *
 * `DISTINCT ON` picks the newest strategy version when more than one has written
 * a row for the session — the same rule the watchlist uses, so the two surfaces
 * never disagree about which config is live.
 */
export async function signalsForInstrumentsOnDate(
  db: Database,
  instrumentIds: readonly number[],
  tradingDate: string,
): Promise<Map<number, BriefSignalRow>> {
  if (instrumentIds.length === 0) return new Map();

  const rows = await db
    .selectDistinctOn([signals.instrumentId], {
      signalId: signals.id,
      instrumentId: signals.instrumentId,
      direction: signals.direction,
      strength: signals.strength,
      setups: signals.setups,
      close: signals.close,
    })
    .from(signals)
    .where(
      and(eq(signals.tradingDate, tradingDate), inArray(signals.instrumentId, [...instrumentIds])),
    )
    .orderBy(signals.instrumentId, desc(signals.strategyVersionId));

  return new Map(
    rows.map((row) => [
      row.instrumentId,
      { ...row, signalId: Number(row.signalId), setups: row.setups },
    ]),
  );
}

export interface BriefFactorRow {
  readonly key: string;
  readonly label: string;
  readonly score: number;
  readonly weight: number;
  readonly detail: string;
}

/** Factor breakdowns for a set of signals, keyed by signal id. */
export async function factorsForSignals(
  db: Database,
  signalIds: readonly number[],
): Promise<Map<number, BriefFactorRow[]>> {
  if (signalIds.length === 0) return new Map();

  const rows = await db
    .select({
      signalId: signalFactors.signalId,
      key: signalFactors.key,
      label: signalFactors.label,
      score: signalFactors.score,
      weight: signalFactors.weight,
      detail: signalFactors.detail,
    })
    .from(signalFactors)
    .where(inArray(signalFactors.signalId, [...signalIds]));

  const bySignal = new Map<number, BriefFactorRow[]>();
  for (const row of rows) {
    const id = Number(row.signalId);
    const list = bySignal.get(id) ?? [];
    list.push({
      key: row.key,
      label: row.label,
      score: row.score,
      weight: row.weight,
      detail: row.detail,
    });
    bySignal.set(id, list);
  }
  return bySignal;
}

export interface WatchlistMembershipRef {
  readonly watchlistId: number;
  readonly name: string;
}

/**
 * Which of the OWNER's watchlists hold each of the given instruments.
 *
 * Owner-scoped by construction — the join requires the watchlist to belong to
 * `ownerId`, so this can never leak another user's list membership.
 */
export async function watchlistMembershipForOwner(
  db: Database,
  ownerId: number,
  instrumentIds: readonly number[],
): Promise<Map<number, WatchlistMembershipRef[]>> {
  if (instrumentIds.length === 0) return new Map();

  const rows = await db
    .select({
      instrumentId: watchlistItems.instrumentId,
      watchlistId: watchlists.id,
      name: watchlists.name,
    })
    .from(watchlistItems)
    .innerJoin(
      watchlists,
      and(eq(watchlists.id, watchlistItems.watchlistId), eq(watchlists.ownerId, ownerId)),
    )
    .where(inArray(watchlistItems.instrumentId, [...instrumentIds]))
    .orderBy(watchlists.position, watchlists.id);

  const byInstrument = new Map<number, WatchlistMembershipRef[]>();
  for (const row of rows) {
    const list = byInstrument.get(row.instrumentId) ?? [];
    list.push({ watchlistId: row.watchlistId, name: row.name });
    byInstrument.set(row.instrumentId, list);
  }
  return byInstrument;
}

/** True when the owner has at least one watchlist. Owner-scoped. */
export async function ownerHasWatchlists(db: Database, ownerId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(eq(watchlists.ownerId, ownerId))
    .limit(1);
  return row !== undefined;
}
