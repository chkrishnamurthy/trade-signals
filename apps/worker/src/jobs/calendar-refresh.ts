import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { calendarExpiresSoon, sessionFor } from '@equitywise/core';
import { getExchangeSession, upsertExchangeSession } from '@equitywise/db';
import {
  type CalendarConfig,
  calendarConfigSchema,
  type ExchangeSession,
  istDateKey,
} from '@equitywise/shared';
import { parse } from 'yaml';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';

/**
 * The exchange calendar service.
 *
 * `config/nse-calendar.yaml` is the source. Every in-session job asks
 * `sessionToday` before doing anything, so a holiday in the file switches
 * those jobs off without a code change.
 */
const CONFIG_PATH = fileURLToPath(new URL('../../../../config/nse-calendar.yaml', import.meta.url));

export async function loadCalendarConfig(path = CONFIG_PATH): Promise<CalendarConfig> {
  const parsed = calendarConfigSchema.safeParse(parse(await readFile(path, 'utf8')));
  if (!parsed.success)
    throw new Error(
      `config/nse-calendar.yaml is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  return parsed.data;
}

/** Days of warning before the verified range runs out. */
export const CALENDAR_WARN_DAYS = 14;

/**
 * Writes today's session row from the config. A row already marked
 * `CLOSED_UNSCHEDULED` is left alone: the config cannot know about an
 * unscheduled closure, and whoever marked it had better evidence.
 */
export async function calendarRefresh(
  context: WorkerContext,
  log: Logger,
  now = Date.now(),
): Promise<ExchangeSession> {
  const calendar = await loadCalendarConfig();
  const today = istDateKey(new Date(now));
  const existing = await getExchangeSession(context.db, today);
  const session = existing?.kind === 'CLOSED_UNSCHEDULED' ? existing : sessionFor(today, calendar);
  if (existing?.kind !== 'CLOSED_UNSCHEDULED')
    await upsertExchangeSession(context.db, session, 'config', now);
  log.info('session', { tradingDate: today, kind: session.kind, note: session.note });
  if (calendarExpiresSoon(today, calendar, CALENDAR_WARN_DAYS)) {
    log.warn('calendar config nearly exhausted; verify against the NSE circular and extend it', {
      verifiedThrough: calendar.verifiedThrough,
    });
  }
  return session;
}

/**
 * Today's session, from the database row the refresh wrote, or computed from
 * the config (and written) when the worker started after 06:30.
 */
export async function sessionToday(
  context: WorkerContext,
  now = Date.now(),
): Promise<ExchangeSession> {
  const today = istDateKey(new Date(now));
  const stored = await getExchangeSession(context.db, today);
  if (stored) return stored;
  const session = sessionFor(today, await loadCalendarConfig());
  await upsertExchangeSession(context.db, session, 'config', now);
  return session;
}

export const isTradingSession = (session: ExchangeSession) =>
  session.kind === 'NORMAL' || session.kind === 'SPECIAL' || session.kind === 'MUHURAT';
