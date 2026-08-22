/**
 * Deepens stored 1-minute history for the intraday universe.
 *
 * The backtest is only as trustworthy as the number of sessions behind it, and
 * the live ingest loop deliberately only reaches back far enough to catch up
 * after an outage. This asks for the rest, once, on purpose.
 *
 * Usage:
 *   pnpm backfill:minutes --days 90
 *
 * Rate limits still apply — the provider's limiter paces this, so a deep
 * backfill takes minutes, not seconds. That is intended: a burst here is what
 * earned a twenty-minute upstream ban once already.
 */

import { config as loadEnv } from 'dotenv';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const index = argv.indexOf('--days');
  const days = index === -1 ? 90 : Number(argv[index + 1]);
  if (!Number.isFinite(days) || days <= 0) throw new Error('--days expects a positive number');

  const { loadIntradaySettings } = await import('../apps/worker/src/intraday-config.js');
  const { loadIndexConstituents } = await import('../apps/worker/src/universe.js');
  const { ingestIntradayCandles } = await import('../apps/worker/src/jobs/ingest-intraday.js');
  const { createContext } = await import('../apps/worker/src/context.js');
  const { createLogger } = await import('../apps/worker/src/log.js');

  const settings = await loadIntradaySettings();
  const constituents = await loadIndexConstituents(settings.universe.index);
  const context = createContext();
  const log = createLogger('backfill');

  console.log(`Backfilling ${days} days of 1m bars for ${constituents.length} symbols…`);
  const started = Date.now();
  try {
    const result = await ingestIntradayCandles(context, log, {
      refs: constituents.map((c) => ({ symbol: c.symbol, kind: 'equity' as const })),
      backfill: true,
      backfillDays: days,
    });
    console.log(
      `done in ${((Date.now() - started) / 1000).toFixed(0)}s — ` +
        `${result.rowsWritten} new bars, ${result.succeeded} ok, ${result.failed.length} failed`,
    );
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
