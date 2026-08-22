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
 * Usage:
 *   pnpm replay:session 2026-08-21
 *   pnpm replay:session 2026-08-21 --cycle 5
 */

import { minutesToClose, REGIME_LABEL, sessionRegime } from '@wealthos/core';
import { istDateKey, sessionOpen, toIstIsoString } from '@wealthos/shared';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

const MS_PER_MINUTE = 60_000;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const date = argv.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  if (date === undefined) throw new Error('usage: pnpm replay:session YYYY-MM-DD [--cycle N]');

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
