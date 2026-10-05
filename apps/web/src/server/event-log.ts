import 'server-only';
import { EVENT_CATEGORIES, type EventCategory, listEventNames, listEvents } from '@equitywise/db';
import { z } from 'zod';
import type { EventLogPageDto } from '@/lib/event-log-types';
import { getDatabase } from './db';

/**
 * The read side of the durable event log (docs/planning/logging-plan.md). Admin only;
 * the callers (`/api/admin/logs`, `/admin/logs`) check that. Read-only by
 * construction: the table is append-only and nothing here writes.
 */

export const PAGE_SIZE = 50;

export const eventLogQuerySchema = z.object({
  category: z.enum(EVENT_CATEGORIES).optional(),
  event: z.string().trim().min(1).max(60).optional(),
  userId: z.coerce.number().int().positive().optional(),
  /** `YYYY-MM-DD` (UTC) bounds; `to` is inclusive of that day. */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  beforeId: z.coerce.number().int().positive().optional(),
});

export type EventLogQuery = z.infer<typeof eventLogQuerySchema>;

const dayStart = (key: string): Date => new Date(`${key}T00:00:00.000Z`);
const nextDay = (key: string): Date => new Date(dayStart(key).getTime() + 86_400_000);

export async function getEventLogPage(query: EventLogQuery): Promise<EventLogPageDto> {
  const db = getDatabase();
  // One extra row tells us whether an older page exists.
  const rows = await listEvents(db, {
    ...(query.category === undefined ? {} : { category: query.category as EventCategory }),
    ...(query.event === undefined ? {} : { event: query.event }),
    ...(query.userId === undefined ? {} : { userId: query.userId }),
    ...(query.from === undefined ? {} : { from: dayStart(query.from) }),
    ...(query.to === undefined ? {} : { to: nextDay(query.to) }),
    ...(query.beforeId === undefined ? {} : { beforeId: query.beforeId }),
    limit: PAGE_SIZE + 1,
  });
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    entries: page.map((row) => ({
      id: row.id,
      at: row.at.toISOString(),
      category: row.category,
      actorType: row.actorType,
      event: row.event,
      userId: row.userId,
      ipAddress: row.ipAddress,
      detail: row.detail,
    })),
    nextBeforeId: rows.length > PAGE_SIZE && last !== undefined ? last.id : null,
    eventNames: await listEventNames(db, query.category as EventCategory | undefined),
  };
}
