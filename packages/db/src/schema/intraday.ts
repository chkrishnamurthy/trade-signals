import type {
  IntradayEvidence,
  IntradayProjection,
  IntradayScannerSnapshot,
} from '@equitywise/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { instruments } from './instruments.js';
import { strategyVersions } from './signals.js';

/**
 * The single intraday strategy's published signals. Strategy-neutral columns:
 * the evidence JSON carries the strategy name and revision, the
 * `strategy_versions` row carries the hashed config. One signal per stock per
 * session, whatever its outcome (a rule of the strategy, enforced here so a
 * retry or a second worker cannot bypass it).
 */
export const intradaySignals = pgTable(
  'strategy_signals',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    strategyVersionId: integer()
      .notNull()
      .references(() => strategyVersions.id),
    tradingDate: date().notNull(),
    symbol: text().notNull(),
    companyName: text().notNull(),
    publishedAt: timestamp({ withTimezone: true }).notNull(),
    evidence: jsonb().$type<IntradayEvidence>().notNull(),
    projection: jsonb().$type<IntradayProjection>().notNull(),
    /** Mirrors projection.taken for indexing the book's counts. */
    taken: boolean().notNull(),
    sequence: integer().notNull().default(1),
    endedAt: timestamp({ withTimezone: true }),
    /** Net simulated result of closed legs; null until the first exit. */
    realisedNetPaise: bigint({ mode: 'number' }),
  },
  (t) => [
    uniqueIndex('strategy_signals_one_per_session_idx').on(t.instrumentId, t.tradingDate),
    index('strategy_signals_date_idx').on(t.tradingDate, t.id),
    check(
      'strategy_signals_evidence_valid',
      sql`jsonb_typeof(${t.evidence}->'levels')='object' and (${t.evidence}->'levels'->>'riskDistance')::integer>0 and ${t.evidence}->>'direction' in ('BUY','SELL')`,
    ),
    check(
      'strategy_signals_ended_terminal',
      sql`(${t.endedAt} is null) = (${t.projection}->>'status' not in ('TARGET_2_HIT','STOPPED_OUT','CLOSED_EOD','SKIPPED'))`,
    ),
  ],
);

/** Append-only history of every status/resolution change. */
export const intradaySignalEvents = pgTable(
  'strategy_signal_events',
  {
    signalId: integer()
      .notNull()
      .references(() => intradaySignals.id),
    sequence: integer().notNull(),
    status: text().notNull(),
    effectiveAt: timestamp({ withTimezone: true }).notNull(),
    recordedAt: timestamp({ withTimezone: true }).notNull(),
    reason: text().notNull(),
    price: integer(),
    shares: integer(),
    resolution: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.signalId, t.sequence] })],
);

/** Why a stock produced no signal for a whole session (gap, illiquid, narrow range…). */
export const intradaySessionExclusions = pgTable(
  'strategy_session_exclusions',
  {
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    tradingDate: date().notNull(),
    symbol: text().notNull(),
    reason: text().notNull(),
    detail: text(),
    recordedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.instrumentId, t.tradingDate] })],
);

export const intradayScanRuns = pgTable('strategy_scan_runs', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  snapshot: jsonb().$type<IntradayScannerSnapshot>().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
