import { backtestFno } from './fno-backtest.js';
import { aggregateTo5m } from './fno-normalize.js';
import { evaluateFuturesVwapOi } from './fno-strategy.js';
import { DEFAULT_FNO_CONFIG } from './fno-types.js';
import { nativeExport } from './native-feather.js';
import { OBJECTS_DIR } from './telegram-env.js';

/**
 * One-day, one-contract F&O backtest trial. Reads a locally downloaded feather
 * file, normalises to 5-minute integer-paise candles, runs the research
 * "Futures VWAP + OI Buildup" strategy, and replays it. Research only.
 *
 * Usage:
 *   pnpm --filter @equitywise/archive fno:trial <file.feather> <SYMBOL> [qty] [lotNote]
 * Example:
 *   pnpm --filter @equitywise/archive fno:trial 2026-08-28-bfo-data.feather SENSEX26SEPFUT 20
 */

const paise = (p: number | null): string => (p == null ? '—' : (p / 100).toFixed(2));

async function main(): Promise<void> {
  const [, , fileArg, symbol, qtyArg] = process.argv;
  if (!fileArg || !symbol) {
    throw new Error('Usage: fno:trial <file.feather> <SYMBOL> [qty]');
  }
  const path = fileArg.includes('/') ? fileArg : `${OBJECTS_DIR}/${fileArg}`;
  const qty = Number(qtyArg ?? '1') || 1;

  const raw = await nativeExport(path, symbol);
  const candles = aggregateTo5m(raw.bars);
  const setups = evaluateFuturesVwapOi(candles, DEFAULT_FNO_CONFIG);
  const result = backtestFno(candles, setups, DEFAULT_FNO_CONFIG, {
    squareOffIstMinute: 920, // 15:20 IST
    qty,
  });

  console.log(`\n=== F&O trial: ${symbol} ===`);
  console.log(`Source: ${path}`);
  console.log(`1-min bars: ${raw.num_rows}  →  5-min candles: ${candles.length}`);
  console.log('Strategy: Futures VWAP + OI Buildup (RESEARCH — not a trading recommendation)');
  console.log(`Position size assumed: ${qty} unit(s) — affects cost/net only, NOT R.\n`);

  if (setups.length === 0) {
    console.log('No setups fired. For a quiet, thin day this is a truthful result, not a bug.');
    return;
  }

  for (const t of result.trades) {
    const s = t.setup;
    console.log(
      `• ${s.direction} @bar ${s.index} (${new Date(s.timestamp).toISOString()})\n` +
        `  trigger ${paise(s.triggerLevel)}  invalidation ${paise(s.invalidationLevel)}  ` +
        `T1 ${paise(s.target1)}  T2 ${paise(s.target2)}  R=${paise(s.riskPaise)} pts\n` +
        `  factors: dVWAP ${paise(s.factors.distanceToVwapPaise)}  ΔOI ${s.factors.oiChange}  ` +
        `vol ${s.factors.barVolume} (avg ${s.factors.runningAvgVolume.toFixed(0)})\n` +
        `  → ${t.status}` +
        (t.entryPrice != null
          ? `  entry ${paise(t.entryPrice)} exit ${paise(t.exitPrice)}  ` +
            `gross ${paise(t.grossPaise)} pts  R=${t.rMultiple?.toFixed(2)}  ` +
            `net(${qty}u) ₹${paise(t.netPaise)}  T1hit=${t.target1Touched}`
          : ''),
    );
  }

  const sum = result.summary;
  console.log(
    `\nSummary: ${sum.setups} setups, ${sum.filled} filled, ${sum.expired} expired · ` +
      `${sum.wins}W/${sum.losses}L · ` +
      `TARGET2=${sum.byStatus.TARGET2} STOP=${sum.byStatus.STOP} SQUAREOFF=${sum.byStatus.SQUAREOFF}`,
  );
  console.log(
    `Total R: ${sum.totalR.toFixed(2)}   Total net (${qty}u): ₹${paise(sum.totalNetPaise)}`,
  );
  console.log(
    '\nCaveats: single contract, single day; costs are current-scenario assumptions; ' +
      'quote spread/slippage not modelled beyond pessimistic fills. Not investment advice.',
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
