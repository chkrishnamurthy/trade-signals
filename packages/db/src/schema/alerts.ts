import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { authUsers } from './auth.js';
import { instruments } from './instruments.js';

/**
 * Per-user alert rules on closed daily data (`packages/core/src/alerts`).
 *
 * A rule is a crossing of a level by one metric on one instrument. `threshold`
 * is integer paise when `metric` is `close` and a 0–100 number when it is
 * `rsi14`. A one-shot rule switches itself off after it fires.
 *
 * Every read and write goes through `repositories/alerts.ts`, scoped by owner.
 */
export const alerts = pgTable(
  'alerts',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ownerId: integer()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id, { onDelete: 'cascade' }),
    metric: text().notNull(),
    comparator: text().notNull(),
    threshold: doublePrecision().notNull(),
    enabled: boolean().notNull().default(true),
    oneShot: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastTriggeredAt: timestamp({ withTimezone: true }),
    /** The trading date this rule last looked at; the worker never re-reads a date twice. */
    lastEvaluatedDate: date(),
  },
  (table) => [
    index('alerts_owner_idx').on(table.ownerId, table.createdAt.desc()),
    index('alerts_enabled_instrument_idx').on(table.enabled, table.instrumentId),
    check('alerts_metric_check', sql`${table.metric} in ('close', 'rsi14')`),
    check(
      'alerts_comparator_check',
      sql`${table.comparator} in ('crosses_above', 'crosses_below')`,
    ),
    check('alerts_threshold_positive', sql`${table.threshold} > 0`),
  ],
);

/** What fired, when, and the value that fired it. One row per rule per session. */
export const alertEvents = pgTable(
  'alert_events',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    alertId: integer()
      .notNull()
      .references(() => alerts.id, { onDelete: 'cascade' }),
    ownerId: integer()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    tradingDate: date().notNull(),
    /** Paise for `close`, the RSI value for `rsi14`. */
    observedValue: doublePrecision().notNull(),
    message: text().notNull(),
    triggeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    emailedAt: timestamp({ withTimezone: true }),
    acknowledgedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    // The idempotency key: re-running the evaluator for a date cannot fire twice.
    uniqueIndex('alert_events_alert_date_idx').on(table.alertId, table.tradingDate),
    index('alert_events_owner_idx').on(table.ownerId, table.triggeredAt.desc()),
  ],
);
