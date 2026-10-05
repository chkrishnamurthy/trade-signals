import 'server-only';
import {
  type AlertComparator,
  type AlertCondition,
  type AlertMetric,
  validateAlertCondition,
} from '@equitywise/core';
import {
  type AlertEventRow,
  type AlertRow,
  acknowledgeAlertEvents,
  countUnacknowledgedAlertEvents,
  createAlert,
  deleteAlert,
  getInstrumentBySymbol,
  listAlertEvents,
  listAlerts,
  MAX_ALERTS_PER_USER,
  setAlertEnabled,
} from '@equitywise/db';
import { z } from 'zod';
import type { AlertDto, AlertEventDto, AlertsOverviewDto } from '@/lib/alert-types';
import { getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { MarketDataError } from './errors';

/**
 * Alert rules for the signed-in user. Every statement is scoped to that user in
 * `repositories/alerts.ts`; this layer decides who the user is, validates the
 * input and shapes the response.
 *
 * Rules fire on CLOSED daily data (see `packages/core/src/alerts`), so a rule
 * created now is judged against the next completed session.
 */

export const createAlertSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, 'Choose a stock.')
    .max(40)
    .transform((value) => value.toUpperCase()),
  metric: z.enum(['close', 'rsi14']),
  comparator: z.enum(['crosses_above', 'crosses_below']),
  /** Integer paise for `close`; 0–100 for `rsi14`. */
  level: z.number().finite(),
  oneShot: z.boolean().default(true),
});

export const updateAlertSchema = z.object({ enabled: z.boolean() });

async function requireOwnerId(): Promise<number> {
  const user = await getSessionUser();
  if (user === null) {
    throw new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
      remedy: 'Sign in and try again.',
    });
  }
  return user.id;
}

function toAlertDto(row: AlertRow): AlertDto {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    metric: row.metric as AlertMetric,
    comparator: row.comparator as AlertComparator,
    threshold: row.threshold,
    enabled: row.enabled,
    oneShot: row.oneShot,
    createdAt: row.createdAt.toISOString(),
    lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
  };
}

function toEventDto(row: AlertEventRow): AlertEventDto {
  return {
    id: row.id,
    alertId: row.alertId,
    symbol: row.symbol,
    tradingDate: row.tradingDate,
    message: row.message,
    triggeredAt: row.triggeredAt.toISOString(),
    acknowledged: row.acknowledgedAt !== null,
  };
}

export async function getAlertsOverview(): Promise<AlertsOverviewDto> {
  const ownerId = await requireOwnerId();
  const db = getDatabase();
  const [rules, events, unacknowledged] = await Promise.all([
    listAlerts(db, ownerId),
    listAlertEvents(db, ownerId, 50),
    countUnacknowledgedAlertEvents(db, ownerId),
  ]);
  return {
    alerts: rules.map(toAlertDto),
    events: events.map(toEventDto),
    unacknowledged,
    limit: MAX_ALERTS_PER_USER,
  };
}

export type CreateAlertOutcome =
  | { ok: true; id: number }
  | { ok: false; status: number; code: string; message: string; remedy?: string };

export async function createUserAlert(
  input: z.infer<typeof createAlertSchema>,
): Promise<CreateAlertOutcome> {
  const ownerId = await requireOwnerId();
  const condition: AlertCondition = {
    metric: input.metric,
    comparator: input.comparator,
    threshold: input.level,
  };
  const invalid = validateAlertCondition(condition);
  if (invalid !== null)
    return { ok: false, status: 400, code: 'INVALID_CONDITION', message: invalid };

  const db = getDatabase();
  const instrument = await getInstrumentBySymbol(db, input.symbol, 'NSE');
  if (instrument === null) {
    return {
      ok: false,
      status: 404,
      code: 'UNKNOWN_SYMBOL',
      message: `We don't have "${input.symbol}".`,
      remedy: 'Search for the stock by name and use its NSE symbol.',
    };
  }

  const created = await createAlert(db, ownerId, {
    instrumentId: instrument.id,
    metric: input.metric,
    comparator: input.comparator,
    threshold: input.level,
    oneShot: input.oneShot,
  });
  if (!created.ok) {
    return {
      ok: false,
      status: 409,
      code: 'ALERT_LIMIT',
      message: `You can keep up to ${MAX_ALERTS_PER_USER} alerts.`,
      remedy: 'Delete one you no longer need.',
    };
  }
  return { ok: true, id: created.id };
}

export async function setUserAlertEnabled(id: number, enabled: boolean): Promise<boolean> {
  return setAlertEnabled(getDatabase(), await requireOwnerId(), id, enabled);
}

export async function removeUserAlert(id: number): Promise<boolean> {
  return deleteAlert(getDatabase(), await requireOwnerId(), id);
}

export async function acknowledgeUserAlertEvents(): Promise<number> {
  return acknowledgeAlertEvents(getDatabase(), await requireOwnerId());
}
