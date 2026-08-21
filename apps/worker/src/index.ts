import { withRetry } from '@signal/db';
import { config as loadEnv } from 'dotenv';
import { createContext, type WorkerContext } from './context.js';
import { computeIndicators } from './jobs/compute-indicators.js';
import { ingestDailyCandles } from './jobs/ingest-daily.js';
import { createLogger, errorFields } from './log.js';
import { createScheduler, type Scheduler } from './scheduler.js';

// Repo-root .env; this process starts from apps/worker.
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname });

/**
 * Worker entrypoint.
 *
 * Owns everything that must happen while no browser tab is open: pulling
 * closed candles into the database, computing indicators for the screener, and
 * writing signals with their factor breakdowns.
 *
 * Scheduling lives here rather than in `pg_cron`, which does not fire while
 * Neon's compute is suspended (CLAUDE.md).
 *
 * Usage:
 *   pnpm --filter @signal/worker dev              schedule and stay running
 *   pnpm --filter @signal/worker dev -- --once ingest-daily    run one job now
 *   pnpm --filter @signal/worker dev -- --backfill             deep history pull
 */

const log = createLogger('worker');

/**
 * Schedules, in IST.
 *
 * Ingestion at 16:15 — the session closes at 15:30, and the exchange's own
 * end-of-day figures settle in the interval. Pulling at 15:31 gets a candle
 * that may still be revised.
 */
const SCHEDULES = {
  ingestDaily: '15 16 * * 1-5',
  computeIndicators: '45 16 * * 1-5',
  /** A second attempt, in case the first ran while the credential was stale. */
  ingestRetry: '30 18 * * 1-5',
} as const;

function buildScheduler(context: WorkerContext): Scheduler {
  return createScheduler(
    [
      {
        name: 'ingest-daily',
        schedule: SCHEDULES.ingestDaily,
        run: async () => {
          await ingestDailyCandles(context, log.child('ingest-daily'));
        },
      },
      {
        name: 'compute-indicators',
        schedule: SCHEDULES.computeIndicators,
        run: async () => {
          await computeIndicators(context, log.child('compute-indicators'));
        },
      },
      {
        name: 'ingest-retry',
        schedule: SCHEDULES.ingestRetry,
        run: async () => {
          const result = await ingestDailyCandles(context, log.child('ingest-retry'));
          if (result.failed.length > 0) {
            // Loud on purpose: silently missing sessions are the failure mode
            // that makes indicators quietly wrong rather than obviously broken.
            log.error('symbols still missing after retry', {
              count: result.failed.length,
              symbols: result.failed.slice(0, 20),
            });
          }
        },
      },
    ],
    log,
  );
}

/** Confirms the database answers before scheduling anything against it. */
async function waitForDatabase(context: WorkerContext): Promise<void> {
  await withRetry(async () => context.db.execute('select 1'), {
    onRetry: (attempt, delayMs, error) => {
      // Neon scales to zero; the first query after idle can fail while the
      // compute wakes. Expected, not an error.
      log.warn('database not ready', { attempt, delayMs, ...errorFields(error) });
    },
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const context = createContext();

  let shuttingDown = false;
  let scheduler: Scheduler | null = null;

  /**
   * Graceful shutdown.
   *
   * Stop taking new work, let the in-flight run finish, then drain the pool.
   * Killing mid-write would leave a partial session in the candles table that
   * nothing would ever notice was partial.
   */
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutting down', { signal });

    scheduler?.stop();
    await scheduler?.drain();
    await context.close();
    log.info('stopped');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Without these a rejected promise anywhere in a job kills the process with
  // no log line, and the next thing anyone notices is stale data on the screen.
  process.on('unhandledRejection', (reason) => {
    log.error('unhandled rejection', errorFields(reason));
  });
  process.on('uncaughtException', (error) => {
    log.error('uncaught exception', errorFields(error));
    void shutdown('uncaughtException');
  });

  await waitForDatabase(context);
  log.info('database ready');

  const onceIndex = args.indexOf('--once');
  if (onceIndex !== -1) {
    const jobName = args[onceIndex + 1];
    if (jobName === undefined) {
      log.error('--once requires a job name', {
        available: ['ingest-daily', 'compute-indicators', 'ingest-retry'],
      });
      process.exitCode = 1;
      await context.close();
      return;
    }
    scheduler = buildScheduler(context);
    scheduler.stop(); // one-shot: do not also arm the schedules
    await scheduler.trigger(jobName);
    await context.close();
    return;
  }

  if (args.includes('--backfill')) {
    log.info('backfilling history');
    await ingestDailyCandles(context, log.child('backfill'), { backfill: true });
    await computeIndicators(context, log.child('backfill-indicators'));
    await context.close();
    return;
  }

  scheduler = buildScheduler(context);
  log.info('worker running; ctrl-c to stop');
}

main().catch((error: unknown) => {
  log.error('fatal', errorFields(error));
  process.exitCode = 1;
});
