/**
 * Deletes all but the newest N backtest runs.
 *
 * `backtest_signals` is the only table in this system that grows per
 * EXPERIMENT rather than per trading day, and a parameter sweep writes one run
 * per grid point. Each run is small — a 73-session run is roughly a couple of
 * megabytes — but twenty sweeps of twenty points each is not, and there is no
 * reason to keep the losing points of a sweep from three weeks ago.
 *
 * Signals and trades cascade from the run row, so one delete clears all three
 * tables.
 *
 * Usage:
 *   pnpm backtest:prune                 keep the newest 25 runs
 *   pnpm backtest:prune --keep 5        keep the newest 5
 *   pnpm backtest:prune --keep 0        delete every run
 *   pnpm backtest:prune --dry-run       show what would go, delete nothing
 *
 * It touches NO live table. `intraday_signals` and `paper_trades` are not
 * reachable from here.
 */

import { createDatabase, listBacktestRuns, pruneBacktestRuns } from '@equitywise/db';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const index = argv.indexOf('--keep');
  const keep = index === -1 ? 25 : Number(argv[index + 1]);
  if (!Number.isInteger(keep) || keep < 0) {
    throw new Error('--keep expects a non-negative integer');
  }
  const dryRun = argv.includes('--dry-run');

  const handle = createDatabase({});
  try {
    // A generous read, so the listing shows what survives AND what does not
    // rather than only the survivors — deleting results is the kind of thing
    // that should be visible before it happens.
    const runs = await listBacktestRuns(handle.db, 200);
    if (runs.length === 0) {
      console.log('No backtest runs stored.');
      return;
    }

    const doomed = runs.slice(keep);
    console.log(`${runs.length} run(s) stored; keeping the newest ${keep}.`);
    console.log('');

    if (doomed.length === 0) {
      console.log('Nothing to delete.');
      return;
    }

    console.log('WOULD DELETE:');
    for (const run of doomed) {
      console.log(
        `  #${String(run.id).padStart(4)}  ${run.fromDate}…${run.toDate}` +
          `  ${String(run.tradesRecorded).padStart(4)} trades` +
          `  ${run.status.padEnd(9)}  ${run.label ?? '(no label)'}`,
      );
    }
    console.log('');

    if (dryRun) {
      console.log('--dry-run: nothing was deleted.');
      return;
    }

    const deleted = await pruneBacktestRuns(handle.db, keep);
    console.log(`Deleted ${deleted} run(s), with their signals and trades.`);
    console.log('');
    console.log('Reclaim the space with a VACUUM if the database is tight:');
    console.log('  VACUUM (ANALYZE) backtest_signals, backtest_trades, backtest_runs;');
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
