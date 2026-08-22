/**
 * What minute-candle history is stored, by IST trading date.
 *
 * The first thing to check before trusting a backtest: a strong number over
 * eight sessions and a strong number over eighty are different claims.
 *
 *   pnpm data:coverage
 */
import { createDatabase, minuteCandleCoverage } from '@wealthos/db';
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
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
