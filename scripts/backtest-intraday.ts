/**
 * Replays the live intraday engine over stored candles and scores what would
 * have happened.
 *
 * This is the only honest answer to "is this thing any good". The engine is
 * pure (CLAUDE.md hard rule 1), so this script runs the exact same
 * `evaluateIntraday` the worker runs; nothing is reimplemented for backtesting
 * and the two cannot drift apart. Every fill is the next bar's OPEN after the
 * evaluation instant (rule 2), and every outcome is charged real transaction
 * costs and slippage.
 *
 * Three pessimistic assumptions are baked in, because a backtest that flatters
 * itself is worse than no backtest at all:
 *
 *   - a bar that spans both the stop and the target counts as a STOP;
 *   - trades are resolved on 1m bars, so intrabar stop hits are caught;
 *   - positions are force-closed before the bell, never carried.
 *
 * Usage:
 *   pnpm backtest:intraday                          last 10 stored sessions
 *   pnpm backtest:intraday --from 2026-08-01        an explicit window
 *   pnpm backtest:intraday --min-score 75           try a different floor
 *   pnpm backtest:intraday --json out/trades.json   write every trade
 *
 * It writes NOTHING to the database. Reads only.
 */

import { writeFile } from 'node:fs/promises';
import {
  buildMarketContext,
  buildVolumeProfile,
  evaluateIntraday,
  type IntradayConfig,
  type PaperTrade,
  resolvePaperTrade,
  type SessionRegime,
  sessionRegime,
  summarisePaperTrades,
} from '@equitywise/core';
import {
  createDatabase,
  getDailyBarsForInstruments,
  getMinuteBarsForInstruments,
  resolveInstrumentIds,
  type StoredBar,
} from '@equitywise/db';
import { istDateKey, sessionClose, sessionOpen } from '@equitywise/shared';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** One recorded paper trade, plus the signal metadata needed to slice results. */
interface Record {
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

    const dates = await tradingDates(db, instrumentIds, args);

    console.log('='.repeat(78));
    console.log('INTRADAY ENGINE BACKTEST');
    console.log('='.repeat(78));
    console.log(`  sessions          ${dates.length} (${dates[0]} … ${dates.at(-1)})`);
    console.log(`  universe          ${settings.universe.index}, ${instrumentIds.length} symbols`);
    console.log(`  cycle             every ${cycleMinutes}m`);
    console.log(`  score floor       ${config.minScore}/100`);
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

    const records: Record[] = [];
    const rejections = new Map<string, number>();
    for (const date of dates) {
      const session = await replaySession(db, {
        date,
        instrumentIds,
        symbolById,
        sectorBySymbol,
        config,
        cycleMinutes,
        benchmarkSymbol: settings.universe.benchmark ?? 'NIFTY50',
      });
      records.push(...session.records);
      for (const [reason, count] of session.rejections) {
        rejections.set(reason, (rejections.get(reason) ?? 0) + count);
      }
      const stats = summarisePaperTrades(session.records.map((r) => r.trade));
      console.log(
        `  ${date}  signals ${String(session.records.length).padStart(3)}` +
          `   hit ${(stats.hitRate * 100).toFixed(0).padStart(3)}%` +
          `   expectancy ${stats.expectancyR >= 0 ? '+' : ''}${stats.expectancyR.toFixed(3)}R`,
      );
    }
    console.log('');

    report(records, config);
    reportRejections(rejections);

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
  db: Parameters<typeof getMinuteBarsForInstruments>[0],
  instrumentIds: readonly number[],
  args: Args,
): Promise<string[]> {
  const to = args.to === null ? new Date() : new Date(`${args.to}T23:59:59+05:30`);
  const from =
    args.from === null
      ? new Date(to.getTime() - (args.sessions + 12) * MS_PER_DAY)
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

interface SessionResult {
  readonly records: readonly Record[];
  readonly rejections: ReadonlyMap<string, number>;
}

interface ReplayInput {
  readonly date: string;
  readonly instrumentIds: readonly number[];
  readonly symbolById: ReadonlyMap<number, string>;
  readonly sectorBySymbol: ReadonlyMap<string, string>;
  readonly config: IntradayConfig;
  readonly cycleMinutes: number;
  readonly benchmarkSymbol: string;
}

/**
 * Replay one session.
 *
 * All the data for the day is read up front and then SLICED per cycle, rather
 * than re-queried: the slice is what makes this a replay rather than a
 * simulation, since each evaluation sees exactly the closed bars that existed
 * at that instant and not one more.
 */
async function replaySession(
  db: Parameters<typeof getMinuteBarsForInstruments>[0],
  input: ReplayInput,
): Promise<SessionResult> {
  const { date, instrumentIds, symbolById, sectorBySymbol, config, cycleMinutes } = input;

  const anchor = new Date(`${date}T12:00:00+05:30`);
  const open = sessionOpen(anchor);
  const close = sessionClose(anchor);
  const profileFrom = new Date(open.getTime() - (config.volume.profileSessions + 8) * MS_PER_DAY);

  const [today, prior, daily] = await Promise.all([
    getMinuteBarsForInstruments(db, { instrumentIds, from: open, to: close, raw: true }),
    getMinuteBarsForInstruments(db, { instrumentIds, from: profileFrom, to: open, raw: true }),
    getDailyBarsForInstruments(db, { instrumentIds, to: open, limit: 40 }),
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

  const records: Record[] = [];
  const taken = new Set<string>();
  const rejections = new Map<string, number>();

  for (let stamp = firstCycle; stamp <= lastCycle; stamp += cycleMinutes * MS_PER_MINUTE) {
    const at = new Date(stamp);
    const regime = sessionRegime(at, config);

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
          benchmarkSymbol: input.benchmarkSymbol,
          benchmarkMinuteBars: [],
          benchmarkDailyBars: [],
          bankNiftyChangePercent: null,
          breadth,
          sector,
          sectorChangePercent:
            moves === undefined || moves.length === 0
              ? null
              : moves.reduce((sum, value) => sum + value, 0) / moves.length,
          volatilityIndex: null,
          volatilityPreviousClose: null,
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

      for (const note of evaluation.rejections) {
        const reason = note.replace(/^[a-z_]+: /, '').replace(/[\d.]+/g, 'N');
        rejections.set(reason, (rejections.get(reason) ?? 0) + 1);
      }
      for (const candidate of evaluation.candidates) {
        if (!candidate.triggered) {
          rejections.set(
            'scored but not triggered',
            (rejections.get('scored but not triggered') ?? 0) + 1,
          );
          continue;
        }
        // One paper trade per setup per day: the same deduplication the live
        // engine applies, so the statistics describe the feed the user sees.
        const key = `${symbol}:${candidate.setupKey}`;
        if (taken.has(key)) continue;

        const trade = resolvePaperTrade({
          direction: candidate.direction,
          levels: candidate.levels,
          triggeredAt: stamp,
          bars: sessionMinutes,
          forceExitAt,
          costs: config.costs,
        });
        if (trade === null) continue;

        taken.add(key);
        records.push({
          tradingDate: date,
          symbol,
          kind: candidate.kind,
          strategy: candidate.strategy,
          direction: candidate.direction,
          score: candidate.score,
          quality: candidate.quality,
          regime,
          signalledAt: stamp,
          trade,
        });
      }
    }
  }

  return { records, rejections };
}

// --- Reporting ---------------------------------------------------------------

function report(records: readonly Record[], config: IntradayConfig): void {
  const overall = summarisePaperTrades(records.map((r) => r.trade));

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

function bucket(title: string, records: readonly Record[], key: (record: Record) => string): void {
  const groups = new Map<string, Record[]>();
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

function breakeven(averageWinR: number, averageLossR: number): string {
  const loss = Math.abs(averageLossR);
  if (averageWinR <= 0 || loss === 0) return 'undefined — there were no winners';
  return `${((loss / (averageWinR + loss)) * 100).toFixed(1)}%`;
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
