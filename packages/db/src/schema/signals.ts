import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
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
 * Detected technical setups and the evidence behind each one.
 *
 * These are OBSERVATIONS, not recommendations, and nothing here represents an
 * order. `direction` is bullish/bearish/neutral — never buy/sell (CLAUDE.md).
 */

/**
 * An immutable strategy configuration.
 *
 * Changing a weight mints a NEW row (hard rule 7); an existing row is never
 * UPDATEd. Without this, a past signal's stored factors would silently start
 * describing a strategy that no longer exists, and no backtest would be
 * reproducible.
 */
export const strategyVersions = pgTable(
  'strategy_versions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** Human label, e.g. `swing-v3`. */
    name: text().notNull(),
    /**
     * Digest of the canonicalised config.
     *
     * Unique, so an identical config cannot be registered twice under two ids
     * and split one strategy's history in half.
     */
    configHash: text().notNull(),
    /** The full StrategyConfig, verbatim. */
    config: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    note: text(),
  },
  (table) => [uniqueIndex('strategy_versions_hash_idx').on(table.configHash)],
);

export const signals = pgTable(
  'signals',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    strategyVersionId: integer()
      .notNull()
      .references(() => strategyVersions.id),

    /**
     * The CLOSED session this was computed from.
     *
     * A signal derived from session T is actionable at T+1's open. Storing the
     * source session rather than a wall clock is what makes lookahead bias
     * detectable after the fact (hard rule 2).
     */
    tradingDate: date().notNull(),

    /** `strong_bullish` | `bullish` | `neutral` | `bearish` | `strong_bearish`. */
    direction: text().notNull(),
    /** 0–100. 50 is neutral. Explained entirely by `signal_factors`. */
    strength: integer().notNull(),
    /** Signed −1…+1 before mapping to strength. */
    bias: doublePrecision().notNull(),
    /** Named setups detected, e.g. `Golden cross`. */
    setups: text().array().notNull().default(sql`ARRAY[]::text[]`),

    /** Close of the source session, paise. What the strength describes. */
    close: integer().notNull(),
    /** Indicator values at computation time, for "why?" without recomputing. */
    indicatorSnapshot: jsonb().notNull(),

    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One verdict per instrument per session per strategy. Re-running the pass
    // is idempotent rather than accumulating duplicates.
    uniqueIndex('signals_unique_idx').on(
      table.instrumentId,
      table.tradingDate,
      table.strategyVersionId,
    ),
    index('signals_date_strength_idx').on(table.tradingDate, table.strength.desc()),
    index('signals_date_direction_idx').on(table.tradingDate, table.direction),
    index('signals_instrument_date_idx').on(table.instrumentId, table.tradingDate.desc()),
  ],
);

/**
 * The factor breakdown behind one signal.
 *
 * Hard rule 8: every signal writes this, and the "Why this signal?" UI READS
 * it — it never recomputes. Recomputation can disagree with the stored verdict,
 * which would mean showing an explanation for a signal that was never produced.
 */
export const signalFactors = pgTable(
  'signal_factors',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    signalId: bigint({ mode: 'number' })
      .notNull()
      .references(() => signals.id, { onDelete: 'cascade' }),
    /** Stable machine key, e.g. `rsiMomentum`. */
    key: text().notNull(),
    /** Display label at the time it was computed. */
    label: text().notNull(),
    /** −1 (bearish) … +1 (bullish). 0 means the factor was neutral. */
    score: doublePrecision().notNull(),
    /** The strategy weight applied. Stored so the arithmetic is auditable. */
    weight: doublePrecision().notNull(),
    /** Human-readable evidence, e.g. `RSI 61.4`. */
    detail: text().notNull(),
  },
  (table) => [
    uniqueIndex('signal_factors_unique_idx').on(table.signalId, table.key),
    index('signal_factors_signal_idx').on(table.signalId),
  ],
);
