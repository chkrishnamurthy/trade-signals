import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { instruments } from './instruments.js';

/**
 * Personal watchlists and alerts.
 *
 * Single-user tool: there is no owner column and no tenancy (CLAUDE.md). These
 * tables exist so a watchlist survives clearing browser storage and so alerts
 * can be evaluated by the worker while no tab is open.
 */

export const watchlists = pgTable(
  'watchlists',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    /** Manual ordering in the sidebar. */
    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('watchlists_name_idx').on(table.name)],
);

export const watchlistItems = pgTable(
  'watchlist_items',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    watchlistId: integer()
      .notNull()
      .references(() => watchlists.id, { onDelete: 'cascade' }),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    position: integer().notNull().default(0),
    /** Free-text reason for watching. The user's own thesis, not generated. */
    note: text(),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('watchlist_items_unique_idx').on(table.watchlistId, table.instrumentId),
    index('watchlist_items_watchlist_idx').on(table.watchlistId, table.position),
  ],
);

/**
 * A condition to watch for.
 *
 * `condition` holds the typed predicate — `{ kind: 'rsi_above', value: 70 }` —
 * validated by a Zod schema at the API boundary, so an unknown alert kind is
 * rejected on write rather than silently never firing.
 */
export const alerts = pgTable(
  'alerts',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    /** `price_above`, `percent_move`, `volume_spike`, `rsi_above`, … */
    kind: text().notNull(),
    condition: jsonb().notNull(),
    /** Denormalised threshold, so "which alerts are close?" needs no JSON parse. */
    threshold: doublePrecision(),
    enabled: boolean().notNull().default(true),
    /**
     * Fire once then disable, rather than every evaluation.
     *
     * Without this a crossed threshold re-fires on every worker tick for the
     * rest of the session.
     */
    oneShot: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastTriggeredAt: timestamp({ withTimezone: true }),
    /** Guards against re-firing while a condition stays true. */
    lastEvaluatedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('alerts_enabled_idx').on(table.enabled, table.instrumentId),
    index('alerts_instrument_idx').on(table.instrumentId),
  ],
);

/** An alert that fired, and the value that fired it. */
export const alertEvents = pgTable(
  'alert_events',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    alertId: integer()
      .notNull()
      .references(() => alerts.id, { onDelete: 'cascade' }),
    triggeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** The observed value, so a surprising trigger can be audited. */
    observedValue: doublePrecision().notNull(),
    /** Rendered message at trigger time. */
    message: text().notNull(),
    acknowledgedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('alert_events_alert_idx').on(table.alertId, table.triggeredAt.desc())],
);
