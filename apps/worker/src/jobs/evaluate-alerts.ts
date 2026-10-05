import {
  type AlertCondition,
  type AlertObservation,
  evaluateAlert,
  validateAlertCondition,
} from '@equitywise/core';
import {
  type EnabledAlert,
  getLatestIndicatorDate,
  getLatestTwoSessions,
  listEnabledAlertsForWorker,
  markAlertEventEmailed,
  markAlertsEvaluated,
  recordAlertFiring,
} from '@equitywise/db';
import { formatPaise } from '@equitywise/shared';
import type { WorkerContext } from '../context.js';
import { errorFields, type Logger } from '../log.js';
import { type MailSender, sendMail } from '../mail.js';

/**
 * Evaluates every user's alert rules against the latest CLOSED session.
 *
 * Runs after the daily indicator pass. Reads only what ingestion already stored
 * (no provider calls), so it is cheap and safe to re-run: a rule fires at most
 * once per session (unique key on rule + trading date), and a one-shot rule
 * switches itself off when it does.
 *
 * The wording states that a condition was met. It never says what to do.
 */

export interface AlertRunSummary {
  readonly tradingDate: string | null;
  readonly evaluated: number;
  readonly fired: number;
  readonly emailed: number;
}

/** "RELIANCE: close crossed above ₹1,500.00 (closed at ₹1,512.40 on 2026-10-05)". */
export function describeFiring(
  rule: Pick<EnabledAlert, 'symbol' | 'metric' | 'comparator' | 'threshold'>,
  observed: number,
  tradingDate: string,
): string {
  const direction = rule.comparator === 'crosses_above' ? 'above' : 'below';
  if (rule.metric === 'close') {
    return `${rule.symbol}: close crossed ${direction} ${formatPaise(rule.threshold)} (closed at ${formatPaise(Math.round(observed))} on ${tradingDate})`;
  }
  return `${rule.symbol}: RSI(14) crossed ${direction} ${rule.threshold} (${observed.toFixed(1)} on ${tradingDate})`;
}

function toObservation(
  session: { tradingDate: string; closePaise: number; rsi14: number | null } | undefined,
): AlertObservation | null {
  return session === undefined
    ? null
    : { tradingDate: session.tradingDate, closePaise: session.closePaise, rsi14: session.rsi14 };
}

export async function evaluateAlerts(
  context: WorkerContext,
  log: Logger,
  mail: MailSender = sendMail,
): Promise<AlertRunSummary> {
  const tradingDate = await getLatestIndicatorDate(context.db);
  if (tradingDate === null) {
    log.info('no indicator rows yet; nothing to evaluate');
    return { tradingDate: null, evaluated: 0, fired: 0, emailed: 0 };
  }

  const rules = await listEnabledAlertsForWorker(context.db);
  if (rules.length === 0) return { tradingDate, evaluated: 0, fired: 0, emailed: 0 };

  const sessions = await getLatestTwoSessions(
    context.db,
    [...new Set(rules.map((rule) => rule.instrumentId))],
    tradingDate,
  );

  let fired = 0;
  let emailed = 0;
  const evaluatedIds: number[] = [];

  for (const rule of rules) {
    const condition = {
      metric: rule.metric,
      comparator: rule.comparator,
      threshold: rule.threshold,
    } as AlertCondition;
    if (validateAlertCondition(condition) !== null) {
      log.warn('skipping a rule with an invalid condition', { alertId: rule.id });
      continue;
    }

    const [latest, before] = sessions.get(rule.instrumentId) ?? [];
    const current = toObservation(latest);
    // A rule is judged on the newest session only if that IS the run's date; an
    // instrument whose newest row is older has no new close to react to.
    if (current === null || current.tradingDate !== tradingDate) continue;
    evaluatedIds.push(rule.id);

    const verdict = evaluateAlert(condition, current, toObservation(before));
    if (!verdict.fired) continue;

    try {
      const message = describeFiring(rule, verdict.observed, tradingDate);
      const eventId = await recordAlertFiring(context.db, {
        alertId: rule.id,
        ownerId: rule.ownerId,
        tradingDate,
        observedValue: verdict.observed,
        message,
        oneShot: rule.oneShot,
      });
      if (eventId === null) continue; // already fired for this session
      fired += 1;

      const sent = await mail({
        to: rule.ownerEmail,
        subject: `EquityWise alert: ${rule.symbol}`,
        text: `${message}\n\nThis is a technical condition on the closed session, not a recommendation.\nManage your alerts: ${process.env.AUTH_BASE_URL ?? 'https://equitywise.io'}/alerts\n`,
      });
      if (sent) {
        await markAlertEventEmailed(context.db, eventId);
        emailed += 1;
      }
    } catch (error) {
      log.error('failed to record an alert firing', { alertId: rule.id, ...errorFields(error) });
    }
  }

  await markAlertsEvaluated(context.db, evaluatedIds, tradingDate);
  log.info('alerts evaluated', { tradingDate, evaluated: evaluatedIds.length, fired, emailed });
  return { tradingDate, evaluated: evaluatedIds.length, fired, emailed };
}
