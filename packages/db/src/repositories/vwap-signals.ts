import { createHash } from 'node:crypto';
import {
  aggregateClosedMinutes,
  estimatedFill,
  PAPER_COSTS,
  type PriceObservation,
  paperCharges,
  paperInitialRisk,
  paperNet,
  paperPerformance,
  pendingProjection,
  sizePaperStudy,
  updateSignalStatus,
  VWAP_CONFIG,
} from '@equitywise/core';
import {
  evidenceSchema,
  istDateKey,
  type PaperDto,
  type PaperRequest,
  projectionSchema,
  type ScannerSnapshot,
  type SignalEvidence,
  type SignalProjection,
  type SignalQuery,
  sessionOpen,
  signalDetailSchema,
  signalDtoSchema,
  signalListSchema,
  signalSummarySchema,
} from '@equitywise/shared';
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { instruments } from '../schema/instruments.js';
import {
  minuteCandles,
  paperEquityMarks,
  paperStudies,
  paperStudyEvents,
  signalObservations,
  signalQuotes,
  signalScanRuns,
  vwapSignalEvents,
  vwapSignals,
} from '../schema/vwap-signals.js';
import { watchlistItems, watchlists } from '../schema/watchlists.js';

export class SignalConflict extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = 'SignalConflict';
  }
}
type Candle = typeof minuteCandles.$inferInsert;
export async function insertSignalMinutes(db: Database, rows: readonly Candle[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 1000)
    await db
      .insert(minuteCandles)
      .values(rows.slice(i, i + 1000))
      .onConflictDoNothing();
}
export async function getSignalMinutes(
  db: Database,
  instrumentId: number,
  from: number,
  to: number,
) {
  const rows = await db
    .select()
    .from(minuteCandles)
    .where(
      and(
        eq(minuteCandles.instrumentId, instrumentId),
        gte(minuteCandles.ts, new Date(from)),
        sql`${minuteCandles.ts} < ${new Date(to)}`,
      ),
    )
    .orderBy(asc(minuteCandles.ts));
  return rows.map((r) => ({
    timestamp: r.ts.getTime(),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));
}
/** Uses the mandated exchange-aligned time_bucket. Incomplete groups are omitted. */
export async function getSignalBars(db: Database, instrumentId: number, from: number, now: number) {
  const result = await db.execute<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: string;
  }>(sql`
    SELECT extract(epoch FROM bucket)*1000 AS timestamp, (array_agg(open ORDER BY ts))[1] AS open,
      max(high)::integer AS high, min(low)::integer AS low, (array_agg(close ORDER BY ts DESC))[1] AS close, sum(volume)::text AS volume
    FROM (SELECT *, time_bucket('5 minutes', ts, TIMESTAMPTZ '2000-01-01 03:45:00+00') AS bucket
      FROM minute_candles WHERE instrument_id=${instrumentId} AND ts >= ${new Date(from)} AND ts < ${new Date(now)}) b
    WHERE bucket + interval '5 minutes' <= ${new Date(now)} AND (ts AT TIME ZONE 'Asia/Kolkata')::time >= time '09:15'
      AND (ts AT TIME ZONE 'Asia/Kolkata')::time < time '15:30'
    GROUP BY bucket HAVING count(*)=5 AND min(ts)=bucket AND max(ts)=bucket+interval '4 minutes' ORDER BY bucket`);
  return result.rows.map((r) => ({
    timestamp: Number(r.timestamp),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: Number(r.volume),
  }));
}
export async function recordSignalScan(db: Database, snapshot: ScannerSnapshot) {
  await db.insert(signalScanRuns).values({ snapshot });
}
export async function latestSignalScan(db: Database) {
  const [row] = await db.select().from(signalScanRuns).orderBy(desc(signalScanRuns.id)).limit(1);
  return row?.snapshot ?? null;
}
function event(signalId: number, sequence: number, p: SignalProjection, recordedAt: number) {
  return {
    signalId,
    sequence,
    state: p.state,
    effectiveAt: new Date(p.cursor),
    recordedAt: new Date(recordedAt),
    reason: p.reason,
    price: p.exit ?? p.fill,
    resolution: p.resolution,
  };
}
export async function publishVwapSignal(
  db: Database,
  input: {
    instrumentId: number;
    strategyVersionId: number;
    symbol: string;
    companyName: string;
    sector: string;
    publishedAt: number;
    clock?: () => number;
    evidence: SignalEvidence;
  },
): Promise<boolean> {
  const evidence = evidenceSchema.parse(input.evidence);
  const { publishedAt } = input;
  const session = sessionOpen(new Date(evidence.confirmationAt)).getTime();
  if (
    publishedAt < evidence.confirmationAt ||
    publishedAt - evidence.confirmationAt > 30_000 ||
    publishedAt >= session + 345 * 60_000
  )
    return false;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(801, ${input.instrumentId})`);
    const publishedAt = input.clock?.() ?? input.publishedAt;
    if (
      publishedAt < evidence.confirmationAt ||
      publishedAt - evidence.confirmationAt > 30_000 ||
      publishedAt >= session + 345 * 60_000
    )
      return false;
    const observations = await tx
      .select()
      .from(signalObservations)
      .where(
        and(
          eq(signalObservations.instrumentId, input.instrumentId),
          gte(signalObservations.observedAt, new Date(evidence.confirmationAt - 15_000)),
          sql`${signalObservations.observedAt} <= ${new Date(publishedAt)}`,
          sql`${signalObservations.receivedAt} <= ${new Date(publishedAt)}`,
        ),
      )
      .orderBy(asc(signalObservations.observedAt));
    const first = observations[0];
    const last = observations.at(-1);
    const sign = evidence.direction === 'BUY' ? 1 : -1;
    // Declared sampled-observation coverage: never re-publish a trigger already seen after confirmation.
    if (
      !first ||
      !last ||
      last.bid === null ||
      last.ask === null ||
      last.bid <= 0 ||
      last.ask < last.bid ||
      ((last.ask - last.bid) * 20_000) / (last.ask + last.bid) > VWAP_CONFIG.maxSpreadBps ||
      first.observedAt.getTime() > evidence.confirmationAt ||
      last.observedAt.getTime() < evidence.confirmationAt ||
      publishedAt - last.observedAt.getTime() > 5000 ||
      observations.some(
        (o) =>
          o.observedAt.getTime() >= evidence.confirmationAt &&
          (!o.continuous ||
            sign * (o.price - evidence.levels.trigger) >= 0 ||
            sign * (o.price - evidence.levels.invalidation) <= 0),
      )
    )
      return false;
    const existing = await tx
      .select()
      .from(vwapSignals)
      .where(
        and(
          eq(vwapSignals.instrumentId, input.instrumentId),
          eq(vwapSignals.tradingDate, evidence.sessionDate),
        ),
      );
    if (existing.length >= 2 || existing.some((r) => r.endedAt === null)) return false;
    const dedupeKey = `${input.instrumentId}:${evidence.sessionDate}:${input.strategyVersionId}:${evidence.direction}:${evidence.confirmationAt}`;
    const projection = pendingProjection(publishedAt);
    const [row] = await tx
      .insert(vwapSignals)
      .values({
        instrumentId: input.instrumentId,
        strategyVersionId: input.strategyVersionId,
        symbol: input.symbol,
        companyName: input.companyName,
        sector: input.sector,
        tradingDate: evidence.sessionDate,
        dedupeKey,
        publishedAt: new Date(publishedAt),
        expiresAt: new Date(Math.min(evidence.confirmationAt + 900_000, session + 345 * 60_000)),
        evidence,
        projection,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) return false;
    await tx.insert(vwapSignalEvents).values(event(row.id, 1, projection, publishedAt));
    return true;
  });
}
/** Quote ingestion and all projections share an instrument lock, so a restart/retry cannot duplicate events. */
export async function observeSignalPrice(
  db: Database,
  instrumentId: number,
  observation: Omit<PriceObservation, 'continuous'>,
  bid: number | null,
  ask: number | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(801, ${instrumentId})`);
    const [prior] = await tx
      .select()
      .from(signalQuotes)
      .where(eq(signalQuotes.instrumentId, instrumentId));
    if (prior && observation.at <= prior.observedAt.getTime()) return;
    const continuous = Boolean(
      prior &&
        observation.receivedAt - prior.receivedAt.getTime() <= 15_000 &&
        observation.at - prior.observedAt.getTime() <= 15_000 &&
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
    const active = await tx
      .select()
      .from(vwapSignals)
      .where(and(eq(vwapSignals.instrumentId, instrumentId), isNull(vwapSignals.endedAt)));
    for (const row of active) {
      const next = updateSignalStatus(
        evidenceSchema.parse(row.evidence),
        projectionSchema.parse(row.projection),
        { ...observation, continuous },
        row.expiresAt.getTime(),
      );
      const changed =
        next.state !== row.projection.state || next.resolution !== row.projection.resolution;
      const sequence = row.sequence + (changed ? 1 : 0);
      await tx
        .update(vwapSignals)
        .set({
          projection: next,
          sequence,
          endedAt: next.endedAt === null ? null : new Date(next.endedAt),
        })
        .where(eq(vwapSignals.id, row.id));
      if (changed)
        await tx
          .insert(vwapSignalEvents)
          .values(event(row.id, sequence, next, observation.receivedAt));
    }
    // Personal studies continue independently, even after the shared projection ended.
    const papers = await tx
      .select({ study: paperStudies, signal: vwapSignals })
      .from(paperStudies)
      .innerJoin(vwapSignals, eq(paperStudies.signalId, vwapSignals.id))
      .where(and(eq(vwapSignals.instrumentId, instrumentId), isNull(paperStudies.endedAt)));
    for (const { study, signal } of papers) {
      let next = updateSignalStatus(
        signal.evidence,
        study.projection,
        { ...observation, continuous },
        signal.expiresAt.getTime(),
        { slippageBps: study.costs.slippageBps, moveToBreakeven: study.moveToBreakeven },
      );
      if (study.projection.fill === null && next.fill !== null) {
        const loss = -paperNet(
          signal.evidence.direction,
          next.fill,
          estimatedFill(
            signal.evidence.levels.invalidation,
            signal.evidence.levels.tickSize,
            signal.evidence.direction,
            false,
            study.costs,
          ),
          study.sizing.shares,
          study.costs,
        );
        if (
          loss > Math.floor((study.capitalPaise * study.riskBps) / 10_000) ||
          Math.max(next.fill, signal.evidence.levels.invalidation) * study.sizing.shares +
            paperCharges(
              Math.max(next.fill, signal.evidence.levels.invalidation),
              Math.max(next.fill, signal.evidence.levels.invalidation),
              study.sizing.shares,
              study.costs,
            ) >
            study.sizing.capitalRequired
        )
          next = {
            ...next,
            fill: null,
            state: 'INVALIDATED',
            endedAt: observation.at,
            reason: 'Gap exceeded the reserved paper budget.',
          };
      }
      const changed =
        next.state !== study.projection.state || next.resolution !== study.projection.resolution;
      const sequence = study.sequence + (changed ? 1 : 0);
      const netPaise =
        next.fill !== null && next.exit !== null && next.resolution === 'OBSERVED'
          ? paperNet(
              signal.evidence.direction,
              next.fill,
              next.exit,
              study.sizing.shares,
              study.costs,
            )
          : null;
      await tx
        .update(paperStudies)
        .set({
          projection: next,
          sequence,
          endedAt: next.endedAt === null ? null : new Date(next.endedAt),
          netPaise,
        })
        .where(eq(paperStudies.id, study.id));
      if (changed)
        await tx.insert(paperStudyEvents).values({
          studyId: study.id,
          sequence,
          projection: next,
          at: new Date(observation.receivedAt),
          netPaise,
        });
    }
  });
}
function dto(
  row: typeof vwapSignals.$inferSelect,
  quote?: typeof signalQuotes.$inferSelect | null,
) {
  return signalDtoSchema.parse({
    id: row.id,
    instrumentId: row.instrumentId,
    symbol: row.symbol,
    companyName: row.companyName,
    sector: row.sector,
    strategyVersionId: row.strategyVersionId,
    publishedAt: row.publishedAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    evidence: row.evidence,
    projection: row.projection,
    lastPrice: quote?.price ?? null,
    quoteAt: quote?.observedAt.getTime() ?? null,
  });
}
export async function listVwapSignals(
  db: Database,
  userId: number,
  query: SignalQuery,
  now: number,
) {
  return db.transaction(
    async (tx) => {
      const owned = await tx
        .select({ id: watchlists.id, name: watchlists.name })
        .from(watchlists)
        .where(eq(watchlists.ownerId, userId));
      if (query.watchlistId !== undefined && !owned.some((w) => w.id === query.watchlistId))
        throw new SignalConflict('Watchlist not found.', 404);
      const where = [
        gte(vwapSignals.publishedAt, new Date(query.from ?? sessionOpen(new Date(now)))),
      ];
      if (query.to) where.push(sql`${vwapSignals.publishedAt} <= ${new Date(query.to)}`);
      if (query.symbol)
        where.push(
          sql`position(${query.symbol.toUpperCase()} in upper(${vwapSignals.symbol})) > 0`,
        );
      if (query.direction)
        where.push(sql`${vwapSignals.evidence}->>'direction' = ${query.direction}`);
      if (query.status) where.push(sql`${vwapSignals.projection}->>'state' = ${query.status}`);
      if (query.sector) where.push(eq(vwapSignals.sector, query.sector));
      where.push(sql`(${vwapSignals.evidence}->>'score')::integer >= ${query.minimumScore}`);
      if (query.watchlistId)
        where.push(
          sql`${vwapSignals.instrumentId} in (select ${watchlistItems.instrumentId} from ${watchlistItems} where ${watchlistItems.watchlistId}=${query.watchlistId})`,
        );
      const sort =
        query.sortBy === 'score'
          ? sql`(${vwapSignals.evidence}->>'score')::integer`
          : query.sortBy === 'symbol'
            ? vwapSignals.symbol
            : vwapSignals.publishedAt;
      const rows = await tx
        .select({ signal: vwapSignals, quote: signalQuotes })
        .from(vwapSignals)
        .leftJoin(signalQuotes, eq(vwapSignals.instrumentId, signalQuotes.instrumentId))
        .where(and(...where))
        .orderBy(query.sortDirection === 'asc' ? asc(sort) : desc(sort), desc(vwapSignals.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const [count] = await tx
        .select({ total: sql<number>`count(*)::integer` })
        .from(vwapSignals)
        .where(and(...where));
      const [scan] = await tx
        .select()
        .from(signalScanRuns)
        .orderBy(desc(signalScanRuns.id))
        .limit(1);
      return signalListSchema.parse({
        signals: rows.map((r) => dto(r.signal, r.quote)),
        total: count?.total ?? 0,
        scanner: scan?.snapshot ?? null,
        asOf: now,
        watchlists: owned,
      });
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
export async function getVwapSignal(db: Database, id: number, now: number) {
  return db.transaction(
    async (tx) => {
      const [row] = await tx
        .select({ signal: vwapSignals, quote: signalQuotes })
        .from(vwapSignals)
        .leftJoin(signalQuotes, eq(vwapSignals.instrumentId, signalQuotes.instrumentId))
        .where(eq(vwapSignals.id, id));
      if (!row) throw new SignalConflict('Signal not found.', 404);
      const events = await tx
        .select()
        .from(vwapSignalEvents)
        .where(eq(vwapSignalEvents.signalId, id))
        .orderBy(asc(vwapSignalEvents.sequence));
      const open = sessionOpen(row.signal.publishedAt).getTime();
      const minutes = await getSignalMinutes(
        db,
        row.signal.instrumentId,
        open,
        Math.min(now, open + 375 * 60_000),
      );
      return signalDetailSchema.parse({
        signal: dto(row.signal, row.quote),
        events: events.map((e) => ({
          ...e,
          effectiveAt: e.effectiveAt.getTime(),
          recordedAt: e.recordedAt.getTime(),
        })),
        bars: aggregateClosedMinutes(minutes, now),
      });
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
export async function createPaperStudy(
  db: Database,
  userId: number,
  request: PaperRequest,
  now: number,
  clock?: () => number,
) {
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        signalId: request.signalId,
        capitalPaise: request.capitalPaise,
        riskBps: request.riskBps,
        moveToBreakeven: request.moveToBreakeven,
      }),
    )
    .digest('hex');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(802, ${userId})`);
    const [existing] = await tx
      .select()
      .from(paperStudies)
      .where(
        and(
          eq(paperStudies.userId, userId),
          eq(paperStudies.idempotencyKey, request.idempotencyKey),
        ),
      );
    if (existing) {
      if (existing.requestHash !== hash)
        throw new SignalConflict('This request key was already used with different inputs.');
      return { id: existing.id };
    }
    const [signal] = await tx
      .select()
      .from(vwapSignals)
      .where(eq(vwapSignals.id, request.signalId))
      .for('update');
    if (!signal) throw new SignalConflict('Signal not found.', 404);
    const [quote] = await tx
      .select()
      .from(signalQuotes)
      .where(eq(signalQuotes.instrumentId, signal.instrumentId));
    // Lock contention must not backdate enrolment or its freshness decision.
    now = clock?.() ?? now;
    if (
      signal.projection.state !== 'ENTRY_PENDING' ||
      signal.projection.resolution !== 'OBSERVED' ||
      now >= signal.expiresAt.getTime() ||
      !quote?.continuous ||
      now - quote.observedAt.getTime() > 15_000 ||
      now < quote.observedAt.getTime()
    )
      throw new SignalConflict('This setup is no longer fresh and pending.');
    const sign = signal.evidence.direction === 'BUY' ? 1 : -1;
    if (sign * (quote.price - signal.evidence.levels.trigger) >= 0)
      throw new SignalConflict('The trigger has already been observed.');
    const previous = await tx.select().from(paperStudies).where(eq(paperStudies.userId, userId));
    if (previous.some((p) => p.signalId === signal.id))
      throw new SignalConflict('This signal is already in your journal.');
    const reserved = previous
      .filter((p) => p.endedAt === null)
      .reduce((s, p) => s + p.sizing.capitalRequired, 0);
    const sizing = sizePaperStudy(
      signal.evidence.levels,
      signal.evidence.direction,
      request.capitalPaise,
      request.riskBps,
      Math.max(0, request.capitalPaise - reserved),
    );
    if (sizing.shares < 1)
      throw new SignalConflict('Available research capital or risk budget is too small.');
    const projection = pendingProjection(now);
    const [study] = await tx
      .insert(paperStudies)
      .values({
        userId,
        signalId: signal.id,
        idempotencyKey: request.idempotencyKey,
        requestHash: hash,
        capitalPaise: request.capitalPaise,
        riskBps: request.riskBps,
        moveToBreakeven: request.moveToBreakeven,
        sizing,
        costs: PAPER_COSTS,
        projection,
        createdAt: new Date(now),
      })
      .returning();
    if (!study) throw new Error('Study insert failed');
    await tx
      .insert(paperStudyEvents)
      .values({ studyId: study.id, sequence: 1, projection, at: new Date(now) });
    return { id: study.id };
  });
}
async function papersForDate(db: Database, userId: number, now: number): Promise<PaperDto[]> {
  const rows = await db
    .select({ study: paperStudies, signal: vwapSignals, quote: signalQuotes })
    .from(paperStudies)
    .innerJoin(vwapSignals, eq(paperStudies.signalId, vwapSignals.id))
    .leftJoin(signalQuotes, eq(signalQuotes.instrumentId, vwapSignals.instrumentId))
    .where(
      and(eq(paperStudies.userId, userId), eq(vwapSignals.tradingDate, istDateKey(new Date(now)))),
    )
    .orderBy(desc(paperStudies.id));
  return rows.map(({ study: p, signal: s, quote: q }) => ({
    id: p.id,
    signalId: p.signalId,
    symbol: s.symbol,
    createdAt: p.createdAt.getTime(),
    sizing: p.sizing,
    projection: p.projection,
    netPaise: p.netPaise,
    initialRisk: paperInitialRisk(s.evidence, p.sizing.shares),
    markNetPaise:
      p.projection.fill !== null &&
      q &&
      now >= q.observedAt.getTime() &&
      now - q.observedAt.getTime() <= 15_000 &&
      p.projection.resolution === 'OBSERVED'
        ? paperNet(s.evidence.direction, p.projection.fill, q.price, p.sizing.shares, p.costs)
        : null,
  }));
}
export async function markPaperEquity(db: Database, now: number) {
  const owners = await db
    .selectDistinct({ userId: paperStudies.userId })
    .from(paperStudies)
    .where(gte(paperStudies.createdAt, sessionOpen(new Date(now))));
  for (const { userId } of owners) {
    const papers = await papersForDate(db, userId, now);
    let net: number | null = 0;
    for (const p of papers) {
      const value = p.netPaise ?? (p.projection.fill === null ? 0 : p.markNetPaise);
      if (value === null || p.projection.resolution === 'UNAVAILABLE') {
        net = null;
        break;
      }
      net += value;
    }
    await db
      .insert(paperEquityMarks)
      .values({ userId, tradingDate: istDateKey(new Date(now)), at: new Date(now), netPaise: net });
  }
}
export async function getSignalSummary(db: Database, userId: number, now: number) {
  return db.transaction(
    async (tx) => {
      const rows = await tx
        .select()
        .from(vwapSignals)
        .where(eq(vwapSignals.tradingDate, istDateKey(new Date(now))));
      const papers = await papersForDate(tx, userId, now);
      const marks = await tx
        .select()
        .from(paperEquityMarks)
        .where(
          and(
            eq(paperEquityMarks.userId, userId),
            eq(paperEquityMarks.tradingDate, istDateKey(new Date(now))),
          ),
        )
        .orderBy(asc(paperEquityMarks.at));
      let peak = 0;
      let drawdown: number | null = marks.length ? 0 : null;
      for (const mark of marks) {
        if (mark.netPaise === null) {
          drawdown = null;
          break;
        }
        peak = Math.max(peak, mark.netPaise);
        drawdown = Math.max(drawdown ?? 0, peak - mark.netPaise);
      }
      return signalSummarySchema.parse({
        asOf: now,
        total: rows.length,
        pending: rows.filter((r) => r.endedAt === null && r.projection.state === 'ENTRY_PENDING')
          .length,
        triggered: rows.filter((r) => r.endedAt === null && r.projection.fill !== null).length,
        stopHits: rows.filter(
          (r) => r.projection.state === 'STOP_LOSS_HIT' && r.projection.resolution === 'OBSERVED',
        ).length,
        active: rows.filter((r) => r.endedAt === null).length,
        closed: rows.filter((r) => r.endedAt !== null).length,
        targetHits: rows.filter(
          (r) => r.projection.target1At !== null && r.projection.resolution === 'OBSERVED',
        ).length,
        papers,
        performance: paperPerformance(papers, drawdown),
      });
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

export async function signalUniverseInstruments(db: Database) {
  return db
    .select({
      id: instruments.id,
      symbol: instruments.symbol,
      kind: instruments.kind,
      tickSize: instruments.tickSize,
    })
    .from(instruments)
    .where(eq(instruments.active, true));
}
export async function getScannerQuote(db: Database, instrumentId: number) {
  const [row] = await db
    .select()
    .from(signalQuotes)
    .where(eq(signalQuotes.instrumentId, instrumentId));
  return row ?? null;
}
export async function withSignalScanLock(db: Database, run: (db: Database) => Promise<void>) {
  await db.transaction(async (tx) => {
    const result = await tx.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_xact_lock(803, 1) as acquired`,
    );
    if (result.rows[0]?.acquired) await run(db);
  });
}

/** Clock events resolve deadlines, not prices. Missing coverage never becomes a simulated outcome. */
export async function reconcileSignalDeadlines(db: Database, now: number): Promise<void> {
  const rows = await db.select().from(vwapSignals).where(isNull(vwapSignals.endedAt));
  for (const row of rows) {
    const sessionEnd = sessionOpen(row.publishedAt).getTime() + 375 * 60_000;
    const expired =
      row.projection.state === 'ENTRY_PENDING' && now >= row.expiresAt.getTime() + 15_000;
    if (!expired && now <= sessionEnd + 15_000) continue;
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(801, ${row.instrumentId})`);
      const [current] = await tx
        .select()
        .from(vwapSignals)
        .where(eq(vwapSignals.id, row.id))
        .for('update');
      if (!current || current.endedAt !== null) return;
      const pending = current.projection.state === 'ENTRY_PENDING';
      if (!pending && now <= sessionEnd + 15_000) return;
      const projection: SignalProjection = {
        ...current.projection,
        cursor: now,
        state: pending ? 'EXPIRED' : 'INVALIDATED',
        endedAt: now,
        resolution: 'UNAVAILABLE',
        reason: pending
          ? 'Pending window ended without complete observation coverage; no simulated fill recorded.'
          : 'Session ended without a covered square-off observation. Research outcome remains unresolved.',
      };
      const sequence = current.sequence + 1;
      await tx
        .update(vwapSignals)
        .set({ projection, sequence, endedAt: new Date(now) })
        .where(eq(vwapSignals.id, row.id));
      await tx.insert(vwapSignalEvents).values(event(row.id, sequence, projection, now));
    });
  }
  const papers = await db
    .select({ study: paperStudies, signal: vwapSignals })
    .from(paperStudies)
    .innerJoin(vwapSignals, eq(paperStudies.signalId, vwapSignals.id))
    .where(isNull(paperStudies.endedAt));
  for (const { study, signal } of papers) {
    const sessionEnd = sessionOpen(signal.publishedAt).getTime() + 375 * 60_000;
    if (
      !(study.projection.state === 'ENTRY_PENDING' && now >= signal.expiresAt.getTime() + 15_000) &&
      now <= sessionEnd + 15_000
    )
      continue;
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(801, ${signal.instrumentId})`);
      const [current] = await tx
        .select()
        .from(paperStudies)
        .where(eq(paperStudies.id, study.id))
        .for('update');
      if (!current || current.endedAt !== null) return;
      const pending = current.projection.state === 'ENTRY_PENDING';
      if (!pending && now <= sessionEnd + 15_000) return;
      const projection: SignalProjection = {
        ...current.projection,
        cursor: now,
        state: pending ? 'EXPIRED' : 'INVALIDATED',
        endedAt: now,
        resolution: 'UNAVAILABLE',
        reason:
          'Research deadline passed without sufficient observations; reserved capital released, P&L unresolved.',
      };
      const sequence = current.sequence + 1;
      await tx
        .update(paperStudies)
        .set({ projection, sequence, endedAt: new Date(now) })
        .where(eq(paperStudies.id, study.id));
      await tx
        .insert(paperStudyEvents)
        .values({ studyId: study.id, sequence, projection, at: new Date(now), netPaise: null });
    });
  }
}
