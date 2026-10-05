import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { eventLog } from '../schema/index.js';

/**
 * The durable event log (docs/planning/logging-plan.md).
 *
 * One record of what is worth acting on, auditing, or using to explain an
 * incident: who did what to an account, which worker jobs failed, and the market-data
 * credential lifecycle. It is not an access log and not a debug log; routine
 * success is deliberately not written.
 *
 * Append-only (a trigger rejects UPDATE and DELETE), so there is no edit or delete
 * here. `detail` must never carry a password, token, TOTP seed or other secret.
 */

export const EVENT_CATEGORIES = ['auth', 'account', 'admin', 'worker', 'provider'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const ACTOR_TYPES = ['user', 'worker', 'system'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export interface EventInput {
  readonly category: EventCategory;
  readonly event: string;
  readonly actorType: ActorType;
  readonly userId?: number | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly detail?: Record<string, unknown> | null;
}

/** Appends one event. Callers treat this as best-effort and never let it fail a request or job. */
export async function logEvent(db: Database, entry: EventInput): Promise<void> {
  await db.insert(eventLog).values({
    category: entry.category,
    actorType: entry.actorType,
    event: entry.event,
    userId: entry.userId ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
    detail: entry.detail ?? null,
  });
}

const ACCOUNT_EVENTS: ReadonlySet<string> = new Set([
  'password_changed',
  'password_reset',
  'password_reset_requested',
  'email_change_requested',
  'email_changed',
  'verification_resent',
  'account_deleted',
  'identity_linked',
  'identity_unlinked',
  'session_revoked',
  'sessions_revoked_others',
  'mfa_enabled',
  'mfa_disabled',
]);

/**
 * The category an existing audit call belongs to. Lets the original `writeAudit`
 * call sites keep working unchanged while their rows land in the right place.
 */
export function categoryForEvent(event: string): EventCategory {
  if (event.startsWith('admin_') || event === 'role_changed') return 'admin';
  if (ACCOUNT_EVENTS.has(event)) return 'account';
  return 'auth';
}

export interface EventFilter {
  readonly category?: EventCategory;
  readonly event?: string;
  readonly userId?: number;
  /** Inclusive lower bound. */
  readonly from?: Date;
  /** Exclusive upper bound. */
  readonly to?: Date;
  /** Return events strictly older than this id (keyset pagination, newest first). */
  readonly beforeId?: number;
  readonly limit?: number;
}

export interface EventRow {
  readonly id: number;
  readonly at: Date;
  readonly category: string;
  readonly actorType: string;
  readonly event: string;
  readonly userId: number | null;
  readonly ipAddress: string | null;
  readonly detail: unknown;
}

/** Newest first. Read-only; backs the admin log viewer. */
export async function listEvents(db: Database, filter: EventFilter = {}): Promise<EventRow[]> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const conditions = [
    filter.category === undefined ? undefined : eq(eventLog.category, filter.category),
    filter.event === undefined ? undefined : eq(eventLog.event, filter.event),
    filter.userId === undefined ? undefined : eq(eventLog.userId, filter.userId),
    filter.from === undefined ? undefined : gte(eventLog.at, filter.from),
    filter.to === undefined ? undefined : lt(eventLog.at, filter.to),
    filter.beforeId === undefined ? undefined : lt(eventLog.id, filter.beforeId),
  ].filter((condition) => condition !== undefined);

  return db
    .select({
      id: eventLog.id,
      at: eventLog.at,
      category: eventLog.category,
      actorType: eventLog.actorType,
      event: eventLog.event,
      userId: eventLog.userId,
      ipAddress: eventLog.ipAddress,
      detail: eventLog.detail,
    })
    .from(eventLog)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(eventLog.id))
    .limit(limit);
}

/** Distinct event names seen in a category, for the viewer's filter. */
export async function listEventNames(db: Database, category?: EventCategory): Promise<string[]> {
  const rows = await db
    .selectDistinct({ event: eventLog.event })
    .from(eventLog)
    .where(category === undefined ? undefined : eq(eventLog.category, category))
    .orderBy(sql`${eventLog.event}`)
    .limit(100);
  return rows.map((row) => row.event);
}
