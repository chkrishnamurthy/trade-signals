import { withRetry } from '@equitywise/db';
import { config as loadEnv } from 'dotenv';
import { createContext, type WorkerContext } from './context.js';
import { authMaintenance } from './jobs/auth-maintenance.js';
import { computeIndicators } from './jobs/compute-indicators.js';
import { ingestDailyCandles } from './jobs/ingest-daily.js';
import { refreshProviderCredential } from './jobs/refresh-credential.js';
import { createLogger, errorFields } from './log.js';
import { createScheduler, type Scheduler } from './scheduler.js';

// Repo-root .env; this process starts from apps/worker.
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname });

/**
 * Worker entrypoint.
 *
 * Owns everything that must happen while no browser tab is open: minting the
 * market-data credential, pulling closed daily candles into the database, and
 * the end-of-day indicator pass the watchlist reads.
 *
 * Scheduling lives here rather than in `pg_cron`, which does not fire while the
 * database's compute is suspended (CLAUDE.md).
 *
 * Usage:
 *   pnpm --filter @equitywise/worker dev              schedule and stay running
 *   pnpm --filter @equitywise/worker dev -- --once ingest-daily    run one job now
 *   pnpm --filter @equitywise/worker dev -- --backfill             deep history pull
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
  /**
   * Credential refresh at 07:05 — as soon as possible after the previous token
   * expires at 07:00 IST. It must run AFTER 07:00: `defaultExpiry` rounds to the
   * next 01:30 UTC (07:00 IST), so a token minted before 07:00 is dated to
   * expire the same morning and lasts only minutes. Minting at 07:05 dates it to
   * the following 07:00 IST — a full day. Weekdays only: a token that lapses over
   * the weekend is refreshed on Monday before anything needs it.
   */
  refreshCredential: '5 7 * * 1-5',
  ingestDaily: '15 16 * * 1-5',
  computeIndicators: '45 16 * * 1-5',
  /** A second attempt, in case the first ran while the credential was stale. */
  ingestRetry: '30 18 * * 1-5',
  /** Reap expired auth rows nightly (daily — auth is not market-hours bound). */
  authMaintenance: '30 3 * * *',
} as const;

function buildScheduler(context: WorkerContext): Scheduler {
  return createScheduler(
    [
      {
        name: 'refresh-credential',
        schedule: SCHEDULES.refreshCredential,
        run: async () => {
          await refreshProviderCredential(context, log.child('refresh-credential'));
        },
      },
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
        name: 'auth-maintenance',
        schedule: SCHEDULES.authMaintenance,
        run: async () => {
          await authMaintenance(context, log.child('auth-maintenance'));
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
      // The database can scale to zero; the first query after idle can fail
      // while the compute wakes. Expected, not an error.
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

  // Before any job runs: a worker started after 07:00 IST has an expired token
  // in its environment, and every fetch would fail upstream until the refresh.
  // Failure is logged rather than fatal — the schedule below will try again,
  // and an operator can still paste a token by hand meanwhile.
  try {
    await refreshProviderCredential(context, log.child('refresh-credential'));
  } catch {
    log.warn('starting without a verified credential; jobs may fail until it refreshes');
  }

  const onceIndex = args.indexOf('--once');
  if (onceIndex !== -1) {
    const jobName = args[onceIndex + 1];
    if (jobName === undefined) {
      log.error('--once requires a job name', {
        available: ['refresh-credential', 'ingest-daily', 'compute-indicators', 'ingest-retry'],
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
