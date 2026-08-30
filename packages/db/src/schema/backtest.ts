import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
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
 * Backtest results, kept PHYSICALLY SEPARATE from the live signal tables.
 *
 * This separation is the whole point of these tables, not a stylistic
 * preference. Replaying 2026-08-21 through the engine used to insert rows into
 * `intraday_signals` and `paper_trades` under that trading date, where they sat
 * beside genuinely live results on `/signals/performance` with nothing to tell
 * them apart. A measurement tool that contaminates the thing it measures is
 * worse than no tool.
 *
 * Two further reasons a `backtest_run_id` column on the live tables would not
 * have worked:
 *
 *  - `intraday_signals_live_idx` is a partial unique index on
 *    `(instrument, trading_date, setup_key) WHERE ended_at IS NULL`. A backtest
 *    of a date the worker also ran would collide with it.
 *  - Every live read would need a `WHERE backtest_run_id IS NULL` that a future
 *    code path could forget, and forgetting it is silent.
 *
 * Everything here is a MEASUREMENT, per share, in paise. No quantity, no
 * capital, no position, no money — same rule as `paper_trades` (CLAUDE.md).
 */

/**
 * One backtest execution.
 *
 * Also the job queue: a `queued` row is a request, and the worker claims it.
 * That is deliberate — a table the runner already has to write to is a queue
 * that needs no Redis, no broker and no new process (CLAUDE.md forbids all
 * three).
 *
 * The five reproducibility columns — `strategyVersionId`, `barSource`,
 * `datasetId`, `gitRevision` and `universe` — exist so a result can be
 * regenerated months later. Without them a backtest is a number with no
 * provenance, which is indistinguishable from a number someone made up.
 */
export const backtestRuns = pgTable(
  'backtest_runs',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Operator-supplied name, for telling two runs apart in a list. */
    label: text(),
    /** `queued` | `running` | `succeeded` | `failed` | `cancelled`. */
    status: text().notNull().default('queued'),

    // --- Reproducibility. All five are required to regenerate a result. ----
    /**
     * The exact, immutable config this ran with (hard rule 7).
     *
     * Shared with the live path: an identical config resolves to the same
     * `strategy_versions` row whether the worker or a backtest registered it,
     * so "was this backtested under the config that is running live?" is a
     * single id comparison.
     */
    strategyVersionId: integer()
      .notNull()
      .references(() => strategyVersions.id),
    /** `stored` (minute_candles) or `archive` (compiled tick files). */
    barSource: text().notNull().default('stored'),
    /** Archive dataset id when `barSource` is `archive`; null otherwise. */
    datasetId: text(),
    /** Git revision of the engine code. A result is only reproducible at one. */
    gitRevision: text().notNull(),
    /** The resolved symbol list actually evaluated. */
    universe: jsonb().notNull().default(sql`'[]'::jsonb`),
    /**
     * False when the universe is today's index membership applied to past
     * dates — which is survivorship bias.
     *
     * Stored as a column rather than buried in `universe` so the UI can render
     * the caveat beside the headline expectancy without parsing JSON, and so a
     * query for "results I can trust over a long window" is cheap. A dated
     * constituent source is not currently available, so this is false in
     * practice; the column exists so results stop being silently misleading
     * the moment one appears.
     */
    universeDated: boolean().notNull().default(false),

    fromDate: date().notNull(),
    toDate: date().notNull(),
    /** Minutes between evaluation instants. Matches the live cycle by default. */
    cycleMinutes: integer().notNull(),
    /**
     * Config overrides applied on top of the strategy version.
     *
     * Recorded separately from `strategyVersionId` because an override is a
     * question being asked ("what if the score floor were 75?"), not a new
     * strategy. Mixing the two would mint a strategy version per experiment.
     */
    overrides: jsonb().notNull().default(sql`'{}'::jsonb`),

    // --- Progress. Columns, not log lines, so the UI reads them directly. --
    sessionsTotal: integer().notNull().default(0),
    sessionsDone: integer().notNull().default(0),
    symbolsEvaluated: bigint({ mode: 'number' }).notNull().default(0),
    evaluations: bigint({ mode: 'number' }).notNull().default(0),
    signalsGenerated: integer().notNull().default(0),
    tradesRecorded: integer().notNull().default(0),

    /**
     * Headline statistics, denormalised.
     *
     * So the run list does not aggregate over every trade of every run to draw
     * one column of expectancies.
     */
    summary: jsonb().notNull().default(sql`'{}'::jsonb`),
    /**
     * Why setups did not become trades, as counts by reason.
     *
     * The most useful panel in the existing report: it separates "the market
     * was quiet" from "a filter is set wrong", which look identical from a
     * trade list alone.
     */
    rejections: jsonb().notNull().default(sql`'{}'::jsonb`),
    error: text(),

    queuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    // The claim query: oldest queued run first.
    index('backtest_runs_status_idx').on(table.status, table.queuedAt),
    index('backtest_runs_queued_idx').on(table.queuedAt.desc()),
  ],
);

/**
 * A signal produced during a backtest.
 *
 * Mirrors the meaningful columns of `intraday_signals`, with one deliberate
 * difference: factors, reasons and events are `jsonb` here rather than three
 * child tables. A live signal has a "why?" page that queries them individually;
 * a backtest signal is read in bulk. Three extra tables per run would be four
 * times the write volume for no read benefit — and hard rule 8 still holds,
 * because the breakdown IS stored and IS rendered from storage rather than
 * recomputed.
 *
 * There is deliberately NO unique index on `(run, date, instrument, setupKey)`.
 * A setup can legitimately form, be invalidated, and re-form after the cooldown
 * within one session; collapsing those into one row would hide exactly the
 * re-firing behaviour the lifecycle exists to manage. Idempotency comes from
 * the runner deleting a session's rows before rewriting them, in one
 * transaction with the progress bump.
 */
export const backtestSignals = pgTable(
  'backtest_signals',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    runId: bigint({ mode: 'number' })
      .notNull()
      .references(() => backtestRuns.id, { onDelete: 'cascade' }),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    tradingDate: date().notNull(),

    setupKey: text().notNull(),
    kind: text().notNull(),
    /** `long` or `short`. A direction, never an instruction. */
    direction: text().notNull(),
    strategy: text().notNull(),
    /** Terminal or final state reached during the replay. */
    state: text().notNull(),
    regime: text().notNull(),

    score: integer().notNull(),
    quality: text().notNull(),
    scoring: jsonb().notNull().default(sql`'{}'::jsonb`),

    // --- Technical levels. Chart prices in paise, never orders. -----------
    entryLow: integer().notNull(),
    entryHigh: integer().notNull(),
    invalidationLevel: integer().notNull(),
    target1: integer().notNull(),
    target2: integer().notNull(),
    riskPaise: integer().notNull(),
    rewardPaise: integer().notNull(),
    riskReward: doublePrecision(),
    costPaise: integer().notNull().default(0),
    netRewardPaise: integer().notNull().default(0),
    netRiskPaise: integer().notNull().default(0),
    netRiskReward: doublePrecision(),
    referencePrice: integer(),

    triggerMinutes: smallint().notNull(),
    setupMinutes: smallint().notNull(),
    trendMinutes: smallint().notNull(),

    /** The full evidence, so a backtested signal explains itself (rule 8). */
    indicatorSnapshot: jsonb().notNull().default(sql`'{}'::jsonb`),
    factors: jsonb().notNull().default(sql`'[]'::jsonb`),
    reasons: jsonb().notNull().default(sql`'[]'::jsonb`),
    events: jsonb().notNull().default(sql`'[]'::jsonb`),

    detectedAt: timestamp({ withTimezone: true }).notNull(),
    triggeredAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    endReason: text(),
  },
  (table) => [
    index('backtest_signals_run_date_idx').on(table.runId, table.tradingDate),
    index('backtest_signals_run_score_idx').on(table.runId, table.score.desc()),
    index('backtest_signals_instrument_idx').on(table.runId, table.instrumentId),
  ],
);

/**
 * A graded outcome from a backtest.
 *
 * Produced by `resolvePaperTrade` — the SAME pure function the live recorder
 * uses — so a backtested result and a live paper result are produced by
 * identical logic and may legitimately be compared. That identity is the reason
 * this table's columns match `paper_trades` field for field.
 *
 * Per share, in paise. No quantity, no capital, no position.
 */
export const backtestTrades = pgTable(
  'backtest_trades',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    runId: bigint({ mode: 'number' })
      .notNull()
      .references(() => backtestRuns.id, { onDelete: 'cascade' }),
    signalId: bigint({ mode: 'number' })
      .notNull()
      .references(() => backtestSignals.id, { onDelete: 'cascade' }),
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    tradingDate: date().notNull(),

    /** Copied from the signal so results slice without a join. */
    kind: text().notNull(),
    strategy: text().notNull(),
    direction: text().notNull(),
    regime: text().notNull(),
    score: integer().notNull(),
    quality: text().notNull(),

    /**
     * The fill is the OPEN of the first bar after the trigger (hard rule 2),
     * never the published entry zone.
     */
    entryAt: timestamp({ withTimezone: true }).notNull(),
    entryPrice: integer().notNull(),
    exitAt: timestamp({ withTimezone: true }).notNull(),
    exitPrice: integer().notNull(),
    /** `target1` | `target2` | `stop` | `session_close` | `unresolved`. */
    exitReason: text().notNull(),

    grossPaise: integer().notNull(),
    costPaise: integer().notNull(),
    netPaise: integer().notNull(),
    /** Net result as a multiple of the risk taken at the fill. */
    rMultiple: doublePrecision().notNull(),

    maxFavourable: integer().notNull().default(0),
    maxAdverse: integer().notNull().default(0),
    barsHeld: integer().notNull().default(0),
    reachedTarget2: boolean().notNull().default(false),
  },
  (table) => [
    // One outcome per backtested signal, ever.
    uniqueIndex('backtest_trades_signal_idx').on(table.signalId),
    index('backtest_trades_run_idx').on(table.runId, table.tradingDate),
    index('backtest_trades_run_score_idx').on(table.runId, table.score),
  ],
);
