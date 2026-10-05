import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { alertEvents, alerts, authUsers, dailyIndicators, instruments } from '../schema/index.js';

/**
 * Alert rules and the events they produce.
 *
 * The owner-facing functions all take `ownerId` and scope every statement by it —
 * that is what keeps one user's rules out of another's reach. The `*ForWorker`
 * functions span owners on purpose: the worker evaluates every user's rules and is
 * the only caller.
 */

/** A free user's ceiling. Rules are evaluated nightly, so the cost is small; this stops abuse. */
export const MAX_ALERTS_PER_USER = 25;

export interface AlertRow {
  readonly id: number;
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly metric: string;
  readonly comparator: string;
  readonly threshold: number;
  readonly enabled: boolean;
  readonly oneShot: boolean;
  readonly createdAt: Date;
  readonly lastTriggeredAt: Date | null;
}

export interface AlertEventRow {
  readonly id: number;
  readonly alertId: number;
  readonly symbol: string;
  readonly tradingDate: string;
  readonly observedValue: number;
  readonly metric: string;
  readonly message: string;
  readonly triggeredAt: Date;
  readonly acknowledgedAt: Date | null;
}

export async function listAlerts(db: Database, ownerId: number): Promise<AlertRow[]> {
  return db
    .select({
      id: alerts.id,
      instrumentId: alerts.instrumentId,
      symbol: instruments.symbol,
      name: instruments.name,
      metric: alerts.metric,
      comparator: alerts.comparator,
      threshold: alerts.threshold,
      enabled: alerts.enabled,
      oneShot: alerts.oneShot,
      createdAt: alerts.createdAt,
      lastTriggeredAt: alerts.lastTriggeredAt,
    })
    .from(alerts)
    .innerJoin(instruments, eq(instruments.id, alerts.instrumentId))
    .where(eq(alerts.ownerId, ownerId))
    .orderBy(desc(alerts.createdAt), desc(alerts.id));
}

export type CreateAlertResult = { ok: true; id: number } | { ok: false; reason: 'limit_reached' };

/** Creates a rule unless the owner is already at the ceiling. */
export async function createAlert(
  db: Database,
  ownerId: number,
  input: {
    instrumentId: number;
    metric: string;
    comparator: string;
    threshold: number;
    oneShot: boolean;
  },
): Promise<CreateAlertResult> {
  return db.transaction(async (tx) => {
    // Serialise one owner's creations so two requests cannot both pass the count.
    await tx.execute(sql`select pg_advisory_xact_lock(${ownerId}::int, 104)`);
    const [counted] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(alerts)
      .where(eq(alerts.ownerId, ownerId));
    if ((counted?.count ?? 0) >= MAX_ALERTS_PER_USER) return { ok: false, reason: 'limit_reached' };
    const [row] = await tx
      .insert(alerts)
      .values({ ownerId, ...input })
      .returning({ id: alerts.id });
    if (row === undefined) throw new Error('Alert insert returned no row.');
    return { ok: true, id: row.id };
  });
}

export async function setAlertEnabled(
  db: Database,
  ownerId: number,
  id: number,
  enabled: boolean,
): Promise<boolean> {
  const rows = await db
    .update(alerts)
    .set({ enabled })
    .where(and(eq(alerts.id, id), eq(alerts.ownerId, ownerId)))
    .returning({ id: alerts.id });
  return rows.length > 0;
}

export async function deleteAlert(db: Database, ownerId: number, id: number): Promise<boolean> {
  const rows = await db
    .delete(alerts)
    .where(and(eq(alerts.id, id), eq(alerts.ownerId, ownerId)))
    .returning({ id: alerts.id });
  return rows.length > 0;
}

export async function listAlertEvents(
  db: Database,
  ownerId: number,
  limit = 50,
): Promise<AlertEventRow[]> {
  return db
    .select({
      id: alertEvents.id,
      alertId: alertEvents.alertId,
      symbol: instruments.symbol,
      tradingDate: alertEvents.tradingDate,
      observedValue: alertEvents.observedValue,
      metric: alerts.metric,
      message: alertEvents.message,
      triggeredAt: alertEvents.triggeredAt,
      acknowledgedAt: alertEvents.acknowledgedAt,
    })
    .from(alertEvents)
    .innerJoin(alerts, eq(alerts.id, alertEvents.alertId))
    .innerJoin(instruments, eq(instruments.id, alerts.instrumentId))
    .where(eq(alertEvents.ownerId, ownerId))
    .orderBy(desc(alertEvents.triggeredAt), desc(alertEvents.id))
    .limit(limit);
}

export async function countUnacknowledgedAlertEvents(
  db: Database,
  ownerId: number,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(alertEvents)
    .where(and(eq(alertEvents.ownerId, ownerId), isNull(alertEvents.acknowledgedAt)));
  return row?.count ?? 0;
}

export async function acknowledgeAlertEvents(db: Database, ownerId: number): Promise<number> {
  const rows = await db
    .update(alertEvents)
    .set({ acknowledgedAt: new Date() })
    .where(and(eq(alertEvents.ownerId, ownerId), isNull(alertEvents.acknowledgedAt)))
    .returning({ id: alertEvents.id });
  return rows.length;
}

// ── Worker side: spans owners ─────────────────────────────────────────────────

export interface EnabledAlert {
  readonly id: number;
  readonly ownerId: number;
  readonly ownerEmail: string;
  readonly instrumentId: number;
  readonly symbol: string;
  readonly metric: string;
  readonly comparator: string;
  readonly threshold: number;
  readonly oneShot: boolean;
}

/** Every enabled rule of every active account. */
export async function listEnabledAlertsForWorker(db: Database): Promise<EnabledAlert[]> {
  return db
    .select({
      id: alerts.id,
      ownerId: alerts.ownerId,
      ownerEmail: authUsers.email,
      instrumentId: alerts.instrumentId,
      symbol: instruments.symbol,
      metric: alerts.metric,
      comparator: alerts.comparator,
      threshold: alerts.threshold,
      oneShot: alerts.oneShot,
    })
    .from(alerts)
    .innerJoin(authUsers, eq(authUsers.id, alerts.ownerId))
    .innerJoin(instruments, eq(instruments.id, alerts.instrumentId))
    .where(and(eq(alerts.enabled, true), eq(authUsers.status, 'active')));
}

export interface AlertSession {
  readonly instrumentId: number;
  readonly tradingDate: string;
  readonly closePaise: number;
  readonly rsi14: number | null;
}

/**
 * The most recent two closed sessions on or before `onOrBefore` for each
 * instrument, newest first. Two are all a crossing needs.
 */
export async function getLatestTwoSessions(
  db: Database,
  instrumentIds: readonly number[],
  onOrBefore: string,
): Promise<Map<number, AlertSession[]>> {
  const result = new Map<number, AlertSession[]>();
  if (instrumentIds.length === 0) return result;
  const rows = await db
    .select({
      instrumentId: dailyIndicators.instrumentId,
      tradingDate: dailyIndicators.tradingDate,
      closePaise: dailyIndicators.close,
      rsi14: dailyIndicators.rsi14,
    })
    .from(dailyIndicators)
    .where(
      and(
        inArray(dailyIndicators.instrumentId, [...instrumentIds]),
        lte(dailyIndicators.tradingDate, onOrBefore),
        // Bound the scan: a fortnight always holds two sessions.
        sql`${dailyIndicators.tradingDate} >= (${onOrBefore}::date - interval '14 days')`,
      ),
    )
    .orderBy(desc(dailyIndicators.tradingDate));
  for (const row of rows) {
    const list = result.get(row.instrumentId) ?? [];
    if (list.length < 2) list.push(row);
    result.set(row.instrumentId, list);
  }
  return result;
}

/** The newest trading date that has indicator rows, or null before the first run. */
export async function getLatestIndicatorDate(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ tradingDate: sql<string | null>`max(${dailyIndicators.tradingDate})` })
    .from(dailyIndicators);
  return row?.tradingDate ?? null;
}

export interface AlertFiring {
  readonly alertId: number;
  readonly ownerId: number;
  readonly tradingDate: string;
  readonly observedValue: number;
  readonly message: string;
  readonly oneShot: boolean;
}

/**
 * Records a firing exactly once per rule per session. Returns the new event id,
 * or null when that session already fired (a re-run). A one-shot rule is switched
 * off in the same transaction.
 */
export async function recordAlertFiring(db: Database, firing: AlertFiring): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .insert(alertEvents)
      .values({
        alertId: firing.alertId,
        ownerId: firing.ownerId,
        tradingDate: firing.tradingDate,
        observedValue: firing.observedValue,
        message: firing.message,
      })
      .onConflictDoNothing()
      .returning({ id: alertEvents.id });
    if (event === undefined) return null;
    await tx
      .update(alerts)
      .set({
        lastTriggeredAt: new Date(),
        ...(firing.oneShot ? { enabled: false } : {}),
      })
      .where(eq(alerts.id, firing.alertId));
    return event.id;
  });
}

export async function markAlertsEvaluated(
  db: Database,
  alertIds: readonly number[],
  tradingDate: string,
): Promise<void> {
  if (alertIds.length === 0) return;
  await db
    .update(alerts)
    .set({ lastEvaluatedDate: tradingDate })
    .where(inArray(alerts.id, [...alertIds]));
}

export async function markAlertEventEmailed(db: Database, eventId: number): Promise<void> {
  await db.update(alertEvents).set({ emailedAt: new Date() }).where(eq(alertEvents.id, eventId));
}
