/**
 * What minute-candle history is stored, by IST trading date, and what the worker's
 * recent ingestion runs did (a `failed` or missing night is a hole indicators can
 * silently compute across).
 *
 * The first thing to check before trusting a backtest: a strong number over
 * eight sessions and a strong number over eighty are different claims.
 *
 *   pnpm data:coverage
 */
import { createDatabase, listIngestionRuns, minuteCandleCoverage } from '@equitywise/db';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

async function main(): Promise<void> {
  const handle = createDatabase({});
  try {
    const rows = await minuteCandleCoverage(handle.db);
    for (const row of rows) {
      console.log(
        `${row.tradingDate}  ${String(row.bars).padStart(8)} bars  ${String(row.instruments).padStart(3)} symbols`,
      );
    }
    console.log(`\n${rows.length} sessions stored`);

    const runs = await listIngestionRuns(handle.db, 40);
    console.log('\nRecent ingestion runs (newest first)');
    if (runs.length === 0) console.log('  none recorded yet');
    for (const run of runs) {
      const flag = run.status === 'ok' ? ' ' : '!';
      console.log(
        `${flag} ${run.tradingDate}  ${run.job.padEnd(17)} ${run.status.padEnd(8)} ` +
          `${run.instrumentsSucceeded}/${run.instrumentsRequested} ok, ${run.failedCount} failed, ${run.rowsWritten} rows` +
          (run.error === null ? '' : `  — ${run.error}`),
      );
    }
    const bad = runs.filter((run) => run.status !== 'ok');
    if (bad.length > 0)
      console.log(`\n${bad.length} of ${runs.length} recent runs were not fully ok (marked !)`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
