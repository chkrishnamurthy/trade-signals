import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { calendarExpiresSoon, sessionFor } from '@equitywise/core';
import {
  getExchangeSession,
  latestSignalQuoteAt,
  recordPaperRiskEvent,
  upsertExchangeSession,
} from '@equitywise/db';
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
 * The exchange calendar service (docs/planning/paper-trading-plan.md §9.4).
 *
 * `config/nse-calendar.yaml` is the primary source; provider status is only a
 * cross-check. Every in-session job asks `sessionToday` before doing
 * anything, so a holiday in the file switches the whole intraday path off
 * without a code change, and an unscheduled closure detected at 09:20 does
 * the same for the rest of that day.
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
 * Writes today's session row from the config. A row the closure check
 * already marked `CLOSED_UNSCHEDULED` is left alone: the config cannot know
 * about an unscheduled closure, and the check has better evidence.
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
    await recordPaperRiskEvent(context.db, {
      portfolioId: null,
      at: now,
      kind: 'CALENDAR_EXPIRING',
      detail: { verifiedThrough: calendar.verifiedThrough, tradingDate: today },
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

/**
 * Unscheduled-closure check, five minutes after the open: the calendar says
 * the exchange is open, the provider says it is closed, and no price has
 * arrived since the open. All three together mark the day closed and raise a
 * risk event; any one alone is noise (a provider outage, a slow feed).
 */
export async function checkUnscheduledClosure(
  context: WorkerContext,
  log: Logger,
  now = Date.now(),
): Promise<boolean> {
  const session = await sessionToday(context, now);
  if (!isTradingSession(session) || session.openAt === null || now < session.openAt + 5 * 60_000)
    return false;
  let providerClosed = false;
  try {
    const status = await context.provider.fetchMarketStatus();
    providerClosed = !status.isOpen;
  } catch (error) {
    log.warn('market status unavailable for the closure check', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
  const lastQuoteAt = await latestSignalQuoteAt(context.db);
  const quiet = lastQuoteAt === null || lastQuoteAt < session.openAt;
  if (!providerClosed || !quiet) return false;
  const closed: ExchangeSession = {
    ...session,
    kind: 'CLOSED_UNSCHEDULED',
    note: 'Provider reported closed and no price arrived after the open.',
  };
  await upsertExchangeSession(context.db, closed, 'provider', now);
  await recordPaperRiskEvent(context.db, {
    portfolioId: null,
    at: now,
    kind: 'CLOSED_UNSCHEDULED',
    detail: { tradingDate: session.tradingDate, lastQuoteAt },
  });
  log.error('unscheduled closure detected; no entries today', { tradingDate: session.tradingDate });
  return true;
}
