import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { instruments } from './instruments.js';
import { strategyVersions } from './signals.js';

/**
 * Intraday trade signals, their evidence and their history.
 *
 * Separate from `signals` because the two are different objects. `signals`
 * holds ONE end-of-day verdict per instrument per session — a standing opinion
 * about a stock. An intraday signal is an event with a life: it forms,
 * triggers, is confirmed, and then either reaches a target, is invalidated, or
 * runs out of session. Forcing both into one table would mean either losing
 * the lifecycle or breaking the daily uniqueness that makes the daily pass
 * idempotent.
 *
 * These are TECHNICAL SETUPS, not orders. `direction` is `long`/`short` — which
 * side of the market the structure favours — and the price columns are levels
 * on a chart. There is no quantity column, no order id, and no field from which
 * either could be inferred, by design (CLAUDE.md).
 *
 * Invariants: prices are integer paise (rule 3), timestamps are TIMESTAMPTZ in
 * UTC (rule 6), and every signal writes its score breakdown and indicator
 * snapshot so the "why?" UI reads rather than recomputes (rule 8).
 */
export const intradaySignals = pgTable(
  'intraday_signals',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    /**
     * The exact config that produced this signal.
     *
     * Immutable and content-addressed (rule 7), so a weight change mints a new
     * version rather than retroactively changing what a past signal claims to
     * have been computed from. Without it, tuning the weights would silently
     * invalidate every stored signal's explanation.
     */
    strategyVersionId: integer()
      .notNull()
      .references(() => strategyVersions.id),

    /** IST trading date. Intraday signals never cross a session boundary. */
    tradingDate: date().notNull(),

    /**
     * Stable setup identity — `kind|anchor`, e.g. `breakout|level:previousHigh`.
     *
     * This is what makes deduplication exact: a breakout that stays valid for
     * forty minutes is one row that keeps being updated, not fourteen rows.
     */
    setupKey: text().notNull(),

    /** `breakout`, `vwap_reclaim`, `momentum_long`, … */
    kind: text().notNull(),
    /** `long` or `short`. Rendered as BUY / SELL. */
    direction: text().notNull(),
    /** Which strategy produced it, for per-strategy performance analysis. */
    strategy: text().notNull(),
    /** `watching` … `active`, or a terminal `invalidated`/`expired`/`target_met`. */
    state: text().notNull(),
    /** Session regime at detection: `opening`, `early`, `mid`, … */
    regime: text().notNull(),

    /** 0-100 technical setup strength. Explained entirely by the factor rows. */
    score: integer().notNull(),
    /** `exceptional` | `strong` | `good` | `watch`. */
    quality: text().notNull(),
    /**
     * The arithmetic behind `score`: category total, conviction, regime penalty.
     *
     * The category rows alone do not sum to the score — conviction scales the
     * total and the regime deducts a flat penalty — and a breakdown whose
     * numbers visibly fail to add up is worse than no breakdown. Every term is
     * stored so the UI can show the whole calculation (hard rule 8).
     */
    scoring: jsonb().notNull().default(sql`'{}'::jsonb`),

    // --- Technical levels. Chart prices in paise, never orders. ------------
    entryLow: integer().notNull(),
    entryHigh: integer().notNull(),
    invalidationLevel: integer().notNull(),
    target1: integer().notNull(),
    target2: integer().notNull(),
    riskPaise: integer().notNull(),
    rewardPaise: integer().notNull(),
    /** reward ÷ risk. A ratio, so a float. */
    riskReward: doublePrecision(),
    /**
     * Cost-adjusted level economics, paise, as computed when the signal was
     * created.
     *
     * Stored rather than derived on read so a signal stays interpretable after
     * the cost configuration changes, and so the UI can show the user exactly
     * what was deducted from the published reward-to-risk figure.
     */
    costPaise: integer().notNull().default(0),
    netRewardPaise: integer().notNull().default(0),
    netRiskPaise: integer().notNull().default(0),
    netRiskReward: doublePrecision(),
    /** Price when the trigger fired, paise. Null until it does. */
    referencePrice: integer(),

    /** Timeframes used, in minutes. */
    triggerMinutes: smallint().notNull(),
    setupMinutes: smallint().notNull(),
    trendMinutes: smallint().notNull(),

    /** The typed invalidation conditions, evaluated on every cycle. */
    invalidations: jsonb().notNull(),
    /** Every indicator reading at detection — the "why?" without recomputing. */
    indicatorSnapshot: jsonb().notNull(),

    detectedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    triggeredAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp({ withTimezone: true }),
    endReason: text(),

    /** Evaluations survived since the trigger. Drives the confirmation step. */
    holds: integer().notNull().default(0),

    /**
     * Maximum favourable and adverse excursion since the trigger, paise.
     *
     * The foundation of every honest performance question that can be asked
     * later — did the setup ever work, and how much heat did it take first —
     * without which "win rate" is unanswerable from stored data.
     */
    maxFavourable: integer().notNull().default(0),
    maxAdverse: integer().notNull().default(0),
  },
  (table) => [
    /**
     * At most ONE live signal per instrument per setup per session.
     *
     * A partial unique index rather than application logic: deduplication is
     * the difference between a usable feed and thirty identical cards, and a
     * constraint cannot be forgotten by a future code path the way a check can.
     */
    uniqueIndex('intraday_signals_live_idx')
      .on(table.instrumentId, table.tradingDate, table.setupKey)
      .where(sql`${table.endedAt} IS NULL`),
    index('intraday_signals_date_score_idx').on(table.tradingDate, table.score.desc()),
    index('intraday_signals_date_state_idx').on(table.tradingDate, table.state),
    index('intraday_signals_instrument_idx').on(table.instrumentId, table.tradingDate.desc()),
    index('intraday_signals_updated_idx').on(table.updatedAt.desc()),
  ],
);
