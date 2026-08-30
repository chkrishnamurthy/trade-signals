/**
 * Replays the live intraday engine over stored candles and scores what would
 * have happened.
 *
 * This is the only honest answer to "is this thing any good". The engine is
 * pure (CLAUDE.md hard rule 1), so this script runs the exact same
 * `evaluateIntraday`, the exact same `transition` and the exact same
 * `resolvePaperTrade` the worker runs; nothing is reimplemented for
 * backtesting and the two cannot drift apart.
 *
 * Three pessimistic assumptions are baked in, because a backtest that flatters
 * itself is worse than no backtest at all:
 *
 *   - a bar that spans both the stop and the target counts as a STOP;
 *   - trades are resolved on 1m bars, so intrabar stop hits are caught;
 *   - positions are force-closed before the bell, never carried.
 *
 * ## What changed, and why it matters
 *
 * Two divergences from the live path used to live in this file, and both made
 * it measure a DIFFERENT system than the one that actually runs:
 *
 *  - **The lifecycle was skipped.** A paper trade was recorded straight off
 *    `candidate.triggered`. The live path runs `transition()` first, which adds
 *    confirmation bars, cool-downs, dedup against recently-ended setups and a
 *    per-symbol cap. Setups the live feed suppresses were being counted here.
 *  - **Market context was empty.** `buildMarketContext` was called with no
 *    benchmark bars, no bank index and no VIX, while `marketContext` carries
 *    weight 0.15 of the confluence score. Backtested scores were structurally
 *    not live scores.
 *
 * Both are now closed: the real lifecycle runs, with live-signal state held in
 * memory exactly as the worker holds it in Postgres, and the real index series
 * are loaded and sliced per cycle.
 *
 * Results are written to `backtest_runs` / `backtest_signals` /
 * `backtest_trades` — NEVER to the live tables. A measurement tool that
 * contaminates what it measures is worse than no tool.
 *
 * Usage:
 *   pnpm backtest:intraday                          last 10 stored sessions
 *   pnpm backtest:intraday --from 2026-08-01        an explicit window
 *   pnpm backtest:intraday --min-score 75           try a different floor
 *   pnpm backtest:intraday --json out/trades.json   write every trade
 *   pnpm backtest:intraday --no-store               skip persistence
 *
 * It writes NOTHING to any live table. Reads only, apart from its own
 * `backtest_*` rows.
 */

import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import {
  buildMarketContext,
  buildVolumeProfile,
  evaluateIntraday,
  type IntradayConfig,
  type IntradaySnapshot,
  type LiveSignal,
  type PaperTrade,
  type Reason,
  resolvePaperTrade,
  type ScoreComponent,
  type SessionRegime,
  type SignalCandidate,
  type SignalCreation,
  type SignalEvent,
  type SignalUpdate,
  summarisePaperTrades,
  TERMINAL_STATES,
  transition,
} from '@equitywise/core';
import {
  type BacktestSignalInput,
  createBacktestRun,
  createDatabase,
  type Database,
  finishBacktestRun,
  getDailyBarsForInstruments,
  getMinuteBarsForInstruments,
  recordBacktestSession,
  registerStrategy,
  resolveInstrumentIds,
  type StoredBar,
  startBacktestRun,
} from '@equitywise/db';
import { istDateKey, sessionClose, sessionOpen } from '@equitywise/shared';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** One recorded paper trade, plus the signal metadata needed to slice results. */
interface TradeRecord {
  readonly tradingDate: string;
  readonly symbol: string;
  readonly kind: string;
  readonly strategy: string;
  readonly direction: 'long' | 'short';
  readonly score: number;
  readonly quality: string;
  readonly regime: SessionRegime;
  readonly signalledAt: number;
  readonly trade: PaperTrade;
}

interface Args {
  readonly from: string | null;
  readonly to: string | null;
  readonly sessions: number;
  readonly cycle: number | null;
  readonly minScore: number | null;
  readonly json: string | null;
  readonly label: string | null;
  /** Skip persistence entirely, for a throwaway experiment. */
  readonly store: boolean;
  /**
   * Level-geometry overrides, for answering the one question the default
   * configuration cannot: is this design workable at ANY stop and target
   * distance, or is it beaten by costs whatever they are set to?
   */
  readonly stopAtr: number | null;
  readonly targetAtr: number | null;
}

function parseArgs(argv: readonly string[]): Args {
  const read = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };
  const number = (flag: string): number | null => {
    const value = read(flag);
    if (value === null) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${flag} expects a number, got "${value}"`);
    return parsed;
  };
  return {
    from: read('--from'),
    to: read('--to'),
    sessions: number('--sessions') ?? 10,
    cycle: number('--cycle'),
    minScore: number('--min-score'),
    json: read('--json'),
    label: read('--label'),
    store: !argv.includes('--no-store'),
    stopAtr: number('--stop-atr'),
    targetAtr: number('--target-atr'),
  };
}

const toBars = (stored: readonly StoredBar[]): readonly StoredBar[] => stored;

/** Bars at or before `at`, for a series already sorted ascending. */
function upTo(bars: readonly StoredBar[], at: number): readonly StoredBar[] {
  let high = bars.length;
  let low = 0;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const bar = bars[mid];
    if (bar !== undefined && bar.timestamp + MS_PER_MINUTE <= at) low = mid + 1;
    else high = mid;
  }
  return bars.slice(0, low);
}

/**
 * The engine revision a result was produced at.
 *
 * Recorded on every run because a backtest is only reproducible at one commit:
 * the same window and the same config over different engine code is a different
 * experiment wearing the same name.
 */
function gitRevision(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const { loadIntradaySettings } = await import('../apps/worker/src/intraday-config.js');
  const { loadIndexConstituents } = await import('../apps/worker/src/universe.js');

  const settings = await loadIntradaySettings();
  const base = settings.config;
  const config: IntradayConfig = {
    ...base,
    minScore: args.minScore ?? base.minScore,
    targets: {
      ...base.targets,
      stopAtr: args.stopAtr ?? base.targets.stopAtr,
      target1Atr: args.targetAtr ?? base.targets.target1Atr,
      // Target 2 keeps its proportion to target 1, so a single override
      // rescales the setup rather than silently reshaping it.
      target2Atr:
        args.targetAtr === null
          ? base.targets.target2Atr
          : (args.targetAtr * base.targets.target2Atr) / base.targets.target1Atr,
    },
  };
  const cycleMinutes = args.cycle ?? settings.cycleMinutes ?? 3;

  const constituents = await loadIndexConstituents(settings.universe.index);
  const handle = createDatabase({});
  const db = handle.db;

  try {
    const idBySymbol = await resolveInstrumentIds(
      db,
      constituents.map((c) => c.symbol),
    );
    const symbolById = new Map<number, string>();
    const sectorBySymbol = new Map<string, string>();
    for (const constituent of constituents) {
      const id = idBySymbol.get(constituent.symbol);
      if (id !== undefined) symbolById.set(id, constituent.symbol);
      sectorBySymbol.set(constituent.symbol, constituent.sector);
    }
    const instrumentIds = [...symbolById.keys()];
    if (instrumentIds.length === 0) throw new Error('No universe instruments are known');

    // Index instruments for market context. Absent ones contribute nothing
    // rather than defaulting to neutral-positive — the same rule the engine's
    // own context module applies.
    const contextSymbols = [
      settings.universe.benchmark,
      settings.universe.bankingIndex,
      settings.universe.volatilityIndex,
    ].filter((symbol): symbol is string => symbol !== null && symbol !== '');
    const contextIds = await resolveInstrumentIds(db, contextSymbols);
    const contextRefs: ContextRefs = {
      benchmarkSymbol: settings.universe.benchmark,
      benchmark: contextIds.get(settings.universe.benchmark) ?? null,
      banking:
        settings.universe.bankingIndex === null
          ? null
          : (contextIds.get(settings.universe.bankingIndex) ?? null),
      volatility:
        settings.universe.volatilityIndex === null
          ? null
          : (contextIds.get(settings.universe.volatilityIndex) ?? null),
    };

    const dates = await tradingDates(db, instrumentIds, args);

    console.log('='.repeat(78));
    console.log('INTRADAY ENGINE BACKTEST');
    console.log('='.repeat(78));
    console.log(`  sessions          ${dates.length} (${dates[0]} … ${dates.at(-1)})`);
    console.log(`  universe          ${settings.universe.index}, ${instrumentIds.length} symbols`);
    console.log(`  cycle             every ${cycleMinutes}m`);
    console.log(`  score floor       ${config.minScore}/100`);
    console.log(
      `  market context    ${contextRefs.benchmark === null ? 'UNAVAILABLE — benchmark instrument not found' : `${contextRefs.benchmarkSymbol}${contextRefs.banking === null ? '' : ' + banking'}${contextRefs.volatility === null ? '' : ' + VIX'}`}`,
    );
    console.log(
      `  cost model        ${config.costs.brokeragePercentPerLeg}% brokerage/leg ·` +
        ` ${config.costs.slippagePercentPerLeg}% slippage/leg`,
    );
    console.log(
      `  geometry          stop ${config.targets.stopAtr}x ATR ·` +
        ` target1 ${config.targets.target1Atr}x · target2 ${config.targets.target2Atr.toFixed(1)}x`,
    );
    console.log(
      `  filters           net R:R ≥ ${config.targets.minNetRiskReward} ·` +
        ` target ≥ ${config.targets.minTargetPercent}% · stop ≥ ${config.targets.minStopPercent}%`,
    );
    console.log('');

    // --- Open the run -----------------------------------------------------
    // Registered as a strategy version first, so the overrides applied above
    // mint their own immutable config row (hard rule 7) rather than being
    // attributed to the live one.
    let runId: number | null = null;
    if (args.store) {
      const strategyVersionId = await registerStrategy(
        db,
        'intraday',
        config,
        'Intraday engine config as backtested',
      );
      runId = await createBacktestRun(db, {
        label: args.label,
        strategyVersionId,
        barSource: 'stored',
        datasetId: null,
        gitRevision: gitRevision(),
        universe: [...symbolById.values()],
        // Today's index membership applied to past dates. There is no dated
        // constituent source, so this is survivorship bias that can only be
        // labelled — and it is labelled here so the caveat travels with the
        // result instead of being remembered or forgotten.
        universeDated: false,
        fromDate: dates[0] ?? istDateKey(new Date()),
        toDate: dates.at(-1) ?? istDateKey(new Date()),
        cycleMinutes,
        overrides: {
          ...(args.minScore === null ? {} : { minScore: args.minScore }),
          ...(args.stopAtr === null ? {} : { stopAtr: args.stopAtr }),
          ...(args.targetAtr === null ? {} : { target1Atr: args.targetAtr }),
        },
      });
      await startBacktestRun(db, runId, dates.length);
      console.log(`  run               #${runId} — results stored, live tables untouched`);
      console.log('');
    } else {
      console.log('  run               --no-store: nothing will be persisted');
      console.log('');
    }

    const records: TradeRecord[] = [];
    const rejections = new Map<string, number>();

    try {
      for (const [index, date] of dates.entries()) {
        const session = await replaySession(db, {
          date,
          instrumentIds,
          symbolById,
          sectorBySymbol,
          config,
          cycleMinutes,
          contextRefs,
        });
        records.push(...session.records);
        for (const [reason, count] of session.rejections) {
          rejections.set(reason, (rejections.get(reason) ?? 0) + count);
        }

        if (runId !== null) {
          await recordBacktestSession(db, {
            runId,
            tradingDate: date,
            // 1-based ordinal, not a count of sessions that produced rows. A
            // quiet session legitimately produces no signals, and deriving
            // progress from stored rows made it look unfinished forever.
            sessionOrdinal: index + 1,
            signals: session.rows,
            symbolsEvaluated: session.symbolsEvaluated,
            evaluations: session.evaluations,
          });
        }

        const stats = summarisePaperTrades(session.records.map((r) => r.trade));
        console.log(
          `  ${date}  signals ${String(session.rows.length).padStart(3)}` +
            `   trades ${String(session.records.length).padStart(3)}` +
            `   hit ${(stats.hitRate * 100).toFixed(0).padStart(3)}%` +
            `   expectancy ${stats.expectancyR >= 0 ? '+' : ''}${stats.expectancyR.toFixed(3)}R`,
        );
      }
    } catch (error) {
      if (runId !== null) {
        await finishBacktestRun(db, runId, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }

    console.log('');

    const overall = summarisePaperTrades(records.map((r) => r.trade));
    report(records, config, overall);
    reportRejections(rejections);

    if (runId !== null) {
      await finishBacktestRun(db, runId, {
        status: 'succeeded',
        summary: {
          ...overall,
          sessions: dates.length,
          universeDated: false,
          breakevenHitRate: breakevenRate(overall.averageWinR, overall.averageLossR),
          marginOfErrorPoints: overall.trades === 0 ? null : 100 / Math.sqrt(overall.trades),
        },
        rejections: Object.fromEntries(rejections),
      });
      console.log(`  stored as backtest run #${runId}`);
      console.log('');
    }

    if (args.json !== null) {
      await writeFile(args.json, JSON.stringify(records, null, 2));
      console.log(`  wrote ${records.length} trades to ${args.json}`);
      console.log('');
    }
  } finally {
    await handle.close();
  }
}

/** The distinct trading dates that have stored minute candles, newest last. */
async function tradingDates(
  db: Database,
  instrumentIds: readonly number[],
  args: Args,
): Promise<string[]> {
  const to = args.to === null ? new Date() : new Date(`${args.to}T23:59:59+05:30`);
  // Calendar days needed to contain `sessions` TRADING days. Five sessions per
  // seven days, plus slack for public holidays. The old `sessions + 12` was a
  // near-1:1 assumption and silently capped a `--sessions 73` request at 57 —
  // the request looked satisfied while a third of the stored history was never
  // read.
  const calendarDays = Math.ceil(args.sessions * 1.5) + 14;
  const from =
    args.from === null
      ? new Date(to.getTime() - calendarDays * MS_PER_DAY)
      : new Date(`${args.from}T00:00:00+05:30`);

  const probe = await getMinuteBarsForInstruments(db, {
    instrumentIds: instrumentIds.slice(0, 1),
    from,
    to,
    raw: true,
  });
  const keys = new Set<string>();
  for (const bars of probe.values()) {
    for (const bar of bars) keys.add(istDateKey(new Date(bar.timestamp)));
  }
  const all = [...keys].sort();
  return args.from === null ? all.slice(-args.sessions) : all;
}

// ---------------------------------------------------------------------------
// Session replay
// ---------------------------------------------------------------------------

interface ContextRefs {
  readonly benchmarkSymbol: string;
  readonly benchmark: number | null;
  readonly banking: number | null;
  readonly volatility: number | null;
}

interface SessionResult {
  readonly records: readonly TradeRecord[];
  readonly rows: readonly BacktestSignalInput[];
  readonly rejections: ReadonlyMap<string, number>;
  readonly symbolsEvaluated: number;
  readonly evaluations: number;
}

interface ReplayInput {
  readonly date: string;
  readonly instrumentIds: readonly number[];
  readonly symbolById: ReadonlyMap<number, string>;
  readonly sectorBySymbol: ReadonlyMap<string, string>;
  readonly config: IntradayConfig;
  readonly cycleMinutes: number;
  readonly contextRefs: ContextRefs;
}

/**
 * A signal as it lives through a replayed session.
 *
 * `live` is exactly what the worker keeps in `intraday_signals` and hands to
 * `transition` on the next cycle — here it is a mutable field on an in-memory
 * object instead of a row. Everything alongside it is the evidence needed to
 * persist the signal afterwards, captured at detection so a setup that stops
 * being produced by its strategy keeps the evidence it triggered on, exactly as
 * the live updater does.
 */
interface ReplaySignal {
  live: LiveSignal;
  readonly instrumentId: number;
  readonly symbol: string;
  readonly strategy: string;
  readonly regime: SessionRegime;
  scoring: unknown;
  components: readonly ScoreComponent[];
  reasons: readonly Reason[];
  readonly snapshot: IntradaySnapshot;
  readonly events: SignalEvent[];
  readonly triggerMinutes: number;
  readonly setupMinutes: number;
  readonly trendMinutes: number;
  readonly detectedAt: number;
}

const isTerminal = (state: LiveSignal['state']): boolean => TERMINAL_STATES.includes(state);

/**
 * Replay one session.
 *
 * All the data for the day is read up front and then SLICED per cycle, rather
 * than re-queried: the slice is what makes this a replay rather than a
 * simulation, since each evaluation sees exactly the closed bars that existed
 * at that instant and not one more.
 *
 * Live-signal state carries across cycles in `signalsByInstrument`, which is
 * the in-memory equivalent of the worker's `getLiveIntradaySignals` read. That
 * is the whole difference between the two paths.
 */
async function replaySession(db: Database, input: ReplayInput): Promise<SessionResult> {
  const { date, instrumentIds, symbolById, sectorBySymbol, config, cycleMinutes } = input;

  const anchor = new Date(`${date}T12:00:00+05:30`);
  const open = sessionOpen(anchor);
  const close = sessionClose(anchor);
  const profileFrom = new Date(open.getTime() - (config.volume.profileSessions + 8) * MS_PER_DAY);

  const contextIds = [
    input.contextRefs.benchmark,
    input.contextRefs.banking,
    input.contextRefs.volatility,
  ].filter((id): id is number => id !== null);

  const [today, prior, daily, contextToday, contextDaily] = await Promise.all([
    getMinuteBarsForInstruments(db, { instrumentIds, from: open, to: close, raw: true }),
    getMinuteBarsForInstruments(db, { instrumentIds, from: profileFrom, to: open, raw: true }),
    getDailyBarsForInstruments(db, { instrumentIds, to: open, limit: 40 }),
    contextIds.length === 0
      ? Promise.resolve(new Map<number, StoredBar[]>())
      : getMinuteBarsForInstruments(db, {
          instrumentIds: contextIds,
          from: open,
          to: close,
          raw: true,
        }),
    contextIds.length === 0
      ? Promise.resolve(new Map<number, StoredBar[]>())
      : getDailyBarsForInstruments(db, { instrumentIds: contextIds, to: open, limit: 5 }),
  ]);

  const profiles = new Map<number, readonly number[]>();
  for (const id of instrumentIds) {
    profiles.set(id, buildVolumeProfile(toBars(prior.get(id) ?? []), config));
  }

  const previousCloses = new Map<number, number | null>();
  for (const id of instrumentIds) {
    previousCloses.set(id, daily.get(id)?.at(-1)?.close ?? null);
  }

  const forceExitAt = close.getTime() - config.session.forceExitBeforeCloseMinutes * MS_PER_MINUTE;
  const firstCycle = open.getTime() + config.session.warmupMinutes * MS_PER_MINUTE;
  const lastCycle = close.getTime() - config.session.noNewSignalsBeforeCloseMinutes * MS_PER_MINUTE;
  const cooldownMs = config.lifecycle.cooldownMinutes * MS_PER_MINUTE;

  const rejections = new Map<string, number>();
  const signalsByInstrument = new Map<number, ReplaySignal[]>();
  const allSignals: ReplaySignal[] = [];
  let nextSignalId = 1;
  let evaluations = 0;
  const evaluatedInstruments = new Set<number>();

  for (let stamp = firstCycle; stamp <= lastCycle; stamp += cycleMinutes * MS_PER_MINUTE) {
    const at = new Date(stamp);

    // Breadth is a property of the same universe being evaluated, measured at
    // this instant — not the day's final figure, which would be lookahead.
    let advancing = 0;
    let counted = 0;
    const sectorMoves = new Map<string, number[]>();
    for (const id of instrumentIds) {
      const previous = previousCloses.get(id) ?? null;
      const bars = upTo(today.get(id) ?? [], stamp);
      const last = bars.at(-1)?.close ?? null;
      if (previous === null || last === null || previous === 0) continue;
      const changePercent = ((last - previous) / previous) * 100;
      counted += 1;
      if (changePercent > 0) advancing += 1;
      const symbol = symbolById.get(id);
      const sector = symbol === undefined ? undefined : sectorBySymbol.get(symbol);
      if (sector !== undefined) {
        const list = sectorMoves.get(sector) ?? [];
        list.push(changePercent);
        sectorMoves.set(sector, list);
      }
    }
    const breadth = counted === 0 ? null : advancing / counted;

    // Index context, sliced to this instant exactly like every other series.
    const market = readMarketContext({
      refs: input.contextRefs,
      contextToday,
      contextDaily,
      stamp,
    });

    for (const id of instrumentIds) {
      const symbol = symbolById.get(id);
      if (symbol === undefined) continue;
      const sessionMinutes = today.get(id) ?? [];
      const minute = upTo(sessionMinutes, stamp);
      if (minute.length < config.data.minSessionBars) continue;

      const sector = sectorBySymbol.get(symbol) ?? null;
      const moves = sector === null ? undefined : sectorMoves.get(sector);
      const context = buildMarketContext(
        {
          benchmarkSymbol: input.contextRefs.benchmarkSymbol,
          benchmarkMinuteBars: market.benchmarkMinute,
          benchmarkDailyBars: market.benchmarkDaily,
          bankNiftyChangePercent: market.bankingChangePercent,
          breadth,
          sector,
          sectorChangePercent:
            moves === undefined || moves.length === 0
              ? null
              : moves.reduce((sum, value) => sum + value, 0) / moves.length,
          volatilityIndex: market.volatilityLevel,
          volatilityPreviousClose: market.volatilityPreviousClose,
          at,
        },
        config,
      );

      const evaluation = evaluateIntraday(
        {
          symbol,
          bars: {
            minute,
            history: toBars(prior.get(id) ?? []),
            daily: toBars(daily.get(id) ?? []),
            volumeProfile: profiles.get(id) ?? [],
          },
          context,
          at,
        },
        config,
      );
      evaluations += 1;
      evaluatedInstruments.add(id);

      for (const note of evaluation.rejections) {
        const reason = note.replace(/^[a-z_]+: /, '').replace(/[\d.]+/g, 'N');
        rejections.set(reason, (rejections.get(reason) ?? 0) + 1);
      }

      // --- The lifecycle, exactly as the worker runs it -------------------
      const forInstrument = signalsByInstrument.get(id) ?? [];
      const existing = forInstrument.filter((signal) => !isTerminal(signal.live.state));
      const recentlyEnded = forInstrument.flatMap((signal) => {
        const endedAt = signal.live.endedAt;
        if (endedAt === null || endedAt < stamp - cooldownMs) return [];
        return [{ setupKey: signal.live.setupKey, endedAt }];
      });

      const result = transition(
        {
          existing: existing.map((signal) => signal.live),
          evaluation,
          recentlyEnded,
          at,
        },
        config,
      );

      const byId = new Map(forInstrument.map((signal) => [signal.live.id, signal]));

      for (const creation of result.created) {
        const signal = createReplaySignal({
          id: String(nextSignalId),
          instrumentId: id,
          symbol,
          creation,
          evaluation,
          at: stamp,
        });
        nextSignalId += 1;
        forInstrument.push(signal);
        byId.set(signal.live.id, signal);
        allSignals.push(signal);
      }

      for (const change of result.updated) {
        const signal = byId.get(change.id);
        if (signal === undefined) continue;
        signal.live = applyUpdate(signal.live, change, stamp);
        // Evidence is only refreshed while the strategy still produces the
        // setup. A signal surviving on its own invalidation conditions keeps
        // the arithmetic and the reasons it triggered on — same rule as the
        // live updater, and the reason a stored breakdown always adds up.
        const candidate = evaluation.candidates.find(
          (entry) => entry.setupKey === signal.live.setupKey,
        );
        if (candidate !== undefined) {
          signal.scoring = candidate.scoring;
          signal.components = candidate.components;
          signal.reasons = candidate.reasons;
        }
      }

      for (const event of result.events) {
        // Newest matching signal: a setup that ended and re-formed after the
        // cooldown has two rows, and the event belongs to the current one.
        const target = [...forInstrument]
          .reverse()
          .find((signal) => signal.live.setupKey === event.setupKey);
        if (target !== undefined) target.events.push(event);
      }

      signalsByInstrument.set(id, forInstrument);
    }
  }

  // --- Grade, once the whole session's bars are available ------------------
  // Deliberately after the cycle loop, mirroring `recordPaperTrades`: the
  // decision was taken on truncated data, the outcome is resolved forward from
  // it. Different windows, on purpose.
  const records: TradeRecord[] = [];
  const rows: BacktestSignalInput[] = [];

  for (const signal of allSignals) {
    const { live } = signal;
    let trade: PaperTrade | null = null;

    if (live.triggeredAt !== null) {
      const series = today.get(signal.instrumentId) ?? [];
      if (series.length > 0) {
        trade = resolvePaperTrade({
          direction: live.direction,
          levels: live.levels,
          triggeredAt: live.triggeredAt,
          bars: series,
          forceExitAt,
          costs: config.costs,
        });
      }
    }

    if (trade !== null) {
      records.push({
        tradingDate: date,
        symbol: signal.symbol,
        kind: live.kind,
        strategy: signal.strategy,
        direction: live.direction,
        score: live.score,
        quality: live.quality,
        regime: signal.regime,
        signalledAt: live.triggeredAt ?? signal.detectedAt,
        trade,
      });
    }

    rows.push(toRow(signal, trade));
  }

  return {
    records,
    rows,
    rejections,
    symbolsEvaluated: evaluatedInstruments.size,
    evaluations,
  };
}

// ---------------------------------------------------------------------------
// Live-signal state, held in memory instead of Postgres
// ---------------------------------------------------------------------------

function createReplaySignal(input: {
  readonly id: string;
  readonly instrumentId: number;
  readonly symbol: string;
  readonly creation: SignalCreation;
  readonly evaluation: ReturnType<typeof evaluateIntraday>;
  readonly at: number;
}): ReplaySignal {
  const { candidate } = input.creation;
  return {
    instrumentId: input.instrumentId,
    symbol: input.symbol,
    strategy: candidate.strategy,
    regime: input.evaluation.regime,
    scoring: candidate.scoring,
    components: candidate.components,
    reasons: candidate.reasons,
    snapshot: input.evaluation.snapshot,
    events: [],
    triggerMinutes: candidate.triggerMinutes,
    setupMinutes: candidate.setupMinutes,
    trendMinutes: candidate.trendMinutes,
    detectedAt: input.at,
    live: toLiveSignal(input.id, input.symbol, input.creation, input.at),
  };
}

/** The shape `transition` expects back on the next cycle. */
function toLiveSignal(
  id: string,
  symbol: string,
  creation: SignalCreation,
  at: number,
): LiveSignal {
  const candidate: SignalCandidate = creation.candidate;
  return {
    id,
    symbol,
    setupKey: candidate.setupKey,
    kind: candidate.kind,
    direction: candidate.direction,
    state: creation.state,
    score: candidate.score,
    quality: candidate.quality,
    levels: candidate.levels,
    invalidations: candidate.invalidations,
    createdAt: at,
    updatedAt: at,
    triggeredAt: creation.triggeredAt,
    referencePrice: creation.referencePrice,
    holds: 0,
    maxFavourable: 0,
    maxAdverse: 0,
    endedAt: null,
    endReason: null,
  };
}

function applyUpdate(live: LiveSignal, change: SignalUpdate, at: number): LiveSignal {
  return {
    ...live,
    state: change.state,
    score: change.score,
    quality: change.quality,
    holds: change.holds,
    maxFavourable: change.maxFavourable,
    maxAdverse: change.maxAdverse,
    triggeredAt: change.triggeredAt,
    referencePrice: change.referencePrice,
    levels: change.levels,
    endedAt: change.endedAt,
    endReason: change.endReason,
    updatedAt: at,
  };
}

/** A finished replay signal, as a row for `backtest_signals`. */
function toRow(signal: ReplaySignal, trade: PaperTrade | null): BacktestSignalInput {
  const { live } = signal;
  return {
    instrumentId: signal.instrumentId,
    setupKey: live.setupKey,
    kind: live.kind,
    direction: live.direction,
    strategy: signal.strategy,
    state: live.state,
    regime: signal.regime,
    score: live.score,
    quality: live.quality,
    scoring: signal.scoring,
    entryLow: live.levels.entryLow,
    entryHigh: live.levels.entryHigh,
    invalidationLevel: live.levels.invalidation,
    target1: live.levels.target1,
    target2: live.levels.target2,
    riskPaise: live.levels.risk,
    rewardPaise: live.levels.reward,
    riskReward: live.levels.riskReward,
    costPaise: Math.round(live.levels.costPaise),
    netRewardPaise: Math.round(live.levels.netReward),
    netRiskPaise: Math.round(live.levels.netRisk),
    netRiskReward: live.levels.netRiskReward,
    referencePrice: live.referencePrice,
    triggerMinutes: signal.triggerMinutes,
    setupMinutes: signal.setupMinutes,
    trendMinutes: signal.trendMinutes,
    indicatorSnapshot: signal.snapshot,
    factors: signal.components.map((component) => ({
      category: component.category,
      label: component.label,
      score: component.score,
      weight: component.weight,
      points: component.points,
      detail: component.detail,
    })),
    reasons: signal.reasons.map((reason) => ({
      key: reason.key,
      label: reason.label,
      detail: reason.detail,
      category: reason.category,
      polarity: reason.polarity,
    })),
    events: signal.events.map((event) => ({
      at: new Date(event.at).toISOString(),
      kind: event.kind,
      message: event.message,
      detail: event.detail,
      score: event.score,
      state: event.state,
    })),
    detectedAt: new Date(signal.detectedAt),
    triggeredAt: live.triggeredAt === null ? null : new Date(live.triggeredAt),
    endedAt: live.endedAt === null ? null : new Date(live.endedAt),
    endReason: live.endReason,
    trade:
      trade === null
        ? null
        : {
            entryAt: new Date(trade.entryAt),
            entryPrice: trade.entryPrice,
            exitAt: new Date(trade.exitAt),
            exitPrice: trade.exitPrice,
            exitReason: trade.exitReason,
            grossPaise: Math.round(trade.grossPaise),
            costPaise: Math.round(trade.costPaise),
            netPaise: Math.round(trade.netPaise),
            rMultiple: trade.rMultiple,
            maxFavourable: Math.round(trade.maxFavourable),
            maxAdverse: Math.round(trade.maxAdverse),
            barsHeld: trade.barsHeld,
            reachedTarget2: trade.reachedTarget2,
          },
  };
}

// ---------------------------------------------------------------------------
// Market context, sliced per cycle
// ---------------------------------------------------------------------------

interface MarketRead {
  readonly benchmarkMinute: readonly StoredBar[];
  readonly benchmarkDaily: readonly StoredBar[];
  readonly bankingChangePercent: number | null;
  readonly volatilityLevel: number | null;
  readonly volatilityPreviousClose: number | null;
}

/**
 * Index series as they stood at `stamp`.
 *
 * Every series is truncated the same way the symbol's own bars are. Reading the
 * benchmark's full session while the symbol sees only part of it would put a
 * price from the future into the score — the subtlest possible form of
 * lookahead, because it never touches the symbol's own data.
 *
 * Anything unavailable stays `null` rather than defaulting, so partial context
 * is scaled honestly by `buildMarketContext` instead of being treated as "the
 * market is fine".
 */
function readMarketContext(input: {
  readonly refs: ContextRefs;
  readonly contextToday: ReadonlyMap<number, StoredBar[]>;
  readonly contextDaily: ReadonlyMap<number, StoredBar[]>;
  readonly stamp: number;
}): MarketRead {
  const { refs, contextToday, contextDaily, stamp } = input;

  const minuteFor = (id: number | null): readonly StoredBar[] =>
    id === null ? [] : upTo(contextToday.get(id) ?? [], stamp);
  const previousCloseFor = (id: number | null): number | null =>
    id === null ? null : (contextDaily.get(id)?.at(-1)?.close ?? null);

  const bankingMinute = minuteFor(refs.banking);
  const bankingLast = bankingMinute.at(-1)?.close ?? null;
  const bankingPrevious = previousCloseFor(refs.banking);

  const volatilityMinute = minuteFor(refs.volatility);

  return {
    benchmarkMinute: minuteFor(refs.benchmark),
    benchmarkDaily: refs.benchmark === null ? [] : (contextDaily.get(refs.benchmark) ?? []),
    bankingChangePercent:
      bankingLast === null || bankingPrevious === null || bankingPrevious === 0
        ? null
        : ((bankingLast - bankingPrevious) / bankingPrevious) * 100,
    volatilityLevel: volatilityMinute.at(-1)?.close ?? null,
    volatilityPreviousClose: previousCloseFor(refs.volatility),
  };
}

// --- Reporting ---------------------------------------------------------------

function report(
  records: readonly TradeRecord[],
  config: IntradayConfig,
  overall: ReturnType<typeof summarisePaperTrades>,
): void {
  line('OVERALL');
  if (overall.trades === 0) {
    console.log('  No trades. Either the filters are too tight or the window has no data.');
    console.log('');
    return;
  }

  console.log(`  trades            ${overall.trades}`);
  console.log(
    `  hit rate          ${(overall.hitRate * 100).toFixed(1)}%` +
      `   (${overall.wins}W / ${overall.losses}L / ${overall.scratches} scratch)`,
  );
  console.log(
    `  expectancy        ${signed(overall.expectancyR)}R per trade   ← the number that decides viability`,
  );
  console.log(`  profit factor     ${overall.profitFactor?.toFixed(2) ?? '—'}`);
  console.log(
    `  average win       ${signed(overall.averageWinR)}R      average loss ${signed(overall.averageLossR)}R`,
  );
  console.log(`  average hold      ${overall.averageBarsHeld.toFixed(0)} minutes`);
  console.log('');
  console.log(
    `  breakeven hit rate needed: ${breakeven(overall.averageWinR, overall.averageLossR)}`,
  );
  console.log('');

  bucket('BY SCORE BAND', records, (r) => band(r.score, config));
  bucket('BY STRATEGY', records, (r) => r.strategy);
  bucket('BY DIRECTION', records, (r) => r.direction);
  bucket('BY REGIME', records, (r) => r.regime);
  bucket('BY EXIT', records, (r) => r.trade.exitReason);

  line('HONEST READING');
  const sample = overall.trades;
  if (sample < 100) {
    console.log(`  ${sample} trades is a SMALL SAMPLE. At this size the hit rate carries a`);
    console.log(
      `  margin of error of roughly ±${(100 / Math.sqrt(sample)).toFixed(0)} percentage points, which is wider`,
    );
    console.log('  than most of the differences between the buckets above. Do not tune');
    console.log('  the config on a difference this size — it will not survive contact');
    console.log('  with the next month.');
  } else {
    console.log(`  ${sample} trades. Enough to take the overall expectancy seriously;`);
    console.log('  individual buckets are still thin.');
  }
  console.log('');
  console.log('  This measures the ENGINE, not your trading. It assumes every signal is');
  console.log("  taken mechanically, at the next minute's open, exited at the level or");
  console.log('  the bell, with no discretion and no missed fills.');
  console.log('');
  console.log('  UNIVERSE IS UNDATED: today’s index membership was applied to every past');
  console.log('  session, so companies dropped from the index since are invisible here.');
  console.log('  That flatters the result by an unknown amount.');
  console.log('');
}

/**
 * Why setups did NOT become trades.
 *
 * The most useful panel in the report when the trade count is low: it is the
 * difference between "the market was quiet" and "a filter is set wrong", which
 * look identical from the trade list alone.
 */
function reportRejections(rejections: ReadonlyMap<string, number>): void {
  line('WHY SETUPS DID NOT BECOME TRADES');
  const rows = [...rejections.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const total = [...rejections.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    console.log('  Nothing was rejected — no strategy produced evidence at all.');
    console.log('');
    return;
  }
  for (const [reason, count] of rows) {
    const share = ((count / total) * 100).toFixed(1);
    console.log(`  ${String(count).padStart(7)}  ${share.padStart(5)}%  ${reason}`);
  }
  console.log('');
}

function band(score: number, config: IntradayConfig): string {
  const bands = Object.entries(config.quality).sort(([, a], [, b]) => b - a);
  for (const [name, floor] of bands) {
    if (score >= floor) return `${name} (${floor}+)`;
  }
  return 'below floor';
}

function bucket(
  title: string,
  records: readonly TradeRecord[],
  key: (record: TradeRecord) => string,
): void {
  const groups = new Map<string, TradeRecord[]>();
  for (const record of records) {
    const name = key(record);
    const list = groups.get(name) ?? [];
    list.push(record);
    groups.set(name, list);
  }

  line(title);
  console.log('  BUCKET                     N     HIT%    EXPECTANCY    PF');
  const rows = [...groups.entries()]
    .map(([name, list]) => ({ name, stats: summarisePaperTrades(list.map((r) => r.trade)) }))
    .sort((a, b) => b.stats.expectancyR - a.stats.expectancyR);
  for (const { name, stats } of rows) {
    if (stats.trades === 0) continue;
    console.log(
      `  ${name.padEnd(24)} ${String(stats.trades).padStart(4)}` +
        `  ${(stats.hitRate * 100).toFixed(1).padStart(6)}%` +
        `  ${signed(stats.expectancyR).padStart(9)}R` +
        `  ${(stats.profitFactor?.toFixed(2) ?? '—').padStart(6)}`,
    );
  }
  console.log('');
}

/** The hit rate this win/loss geometry needs merely to break even, 0-1. */
function breakevenRate(averageWinR: number, averageLossR: number): number | null {
  const loss = Math.abs(averageLossR);
  if (averageWinR <= 0 || loss === 0) return null;
  return loss / (averageWinR + loss);
}

function breakeven(averageWinR: number, averageLossR: number): string {
  const rate = breakevenRate(averageWinR, averageLossR);
  return rate === null ? 'undefined — there were no winners' : `${(rate * 100).toFixed(1)}%`;
}

const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;

function line(title: string): void {
  console.log('-'.repeat(78));
  console.log(title);
  console.log('-'.repeat(78));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
