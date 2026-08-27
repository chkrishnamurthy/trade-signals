/**
 * Does Fyers return split-adjusted history?
 *
 * We have to know this before building the corporate-actions layer. If Fyers
 * already back-adjusts, applying our own adjustment factors on read would
 * double-adjust and corrupt every backtest. If it does not, unadjusted history
 * will show a fake overnight crash on every split — which any momentum or
 * volatility factor will read as a real move.
 *
 * Method: fetch daily candles spanning a known split's ex-date and look at the
 * close on either side.
 *
 *   - If the close falls by roughly the split ratio across the ex-date, the
 *     history is RAW (unadjusted) and we must adjust on read.
 *   - If it is continuous, the history is ALREADY ADJUSTED and we must not.
 *
 * Both `cont_flag` values are tried, since the docs describe it only as
 * "set cont flag 1 for continues data and future options" — which does not say
 * whether it affects equity splits.
 *
 * Usage:
 *   pnpm verify:adjustment
 *
 * Requires FYERS_APP_ID and FYERS_ACCESS_TOKEN in .env (see .env.example).
 */

import {
  type Candle,
  FyersHttpClient,
  type FyersResolution,
  fetchCandles,
  RateLimiter,
} from '@equitywise/fyers';
import { formatPaise } from '@equitywise/shared';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

interface SplitCase {
  readonly symbol: string;
  readonly label: string;
  /** Ex-date, IST. The first session that trades at the new price. */
  readonly exDate: string;
  /** Old shares : new shares. A 1:10 split has ratio 10. */
  readonly ratio: number;
  readonly note: string;
}

/**
 * Known NSE splits inside the last three years.
 *
 * Nestle is the headline case: a 1:10 split is a 90% nominal drop, far too
 * large to confuse with a real move.
 */
const SPLIT_CASES: readonly SplitCase[] = [
  {
    symbol: 'NSE:NESTLEIND-EQ',
    label: 'Nestle India',
    exDate: '2024-01-05',
    ratio: 10,
    note: '1:10 split — price should fall from ~Rs 26,000 to ~Rs 2,600 if unadjusted',
  },
  {
    symbol: 'NSE:BAJFINANCE-EQ',
    label: 'Bajaj Finance',
    exDate: '2025-06-16',
    ratio: 2,
    note: '1:2 split (plus 4:1 bonus) — a smaller, more recent cross-check',
  },
];

const WINDOW_DAYS = 6;

function shiftDays(isoDate: string, days: number): Date {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function istDate(candle: Candle): string {
  return new Date(candle.timestamp.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    console.error(`\nMissing ${name}. Add it to .env — see .env.example.`);
    process.exit(2);
  }
  return value;
}

async function probe(
  http: FyersHttpClient,
  authorization: string,
  testCase: SplitCase,
  contFlag: 0 | 1,
): Promise<{ candles: Candle[]; before: Candle | undefined; after: Candle | undefined }> {
  const candles = await fetchCandles(
    { http, authorization },
    testCase.symbol,
    'D' satisfies FyersResolution,
    { from: shiftDays(testCase.exDate, -WINDOW_DAYS), to: shiftDays(testCase.exDate, WINDOW_DAYS) },
    { contFlag },
  );

  const exDate = testCase.exDate;
  const before = [...candles].reverse().find((c) => istDate(c) < exDate);
  const after = candles.find((c) => istDate(c) >= exDate);
  return { candles, before, after };
}

function verdictFor(
  before: Candle | undefined,
  after: Candle | undefined,
  ratio: number,
): { verdict: 'RAW' | 'ADJUSTED' | 'INCONCLUSIVE'; observed: number | null } {
  if (before === undefined || after === undefined)
    return { verdict: 'INCONCLUSIVE', observed: null };

  const observed = before.close / after.close;
  // A 1:10 split shows ~10x; anything near 1 means the history is continuous.
  if (observed > ratio * 0.8 && observed < ratio * 1.25) return { verdict: 'RAW', observed };
  if (observed > 0.75 && observed < 1.33) return { verdict: 'ADJUSTED', observed };
  return { verdict: 'INCONCLUSIVE', observed };
}

async function main(): Promise<void> {
  const appId = requireEnv('FYERS_APP_ID');
  const accessToken = requireEnv('FYERS_ACCESS_TOKEN');
  const authorization = `${appId}:${accessToken}`;

  const http = new FyersHttpClient({
    rateLimiter: new RateLimiter(),
    onRetry: ({ attempt, delayMs, status }) =>
      console.warn(`  [retry ${attempt}] status ${String(status)}; waiting ${delayMs}ms`),
  });

  const results: string[] = [];

  for (const testCase of SPLIT_CASES) {
    console.log(`\n${'='.repeat(78)}`);
    console.log(`${testCase.label}  (${testCase.symbol})`);
    console.log(`ex-date ${testCase.exDate} — ${testCase.note}`);
    console.log('='.repeat(78));

    for (const contFlag of [0, 1] as const) {
      console.log(`\n--- cont_flag=${contFlag} ---`);
      try {
        const { candles, before, after } = await probe(http, authorization, testCase, contFlag);

        if (candles.length === 0) {
          console.log('  no candles returned');
          results.push(`${testCase.label} cont_flag=${contFlag}: NO DATA`);
          continue;
        }

        for (const candle of candles) {
          const date = istDate(candle);
          const marker = date === testCase.exDate ? '  <== EX-DATE' : '';
          console.log(
            `  ${date}  O ${formatPaise(candle.open).padStart(14)}` +
              `  H ${formatPaise(candle.high).padStart(14)}` +
              `  L ${formatPaise(candle.low).padStart(14)}` +
              `  C ${formatPaise(candle.close).padStart(14)}` +
              `  V ${candle.volume.toLocaleString('en-IN').padStart(14)}${marker}`,
          );
        }

        const { verdict, observed } = verdictFor(before, after, testCase.ratio);
        if (observed === null) {
          console.log('\n  Could not find candles on both sides of the ex-date.');
        } else {
          console.log(
            `\n  close before / close after = ${observed.toFixed(3)}x  (split ratio ${testCase.ratio}x)`,
          );
          console.log(`  => ${verdict}`);
        }
        results.push(
          `${testCase.label} cont_flag=${contFlag}: ${verdict}` +
            (observed === null ? '' : ` (${observed.toFixed(3)}x)`),
        );
      } catch (error) {
        console.error(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
        results.push(`${testCase.label} cont_flag=${contFlag}: ERROR`);
      }
    }
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log('SUMMARY');
  console.log('='.repeat(78));
  for (const line of results) console.log(`  ${line}`);

  const raw = results.filter((r) => r.includes('RAW')).length;
  const adjusted = results.filter((r) => r.includes('ADJUSTED')).length;

  console.log('\nCONCLUSION');
  if (raw > 0 && adjusted === 0) {
    console.log('  Fyers returns RAW, UNADJUSTED history.');
    console.log('  => We must store corporate actions and adjust on read, exactly as');
    console.log('     CLAUDE.md hard rule 5 assumes. Unadjusted history will show a');
    console.log('     fake gap-down on every split.');
  } else if (adjusted > 0 && raw === 0) {
    console.log('  Fyers returns SPLIT-ADJUSTED history.');
    console.log('  => Do NOT apply our own split factors on read; that would');
    console.log('     double-adjust. The adjustment layer is still needed for');
    console.log('     dividends, and to detect when Fyers back-fills an adjustment.');
  } else if (raw > 0 && adjusted > 0) {
    console.log('  MIXED — cont_flag changes the answer. See the per-case rows above;');
    console.log('  pin cont_flag explicitly in the ingest path.');
  } else {
    console.log('  INCONCLUSIVE. Check the ex-dates above against the NSE corporate');
    console.log('  actions page and re-run.');
  }
}

main().catch((error: unknown) => {
  console.error('\nfatal:', error);
  process.exitCode = 1;
});
