/**
 * Runs one intraday evaluation cycle and reports exactly what the engine saw.
 *
 * The tool for answering "is this thing actually working, and does it agree
 * with a chart?" It pulls real market data, runs the real engine, writes real
 * rows, and then prints the evidence behind every setup it produced — plus,
 * crucially, why it declined to produce the others. A quiet feed and a broken
 * feed look identical from the outside; this is how they are told apart.
 *
 * Usage:
 *   pnpm verify:intraday                      run for right now
 *   pnpm verify:intraday --at "2026-08-21 12:00"   replay a past instant (IST)
 *   pnpm verify:intraday --symbol RELIANCE    explain one symbol in full
 *   pnpm verify:intraday --scan               score every symbol, write nothing
 *   pnpm verify:intraday --dry                measure only; write nothing
 *
 * Replaying a past instant is safe and honest: the engine is pure and only ever
 * reads CLOSED bars, so evaluating "as of 12:00" uses exactly the data that
 * existed at 12:00 (CLAUDE.md hard rule 2).
 *
 * Requires FYERS_APP_ID / FYERS_ACCESS_TOKEN and DATABASE_URL in .env.
 */

import {
  buildVolumeProfile,
  emptyMarketContext,
  evaluateIntraday,
  REGIME_LABEL,
  sessionRegime,
} from '@signal/core';
import { createDatabase, getDailyBars, getMinuteBars, resolveInstrumentIds } from '@signal/db';
import { formatPaise, fromIstParts, istDateKey, sessionOpen, toIstIsoString } from '@signal/shared';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

const MS_PER_DAY = 86_400_000;

function parseArgs(argv: readonly string[]): {
  at: Date;
  symbol: string | null;
  dry: boolean;
  scan: boolean;
} {
  let at = new Date();
  let symbol: string | null = null;
  let dry = false;
  let scan = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--at') {
      const value = argv[i + 1];
      if (value === undefined) throw new Error('--at needs a value, e.g. "2026-08-21 12:00"');
      at = parseIst(value);
      i += 1;
    } else if (arg === '--symbol') {
      const value = argv[i + 1];
      if (value === undefined) throw new Error('--symbol needs a value, e.g. RELIANCE');
      symbol = value.toUpperCase();
      i += 1;
    } else if (arg === '--dry') {
      dry = true;
    } else if (arg === '--scan') {
      scan = true;
    }
  }
  return { at, symbol, dry, scan };
}

/** `YYYY-MM-DD HH:MM` read as IST, because that is how a trader states a time. */
function parseIst(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(value.trim());
  if (match === null) {
    const fallback = new Date(value);
    if (Number.isNaN(fallback.getTime())) {
      throw new Error(`Could not read "${value}" as a time. Use "YYYY-MM-DD HH:MM" (IST).`);
    }
    return fallback;
  }
  const [, year, month, day, hour, minute] = match;
  return fromIstParts({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  });
}

async function main(): Promise<void> {
  const { at, symbol, dry, scan } = parseArgs(process.argv.slice(2));

  // Imported lazily so `--help`-style misuse fails before opening a pool.
  const { loadIntradaySettings } = await import('../apps/worker/src/intraday-config.js');
  const { runIntradayCycle } = await import('../apps/worker/src/jobs/intraday-signals.js');
  const { createContext } = await import('../apps/worker/src/context.js');
  const { createLogger } = await import('../apps/worker/src/log.js');
  const { recordPaperTrades } = await import('../apps/worker/src/jobs/paper-trades.js');

  const settings = await loadIntradaySettings();
  const regime = sessionRegime(at, settings.config);

  console.log('='.repeat(78));
  console.log('INTRADAY ENGINE VERIFICATION');
  console.log('='.repeat(78));
  console.log(`  evaluating as of  ${toIstIsoString(at)}`);
  console.log(`  trading date      ${istDateKey(at)}`);
  console.log(`  session regime    ${REGIME_LABEL[regime]} (${regime})`);
  console.log(`  universe          ${settings.universe.index}`);
  console.log(
    `  timeframes        trend ${settings.config.timeframes.trend}m ·` +
      ` setup ${settings.config.timeframes.setup}m ·` +
      ` trigger ${settings.config.timeframes.trigger}m`,
  );
  console.log(`  score floor       ${settings.config.minScore}/100`);
  console.log('');

  if (regime === 'closed' || regime === 'pre_open') {
    console.log('  NOTE: the market is not in continuous trading at this instant, so the');
    console.log('        engine will measure but emit nothing. Pass --at with a weekday');
    console.log('        time between 09:35 and 14:55 IST to see it produce setups.');
    console.log('');
  }

  if (symbol !== null) {
    await explainSymbol(symbol, at, settings);
    return;
  }

  if (scan) {
    const { loadIndexConstituents } = await import('../apps/worker/src/universe.js');
    await scanUniverse(await loadIndexConstituents(settings.universe.index), at, settings);
    return;
  }

  if (dry) {
    console.log('  --dry given: measuring without writing. Use --symbol for detail.');
    console.log('');
  }

  const context = createContext();
  try {
    const log = createLogger('verify');
    const result = await runIntradayCycle(context, log, { now: at, force: true });

    console.log('');
    console.log('-'.repeat(78));
    console.log('CYCLE RESULT');
    console.log('-'.repeat(78));
    console.log(`  symbols evaluated ${result.evaluated}`);
    console.log(`  signals created   ${result.created}`);
    console.log(`  signals updated   ${result.updated}`);
    console.log(`  symbols skipped   ${result.skipped.length}`);
    for (const skip of result.skipped.slice(0, 10)) {
      console.log(`      ${skip.symbol.padEnd(14)} ${skip.reason}`);
    }

    // Grade the day against the tape. Runs here rather than only in the
    // scheduler so a replayed session produces its outcomes too, which is what
    // makes this script usable as an end-to-end check of the whole path.
    const paper = await recordPaperTrades(context, log.child('paper'), {
      now: at,
      config: settings.config,
    });
    console.log('');
    console.log(
      `  paper outcomes    ${paper.recorded} recorded, ${paper.skipped} skipped` +
        ` (of ${paper.considered} triggered)`,
    );

    const { db } = context;
    const rows = await db.execute<{
      symbol: string;
      direction: string;
      kind: string;
      state: string;
      score: number;
      quality: string;
      entry_low: number;
      invalidation_level: number;
      target1: number;
      risk_reward: number | null;
    }>(`
      SELECT i.symbol, s.direction, s.kind, s.state, s.score, s.quality,
             s.entry_low, s.invalidation_level, s.target1, s.risk_reward
      FROM intraday_signals s
      JOIN instruments i ON i.id = s.instrument_id
      WHERE s.trading_date = '${istDateKey(at)}'
      ORDER BY s.ended_at NULLS FIRST, s.score DESC
      LIMIT 20
    `);

    console.log('');
    console.log('-'.repeat(78));
    console.log(`SIGNALS STORED FOR ${istDateKey(at)}`);
    console.log('-'.repeat(78));
    if (rows.rows.length === 0) {
      console.log('  none — see the cycle result above and the worker log lines for why.');
    } else {
      console.log(
        `  ${'SYMBOL'.padEnd(13)}${'ACT'.padEnd(6)}${'SETUP'.padEnd(22)}${'STATE'.padEnd(12)}${'SCORE'.padEnd(7)}R:R`,
      );
      for (const row of rows.rows) {
        const action = row.direction === 'long' ? 'BUY' : 'SELL';
        console.log(
          `  ${row.symbol.padEnd(13)}${action.padEnd(6)}${row.kind.padEnd(22)}${row.state.padEnd(12)}${String(row.score).padEnd(7)}${row.risk_reward?.toFixed(2) ?? '—'}`,
        );
        console.log(
          `      entry ~${formatPaise(row.entry_low)} · invalidation ${formatPaise(row.invalidation_level)} · target 1 ${formatPaise(row.target1)}`,
        );
      }
    }
  } finally {
    await context.close();
  }
}

/**
 * Scores every symbol read-only, so the score DISTRIBUTION is visible.
 *
 * The question this answers is the one an empty feed cannot: is the engine
 * finding nothing because the market offered nothing, or because a threshold
 * is set where nothing can ever reach it? A column of 55s means the former is
 * a lie and the floor needs re-examining; a column of 20s means the session
 * genuinely had no confluence in it.
 */
async function scanUniverse(
  constituents: readonly { symbol: string }[],
  at: Date,
  settings: { config: Parameters<typeof evaluateIntraday>[1] & object },
): Promise<void> {
  const { db, close } = createDatabase();
  try {
    const config = settings.config;
    const sessionStart = sessionOpen(at);
    const profileFrom = new Date(at.getTime() - 18 * MS_PER_DAY);

    const rows: { symbol: string; best: number; kind: string; note: string }[] = [];

    for (const { symbol } of constituents) {
      const ids = await resolveInstrumentIds(db, [symbol]);
      const instrumentId = ids.get(symbol);
      if (instrumentId === undefined) continue;

      const [minute, daily, priorMinute] = await Promise.all([
        getMinuteBars(db, { instrumentId, from: sessionStart, to: at, raw: true }),
        getDailyBars(db, { instrumentId, from: new Date(0), to: sessionStart, limit: 40 }),
        getMinuteBars(db, { instrumentId, from: profileFrom, to: sessionStart }),
      ]);

      const evaluation = evaluateIntraday(
        {
          symbol,
          bars: {
            minute,
            history: priorMinute,
            daily,
            volumeProfile: buildVolumeProfile(priorMinute, config),
          },
          context: emptyMarketContext('NIFTY50'),
          at,
        },
        config,
      );

      const best = evaluation.candidates[0];
      if (best !== undefined) {
        rows.push({
          symbol,
          best: best.score,
          kind: best.kind,
          note: best.triggered ? 'TRIGGERED' : 'forming',
        });
        continue;
      }

      // Recover the highest score the scorer rejected, so near-misses are visible.
      const scores = evaluation.rejections
        .map((rejection) => /scored (\d+)/.exec(rejection)?.[1])
        .filter((value): value is string => value !== undefined)
        .map(Number);
      rows.push({
        symbol,
        best: scores.length === 0 ? 0 : Math.max(...scores),
        kind: '—',
        note: evaluation.rejections[0] ?? 'no candidate produced',
      });
    }

    rows.sort((a, b) => b.best - a.best);

    console.log('-'.repeat(78));
    console.log('SCORE DISTRIBUTION (read-only)');
    console.log('-'.repeat(78));
    for (const row of rows) {
      console.log(
        `  ${row.symbol.padEnd(14)}${String(row.best).padStart(3)}  ${row.kind.padEnd(18)}${row.note.slice(0, 42)}`,
      );
    }

    const surfaced = rows.filter((row) => row.kind !== '—').length;
    const near = rows.filter((row) => row.kind === '—' && row.best >= 50).length;
    console.log('');
    console.log(`  surfaced ${surfaced} · near miss (50-59) ${near} · scored ${rows.length}`);
  } finally {
    await close();
  }
}

/**
 * Everything the engine measured for one symbol, and every rejection.
 *
 * Read-only: it never writes a signal, so it is safe to run repeatedly while
 * comparing the numbers against a chart.
 */
async function explainSymbol(
  symbol: string,
  at: Date,
  settings: {
    config: Parameters<typeof evaluateIntraday>[1] & object;
    universe: { index: string };
  },
): Promise<void> {
  const { db, close } = createDatabase();
  try {
    const ids = await resolveInstrumentIds(db, [symbol]);
    const instrumentId = ids.get(symbol);
    if (instrumentId === undefined) {
      console.log(`  ${symbol} is not a known instrument. Run the worker's ingest first.`);
      return;
    }

    const sessionStart = sessionOpen(at);
    const profileFrom = new Date(at.getTime() - 18 * MS_PER_DAY);

    const [minute, daily, priorMinute] = await Promise.all([
      getMinuteBars(db, { instrumentId, from: sessionStart, to: at, raw: true }),
      getDailyBars(db, { instrumentId, from: new Date(0), to: sessionStart, limit: 40 }),
      getMinuteBars(db, { instrumentId, from: profileFrom, to: sessionStart }),
    ]);

    const config = settings.config;
    const volumeProfile = buildVolumeProfile(priorMinute, config);

    const evaluation = evaluateIntraday(
      {
        symbol,
        bars: { minute, history: priorMinute, daily, volumeProfile },
        context: emptyMarketContext('NIFTY50'),
        at,
      },
      config,
    );

    const s = evaluation.snapshot;
    console.log('-'.repeat(78));
    console.log(`${symbol} — MEASURED STATE`);
    console.log('-'.repeat(78));
    console.log(`  session 1m bars     ${minute.length}`);
    console.log(`  prior daily bars    ${daily.length}`);
    console.log(`  data usable         ${evaluation.dataQuality.usable}`);
    if (evaluation.dataQuality.issues.length > 0) {
      for (const issue of evaluation.dataQuality.issues) console.log(`      ! ${issue}`);
    }
    console.log(`  last price          ${formatPaise(s.price)}`);
    console.log(
      `  VWAP                ${s.vwap === null ? '—' : formatPaise(s.vwap)}` +
        ` (${s.vwapDistancePercent?.toFixed(2) ?? '—'}% away, slope ${s.vwapSlopePercent?.toFixed(3) ?? '—'}%)`,
    );
    console.log(`  EMA 9 / 20 / 50     ${fmt(s.ema9)} / ${fmt(s.ema20)} / ${fmt(s.ema50)}`);
    console.log(`  RSI / ADX           ${s.rsi?.toFixed(1) ?? '—'} / ${s.adx?.toFixed(0) ?? '—'}`);
    console.log(
      `  ATR                 ${fmt(s.atr)} (${s.atrPercent?.toFixed(2) ?? '—'}% of price)`,
    );
    console.log(
      `  relative volume     ${s.relativeVolume?.toFixed(2) ?? '—'}× session,` +
        ` ${s.barRelativeVolume?.toFixed(2) ?? '—'}× on the trigger bar`,
    );
    console.log(
      `  previous H/L/C      ${fmt(s.previousHigh)} / ${fmt(s.previousLow)} / ${fmt(s.previousClose)}`,
    );
    console.log(`  opening range       ${fmt(s.openingRangeHigh)} – ${fmt(s.openingRangeLow)}`);
    console.log('  trends');
    for (const trend of s.trends) {
      console.log(
        `      ${String(trend.minutes).padStart(3)}m  ${trend.direction.padEnd(6)}` +
          ` strength ${trend.strength.toFixed(2)}  ${trend.detail}`,
      );
    }

    console.log('');
    console.log(`  CANDIDATES (${evaluation.candidates.length})`);
    for (const candidate of evaluation.candidates) {
      const action = candidate.direction === 'long' ? 'BUY' : 'SELL';
      console.log(
        `      ${action} ${candidate.kind} — ${candidate.score}/100 (${candidate.quality})` +
          `${candidate.triggered ? ' TRIGGERED' : ' forming'}`,
      );
      for (const component of candidate.components) {
        console.log(
          `          ${component.label.padEnd(16)} ${component.points.toFixed(1).padStart(5)}` +
            ` / ${String(component.weight).padStart(2)}   ${component.detail}`,
        );
      }
      for (const reason of candidate.reasons) {
        const mark =
          reason.polarity === 'supporting' ? '+' : reason.polarity === 'opposing' ? '-' : '·';
        console.log(`          ${mark} ${reason.label}: ${reason.detail}`);
      }
      console.log(
        `          entry ${formatPaise(candidate.levels.entryLow)}–${formatPaise(candidate.levels.entryHigh)}` +
          ` · invalidation ${formatPaise(candidate.levels.invalidation)}` +
          ` · targets ${formatPaise(candidate.levels.target1)} / ${formatPaise(candidate.levels.target2)}` +
          ` · R:R ${candidate.levels.riskReward?.toFixed(2) ?? '—'}`,
      );
    }

    console.log('');
    console.log(`  REJECTED (${evaluation.rejections.length}) — why nothing else surfaced`);
    for (const rejection of evaluation.rejections) console.log(`      · ${rejection}`);
  } finally {
    await close();
  }
}

function fmt(paise: number | null): string {
  return paise === null ? '—' : formatPaise(paise);
}

main().catch((error: unknown) => {
  console.error('\nfatal:', error);
  process.exitCode = 1;
});
