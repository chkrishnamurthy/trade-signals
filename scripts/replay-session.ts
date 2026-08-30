/**
 * Replays one whole trading session through the REAL worker path.
 *
 * The backtester runs the engine in memory; this runs the database path — the
 * same `runIntradayCycle` the scheduler calls, writing real signals, real
 * factor breakdowns and real lifecycle events, then grading them with the real
 * paper-trade recorder. It is the end-to-end check that what will happen on
 * Monday actually works, and the tool for reconstructing a session afterwards
 * if something looks wrong.
 *
 * Candles are NOT re-fetched: they are already stored, and re-requesting them
 * once per cycle would be thousands of upstream calls for data we have.
 *
 * ## This script WRITES TO THE LIVE TABLES
 *
 * That is the entire point of it — it exercises the real persistence path — and
 * it is also its one hazard. Rows land in `intraday_signals` and `paper_trades`
 * under the replayed trading date, where `/signals/performance` cannot tell them
 * apart from signals the worker genuinely produced that day. A replay run out of
 * curiosity silently becomes part of the record the engine is judged by.
 *
 * So it now refuses to run without `--write-live`. For measuring the engine,
 * reach for the backtester instead, which stores its results in
 * `backtest_signals` / `backtest_trades` and cannot touch the live tables:
 *
 *   pnpm backtest:intraday --from 2026-08-21 --to 2026-08-21
 *
 * A properly isolated replay of the database path — same code, backtest tables —
 * arrives with the sink abstraction in a later phase; see
 * `docs/backtesting-architecture.md`.
 *
 * Usage:
 *   pnpm replay:session 2026-08-21 --write-live
 *   pnpm replay:session 2026-08-21 --write-live --cycle 5
 */

import { minutesToClose, REGIME_LABEL, sessionRegime } from '@equitywise/core';
import { istDateKey, sessionOpen, toIstIsoString } from '@equitywise/shared';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

const MS_PER_MINUTE = 60_000;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const date = argv.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  if (date === undefined) {
    throw new Error('usage: pnpm replay:session YYYY-MM-DD --write-live [--cycle N]');
  }

  // Opt-in rather than opt-out. The rows this writes are indistinguishable from
  // genuinely live ones afterwards, and there is no undo — so the destructive
  // default is the wrong one, however convenient.
  if (!argv.includes('--write-live')) {
    throw new Error(
      `Refusing to run: this writes real rows into intraday_signals and paper_trades for ${date},\n` +
        '  where /signals/performance cannot tell them apart from genuinely live results.\n\n' +
        '  To MEASURE the engine, use the backtester — isolated results, live tables untouched:\n' +
        `    pnpm backtest:intraday --from ${date} --to ${date}\n\n` +
        '  To exercise the real database write path anyway, pass --write-live.',
    );
  }

  const cycleIndex = argv.indexOf('--cycle');
  const cycleOverride = cycleIndex === -1 ? null : Number(argv[cycleIndex + 1]);

  const { loadIntradaySettings } = await import('../apps/worker/src/intraday-config.js');
  const { runIntradayCycle } = await import('../apps/worker/src/jobs/intraday-signals.js');
  const { recordPaperTrades } = await import('../apps/worker/src/jobs/paper-trades.js');
  const { createContext } = await import('../apps/worker/src/context.js');
  const { createLogger } = await import('../apps/worker/src/log.js');

  const settings = await loadIntradaySettings();
  const config = settings.config;
  const cycleMinutes = cycleOverride ?? settings.cycleMinutes;

  const anchor = new Date(`${date}T12:00:00+05:30`);
  const open = sessionOpen(anchor);
  const first = open.getTime() + config.session.warmupMinutes * MS_PER_MINUTE;
  const last =
    open.getTime() + (375 - config.session.noNewSignalsBeforeCloseMinutes) * MS_PER_MINUTE;

  console.log('='.repeat(78));
  console.log(`SESSION REPLAY — ${date}`);
  console.log('='.repeat(78));
  console.log(`  cycles            every ${cycleMinutes}m from ${toIstIsoString(new Date(first))}`);
  console.log('  candles           read from storage, not re-fetched');
  console.log('');

  const context = createContext();
  const log = createLogger('replay');
  let created = 0;
  let updated = 0;

  try {
    for (let stamp = first; stamp <= last; stamp += cycleMinutes * MS_PER_MINUTE) {
      const at = new Date(stamp);
      const result = await runIntradayCycle(context, log, { now: at, force: true, ingest: false });
      created += result.created;
      updated += result.updated;
      if (result.created > 0 || result.updated > 0) {
        console.log(
          `  ${toIstIsoString(at).slice(11, 16)}  ${REGIME_LABEL[sessionRegime(at, config)].padEnd(10)}` +
            `  +${result.created} created  ~${result.updated} updated`,
        );
      }
    }

    // Grade once, at the end, when the whole session's bars are available.
    const settle = new Date(open.getTime() + 375 * MS_PER_MINUTE);
    const paper = await recordPaperTrades(context, log, { now: settle, config });

    console.log('');
    console.log('-'.repeat(78));
    console.log(`  signals created   ${created}`);
    console.log(`  signals updated   ${updated}`);
    console.log(
      `  paper outcomes    ${paper.recorded} recorded, ${paper.skipped} skipped` +
        ` (of ${paper.considered} triggered)`,
    );
    console.log(`  trading date      ${istDateKey(settle)}, ${minutesToClose(settle)}m to close`);
    console.log('');
    console.log('  See /signals/performance for the graded results.');
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
