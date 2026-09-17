/**
 * Retained from the removed Confirmed VWAP Trend Pullback page. `minute_candles`,
 * `signal_quotes` and `signal_observations` are live (the intraday strategy reads
 * and writes them). The `vwap_*` and `paper_*` tables hold that page's history
 * and are dropped after their export (intraday-strategy-dhan-plan.md, phase 6);
 * their JSON columns are untyped here because the contracts no longer exist.
 */
type Retained = Record<string, unknown>;

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
import { authUsers } from './auth.js';
import { instruments } from './instruments.js';
import { strategyVersions } from './signals.js';

export const minuteCandles = pgTable(
  'minute_candles',
  {
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    ts: timestamp({ withTimezone: true }).notNull(),
    open: integer().notNull(),
    high: integer().notNull(),
    low: integer().notNull(),
    close: integer().notNull(),
    volume: bigint({ mode: 'number' }).notNull(),
    providerId: text().notNull(),
    ingestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.instrumentId, t.ts] }),
    check(
      'minute_candles_valid',
      sql`${t.low}>0 and ${t.high}>=greatest(${t.open},${t.close}) and ${t.low}<=least(${t.open},${t.close}) and ${t.volume}>=0`,
    ),
  ],
);
export const vwapSignals = pgTable(
  'vwap_signals',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    strategyVersionId: integer()
      .notNull()
      .references(() => strategyVersions.id),
    tradingDate: date().notNull(),
    dedupeKey: text().notNull(),
    symbol: text().notNull(),
    companyName: text().notNull(),
    sector: text(),
    publishedAt: timestamp({ withTimezone: true }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    evidence: jsonb().$type<Retained>().notNull(),
    projection: jsonb().$type<Retained>().notNull(),
    sequence: integer().notNull().default(1),
    endedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('vwap_signals_dedupe_idx').on(t.dedupeKey),
    uniqueIndex('vwap_signals_one_active_idx')
      .on(t.instrumentId, t.tradingDate)
      .where(sql`${t.endedAt} is null`),
    index('vwap_signals_date_idx').on(t.tradingDate, t.id),
    check(
      'vwap_signals_evidence_valid',
      sql`jsonb_typeof(${t.evidence}->'factors')='array' and jsonb_array_length(${t.evidence}->'factors')=7 and (${t.evidence}->>'score')::integer between 70 and 100`,
    ),
  ],
);
export const vwapSignalEvents = pgTable(
  'vwap_signal_events',
  {
    signalId: integer()
      .notNull()
      .references(() => vwapSignals.id),
    sequence: integer().notNull(),
    state: text().notNull(),
    effectiveAt: timestamp({ withTimezone: true }).notNull(),
    recordedAt: timestamp({ withTimezone: true }).notNull(),
    reason: text().notNull(),
    price: integer(),
    resolution: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.signalId, t.sequence] })],
);
export const signalScanRuns = pgTable('signal_scan_runs', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  snapshot: jsonb().$type<Retained>().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const signalQuotes = pgTable('signal_quotes', {
  instrumentId: integer()
    .primaryKey()
    .references(() => instruments.id),
  price: integer().notNull(),
  bid: integer(),
  ask: integer(),
  observedAt: timestamp({ withTimezone: true }).notNull(),
  receivedAt: timestamp({ withTimezone: true }).notNull(),
  continuous: boolean().notNull(),
});
export const signalObservations = pgTable(
  'signal_observations',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    price: integer().notNull(),
    bid: integer(),
    ask: integer(),
    observedAt: timestamp({ withTimezone: true }).notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull(),
    continuous: boolean().notNull(),
  },
  (t) => [index('signal_observations_instrument_idx').on(t.instrumentId, t.observedAt)],
);
export const paperStudies = pgTable(
  'paper_studies',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => authUsers.id),
    signalId: integer()
      .notNull()
      .references(() => vwapSignals.id),
    idempotencyKey: text().notNull(),
    requestHash: text().notNull(),
    capitalPaise: bigint({ mode: 'number' }).notNull(),
    riskBps: integer().notNull(),
    sizing: jsonb().$type<Retained>().notNull(),
    costs: jsonb().$type<Retained>().notNull(),
    moveToBreakeven: boolean().notNull(),
    projection: jsonb().$type<Retained>().notNull(),
    sequence: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }),
    netPaise: bigint({ mode: 'number' }),
  },
  (t) => [
    uniqueIndex('paper_studies_user_signal_idx').on(t.userId, t.signalId),
    uniqueIndex('paper_studies_idempotency_idx').on(t.userId, t.idempotencyKey),
    index('paper_studies_owner_idx').on(t.userId, t.createdAt),
    check(
      'paper_studies_budget_valid',
      sql`${t.capitalPaise}>0 and ${t.riskBps} between 1 and 500 and (${t.sizing}->>'shares')::integer>0`,
    ),
  ],
);
export const paperStudyEvents = pgTable(
  'paper_study_events',
  {
    studyId: integer()
      .notNull()
      .references(() => paperStudies.id),
    sequence: integer().notNull(),
    projection: jsonb().$type<Retained>().notNull(),
    at: timestamp({ withTimezone: true }).notNull(),
    netPaise: bigint({ mode: 'number' }),
  },
  (t) => [primaryKey({ columns: [t.studyId, t.sequence] })],
);
export const paperEquityMarks = pgTable(
  'paper_equity_marks',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => authUsers.id),
    tradingDate: date().notNull(),
    at: timestamp({ withTimezone: true }).notNull(),
    netPaise: bigint({ mode: 'number' }),
  },
  (t) => [index('paper_equity_marks_user_date_idx').on(t.userId, t.tradingDate, t.at)],
);
