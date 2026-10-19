/**
 * Loads the stock-analysis data into a LOCAL database, end to end, from NSE's
 * public end-of-day files only — no Fyers/Dhan call, no credential minted:
 *
 *   reference universe → N days of bhavcopy bars → corporate actions and
 *   dividends →
 *   (optional) shareholding sweep → screener snapshot + breadth
 *
 * For development and verification (docs/planning/screener-dhan-fyers-plan.md).
 * Production runs the same jobs from the worker (`backfill-stock-analysis`).
 *
 *   DATABASE_URL=postgresql://…@localhost:5433/nse_signals_test \
 *     pnpm tsx scripts/load-stock-analysis.ts --days 420 --shareholding 150
 *
 * Refuses any host but localhost/127.0.0.1 unless --allow-remote is passed:
 * the repo's .env points at the production VPS through an SSH tunnel.
 */
import { createDatabase } from '@equitywise/db';
import { istDateKey } from '@equitywise/shared';
import type { WorkerContext } from '../apps/worker/src/context.js';
import {
  backfillBhavcopy,
  buildScreenerSnapshot,
  markDividendsLoaded,
  sweepShareholding,
  syncCorporateActions,
  syncReferenceUniverse,
} from '../apps/worker/src/jobs/stock-analysis.js';
import { createLogger } from '../apps/worker/src/log.js';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? undefined : Number(process.argv[i + 1]);
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (!['localhost', '127.0.0.1'].includes(host) && !process.argv.includes('--allow-remote')) {
    throw new Error(
      `Refusing to load into ${host || 'an unset DATABASE_URL'}; pass --allow-remote to override.`,
    );
  }
  // A tunnel to production also listens on localhost; its port is 15432.
  if (url.includes(':15432') && !process.argv.includes('--allow-remote')) {
    throw new Error('DATABASE_URL looks like the production SSH tunnel (:15432); refusing.');
  }

  const days = arg('days', 420);
  const shareholding = arg('shareholding', 0);
  const log = createLogger('load-stock-analysis');
  const handle = createDatabase({ connectionString: url });
  const context = { db: handle.db } as unknown as WorkerContext;
  const now = new Date();
  const today = istDateKey(now);
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - days);
  const fromKey = from.toISOString().slice(0, 10);

  try {
    await syncReferenceUniverse(context, log.child('reference'), { now });
    await backfillBhavcopy(context, log.child('bhavcopy'), {
      from: fromKey,
      to: today,
      checkpoint: `bhavcopy-local-${fromKey}`,
      now,
    });
    await syncCorporateActions(context, log.child('corporate-actions'), {
      from: fromKey,
      to: today,
      now,
    });
    if (days >= 366) await markDividendsLoaded(context, fromKey);
    if (shareholding > 0)
      await sweepShareholding(context, log.child('shareholding'), { perRun: shareholding });
    await buildScreenerSnapshot(context, log.child('snapshot'), { now });
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
