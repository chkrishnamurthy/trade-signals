import {
  type BookAllocation,
  type IntradayObservation,
  initialRisk,
  markNet,
  ORB_CONFIG,
  type OrbConfig,
  pendingIntradayProjection,
  realisedNet,
  stepProjection,
} from '@equitywise/core';
import {
  type IntradayBook,
  type IntradayEvidence,
  type IntradayProjection,
  type IntradayRejectReason,
  type IntradayScannerSnapshot,
  type IntradaySignalDto,
  type IntradaySkipReason,
  intradayEvidenceSchema,
  intradayProjectionSchema,
  intradaySignalDtoSchema,
  istDateKey,
  sessionOpen,
  terminalIntradayStatuses,
} from '@equitywise/shared';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  intradayScanRuns,
  intradaySessionExclusions,
  intradaySignalEvents,
  intradaySignals,
} from '../schema/intraday.js';
import { signalObservations, signalQuotes } from '../schema/vwap-signals.js';

/** Advisory lock namespace for this strategy's per-instrument writes. */
const LOCK = 802;
const SESSION_MS = 375 * 60_000;

function eventRow(signalId: number, sequence: number, p: IntradayProjection, recordedAt: number) {
  const last = p.exits.at(-1);
  return {
    signalId,
    sequence,
    status: p.status,
    effectiveAt: new Date(p.cursor),
    recordedAt: new Date(recordedAt),
    reason: p.reason,
    price: last?.at === p.cursor ? last.price : p.fillAt === p.cursor ? p.fill : null,
    shares: last?.at === p.cursor ? last.shares : p.fillAt === p.cursor ? p.shares : null,
    resolution: p.resolution,
  };
}

/**
 * Publish one signal. False (not an error) when the window has passed, the
 * stock already has a signal this session, or a concurrent publish won.
 * Signal, first event and the book decision commit together.
 */
export async function publishIntradaySignal(
  db: Database,
  input: {
    instrumentId: number;
    strategyVersionId: number;
    symbol: string;
    companyName: string;
    publishedAt: number;
    evidence: IntradayEvidence;
    skipReason: IntradaySkipReason | null;
    config?: OrbConfig;
  },
): Promise<number | null> {
  const config = input.config ?? ORB_CONFIG;
  const evidence = intradayEvidenceSchema.parse(input.evidence);
  if (
    input.publishedAt < evidence.signalAt ||
    input.publishedAt - evidence.signalAt > config.maxPublicationDelayMs
  )
    return null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK}, ${input.instrumentId})`);
    const projection = pendingIntradayProjection(input.publishedAt, input.skipReason);
    const [row] = await tx
      .insert(intradaySignals)
      .values({
        instrumentId: input.instrumentId,
        strategyVersionId: input.strategyVersionId,
        tradingDate: evidence.sessionDate,
        symbol: input.symbol,
        companyName: input.companyName,
        publishedAt: new Date(input.publishedAt),
        evidence,
        projection,
        taken: projection.taken,
      })
      .onConflictDoNothing()
      .returning({ id: intradaySignals.id });
    if (!row) return null;
    await tx
      .insert(intradaySignalEvents)
      .values(eventRow(row.id, 1, projection, input.publishedAt));
    return row.id;
  });
}

/** Whether the stock already has a signal this session (any outcome). */
export async function hasIntradaySignal(db: Database, instrumentId: number, tradingDate: string) {
  const [row] = await db
    .select({ id: intradaySignals.id })
    .from(intradaySignals)
    .where(
      and(
        eq(intradaySignals.instrumentId, instrumentId),
        eq(intradaySignals.tradingDate, tradingDate),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Cash the book still has free on a session: capital minus what open, taken
 * trades hold at their fill. A pending taken signal reserves nothing until it
 * fills, so two fills in the same second are serialised by the instrument
 * locks and each sees the other's reservation only after it commits — the
 * allocation cap (§3.8) bounds the exposure meanwhile.
 */
async function availableCash(
  db: Database,
  tradingDate: string,
  capitalPaise: number,
  exceptId: number,
) {
  const rows = await db
    .select({ projection: intradaySignals.projection, id: intradaySignals.id })
    .from(intradaySignals)
    .where(
      and(
        eq(intradaySignals.tradingDate, tradingDate),
        eq(intradaySignals.taken, true),
        isNull(intradaySignals.endedAt),
      ),
    );
  let reserved = 0;
  for (const r of rows) {
    if (r.id === exceptId || r.projection.fill === null) continue;
    reserved += r.projection.fill * r.projection.remainingShares;
  }
  return Math.max(0, capitalPaise - reserved);
}

/**
 * Record one sampled quote and advance every live signal on that instrument.
 * Quote ingestion and the projections share the instrument lock, so a
 * restart or retry cannot apply an observation twice or out of order.
 */
export async function observeIntradayPrice(
  db: Database,
  instrumentId: number,
  observation: Omit<IntradayObservation, 'continuous'>,
  bid: number | null,
  ask: number | null,
  book: { capitalPaise: number; riskBps: number },
  config: OrbConfig = ORB_CONFIG,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK}, ${instrumentId})`);
    const [prior] = await tx
      .select()
      .from(signalQuotes)
      .where(eq(signalQuotes.instrumentId, instrumentId));
    if (prior && observation.at <= prior.observedAt.getTime()) return;
    const continuous = Boolean(
      prior &&
        observation.receivedAt - prior.receivedAt.getTime() <= config.coverageGapMs &&
        observation.at - prior.observedAt.getTime() <= config.coverageGapMs &&
        observation.at >= prior.observedAt.getTime(),
    );
    const value = {
      instrumentId,
      price: observation.price,
      bid,
      ask,
      observedAt: new Date(observation.at),
      receivedAt: new Date(observation.receivedAt),
      continuous,
    };
    await tx.insert(signalObservations).values(value);
    await tx
      .insert(signalQuotes)
      .values(value)
      .onConflictDoUpdate({ target: signalQuotes.instrumentId, set: value });

    const live = await tx
      .select()
      .from(intradaySignals)
      .where(and(eq(intradaySignals.instrumentId, instrumentId), isNull(intradaySignals.endedAt)));
    for (const row of live) {
      const evidence = intradayEvidenceSchema.parse(row.evidence);
      const previous = intradayProjectionSchema.parse(row.projection);
      const allocation: BookAllocation | null =
        previous.status === 'PENDING' && previous.taken
          ? {
              capitalPaise: book.capitalPaise,
              availablePaise: await availableCash(tx, row.tradingDate, book.capitalPaise, row.id),
              riskBps: book.riskBps,
            }
          : null;
      const next = stepProjection(
        evidence,
        previous,
        { ...observation, continuous },
        allocation,
        config,
      );
      if (next === previous) continue;
      const changed =
        next.status !== previous.status ||
        next.resolution !== previous.resolution ||
        next.exits.length !== previous.exits.length;
      const sequence = row.sequence + (changed ? 1 : 0);
      await tx
        .update(intradaySignals)
        .set({
          projection: next,
          taken: next.taken,
          sequence,
          endedAt: next.endedAt === null ? null : new Date(next.endedAt),
          realisedNetPaise: realisedNet(evidence, next),
        })
        .where(eq(intradaySignals.id, row.id));
      if (changed)
        await tx
          .insert(intradaySignalEvents)
          .values(eventRow(row.id, sequence, next, observation.receivedAt));
    }
  });
}

function dto(
  row: typeof intradaySignals.$inferSelect,
  quote: typeof signalQuotes.$inferSelect | null | undefined,
): IntradaySignalDto {
  const evidence = row.evidence;
  const projection = row.projection;
  return intradaySignalDtoSchema.parse({
    id: row.id,
    instrumentId: row.instrumentId,
    symbol: row.symbol,
    companyName: row.companyName,
    strategyVersionId: row.strategyVersionId,
    publishedAt: row.publishedAt.getTime(),
    evidence,
    projection,
    lastPrice: quote?.price ?? null,
    quoteAt: quote?.observedAt.getTime() ?? null,
    realisedNetPaise: realisedNet(evidence, projection),
    markNetPaise: markNet(evidence, projection, quote?.price ?? null),
    initialRiskPaise: initialRisk(evidence, projection),
  });
}

/** Every signal of a session, newest first, with the latest sampled price. */
export async function listIntradaySignals(
  db: Database,
  tradingDate: string,
): Promise<IntradaySignalDto[]> {
  const rows = await db
    .select({ signal: intradaySignals, quote: signalQuotes })
    .from(intradaySignals)
    .leftJoin(signalQuotes, eq(signalQuotes.instrumentId, intradaySignals.instrumentId))
    .where(eq(intradaySignals.tradingDate, tradingDate))
    .orderBy(desc(intradaySignals.publishedAt), desc(intradaySignals.id));
  return rows.map((r) => dto(r.signal, r.quote));
}

/** The shared book's position for the session, derived from the signals. */
export function intradayBookFromSignals(
  signals: readonly IntradaySignalDto[],
  capitalPaise: number,
  config: OrbConfig = ORB_CONFIG,
): IntradayBook {
  const taken = signals.filter(
    (s) => s.projection.taken || (s.projection.shares > 0 && s.projection.fill !== null),
  );
  const open = taken.filter((s) => s.projection.endedAt === null && s.projection.fill !== null);
  const realised = taken.reduce((sum, s) => sum + (s.realisedNetPaise ?? 0), 0);
  let mark: number | null = realised;
  for (const s of open) {
    if (s.markNetPaise === null || s.projection.resolution === 'UNAVAILABLE') {
      mark = null;
      break;
    }
    mark += s.markNetPaise - (s.realisedNetPaise ?? 0);
  }
  return {
    capitalPaise,
    riskBps: config.riskBps,
    tradesToday: taken.length,
    openTrades: open.length,
    maxTradesPerDay: config.maxTradesPerDay,
    maxOpenTrades: config.maxOpenTrades,
    realisedNetPaise: realised,
    markNetPaise: mark,
    lossHalted:
      (mark ?? realised) <= -Math.floor((capitalPaise * config.dailyLossHaltBps) / 10_000),
  };
}

export async function recordIntradayExclusion(
  db: Database,
  input: {
    instrumentId: number;
    tradingDate: string;
    symbol: string;
    reason: IntradayRejectReason;
    detail?: string | undefined;
    at: number;
  },
) {
  await db
    .insert(intradaySessionExclusions)
    .values({
      instrumentId: input.instrumentId,
      tradingDate: input.tradingDate,
      symbol: input.symbol,
      reason: input.reason,
      detail: input.detail ?? null,
      recordedAt: new Date(input.at),
    })
    .onConflictDoNothing();
}
export async function listIntradayExclusions(db: Database, tradingDate: string) {
  return db
    .select({
      symbol: intradaySessionExclusions.symbol,
      reason: intradaySessionExclusions.reason,
      detail: intradaySessionExclusions.detail,
    })
    .from(intradaySessionExclusions)
    .where(eq(intradaySessionExclusions.tradingDate, tradingDate))
    .orderBy(asc(intradaySessionExclusions.symbol));
}

export async function recordIntradayScan(db: Database, snapshot: IntradayScannerSnapshot) {
  await db.insert(intradayScanRuns).values({ snapshot });
}
export async function latestIntradayScan(db: Database) {
  const [row] = await db
    .select()
    .from(intradayScanRuns)
    .orderBy(desc(intradayScanRuns.id))
    .limit(1);
  return row?.snapshot ?? null;
}
export async function withIntradayScanLock(db: Database, run: (db: Database) => Promise<void>) {
  await db.transaction(async (tx) => {
    const result = await tx.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_xact_lock(${LOCK}, 0) as acquired`,
    );
    if (result.rows[0]?.acquired) await run(db);
  });
}

/**
 * Clock-driven closure after the session: anything still live had no covered
 * observation to square it off, so it ends UNAVAILABLE — never with an
 * invented exit or result.
 */
export async function reconcileIntradayDeadlines(db: Database, now: number): Promise<void> {
  const rows = await db.select().from(intradaySignals).where(isNull(intradaySignals.endedAt));
  for (const row of rows) {
    const sessionEnd = sessionOpen(row.publishedAt).getTime() + SESSION_MS;
    if (now <= sessionEnd + 15_000) continue;
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${LOCK}, ${row.instrumentId})`);
      const [current] = await tx
        .select()
        .from(intradaySignals)
        .where(eq(intradaySignals.id, row.id))
        .for('update');
      if (
        !current ||
        current.endedAt !== null ||
        terminalIntradayStatuses.includes(current.projection.status)
      )
        return;
      const pending = current.projection.status === 'PENDING';
      const projection: IntradayProjection = {
        ...current.projection,
        cursor: now,
        status: pending ? 'SKIPPED' : 'CLOSED_EOD',
        endedAt: now,
        resolution: 'UNAVAILABLE',
        reason: pending
          ? 'Session ended without an observed next price; no simulated entry recorded.'
          : 'Session ended without a covered square-off observation; the result stays unresolved.',
      };
      const sequence = current.sequence + 1;
      await tx
        .update(intradaySignals)
        .set({ projection, sequence, endedAt: new Date(now) })
        .where(eq(intradaySignals.id, row.id));
      await tx.insert(intradaySignalEvents).values(eventRow(row.id, sequence, projection, now));
    });
  }
}

/** Convenience for the API: the IST trading date of an instant. */
export const intradayTradingDate = (at: number) => istDateKey(new Date(at));
