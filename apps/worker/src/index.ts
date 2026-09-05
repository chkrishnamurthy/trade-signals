import { expireOpenSignals, withRetry } from '@equitywise/db';
import { istDateKey } from '@equitywise/shared';
import { config as loadEnv } from 'dotenv';
import { createContext, type WorkerContext } from './context.js';
import { loadIntradaySettings } from './intraday-config.js';
import { computeIndicators } from './jobs/compute-indicators.js';
import { ingestDailyCandles } from './jobs/ingest-daily.js';
import { runIntradayCycle } from './jobs/intraday-signals.js';
import { recordPaperTrades } from './jobs/paper-trades.js';
import { refreshProviderCredential } from './jobs/refresh-credential.js';
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
 *   pnpm --filter @equitywise/worker dev              schedule and stay running
 *   pnpm --filter @equitywise/worker dev -- --once ingest-daily    run one job now
 *   pnpm --filter @equitywise/worker dev -- --backfill             deep history pull
 *   pnpm --filter @equitywise/worker dev -- --once intraday-cycle  one signal pass
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
   * the following 07:00 IST — a full day — and shrinks the pre-refresh window in
   * which the dashboard reports the feed unavailable from ~90 min (the old
   * 08:30) to ~5 min, all of it pre-open. Weekdays only: a token that lapses
   * over the weekend is refreshed on Monday before anything needs it, and the
   * dashboard shows a "market closed" state meanwhile (see MarketClosed).
   */
  refreshCredential: '5 7 * * 1-5',
  ingestDaily: '15 16 * * 1-5',
  computeIndicators: '45 16 * * 1-5',
  /** A second attempt, in case the first ran while the credential was stale. */
  ingestRetry: '30 18 * * 1-5',
  /**
   * Close-out for intraday signals, a couple of minutes after the bell.
   *
   * Separate from the cycle because the cycle's own interval is configurable
   * and may not land on 15:30. A live signal that survives the close would be
   * rendered tomorrow as a current opportunity, and would also block the same
   * setup from ever forming again.
   */
  intradayClose: '32 15 * * 1-5',
} as const;

/**
 * The intraday cycle's cron expression.
 *
 * Fires across the whole trading hour range; the job itself checks the session
 * regime and returns immediately outside continuous trading, so a stray fire
 * costs one clock read rather than a wasted request budget.
 */
function intradaySchedule(cycleMinutes: number): string {
  return `*/${cycleMinutes} 9-15 * * 1-5`;
}

function buildScheduler(context: WorkerContext, cycleMinutes: number): Scheduler {
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
        name: 'intraday-cycle',
        schedule: intradaySchedule(cycleMinutes),
        run: async () => {
          // Cheap (one indexed read when the held token is still valid) and
          // self-healing: a credential minted by hand mid-session, or one the
          // 08:30 refresh failed to get, is adopted on the next cycle instead
          // of leaving the feed dead until the process is restarted.
          try {
            await refreshProviderCredential(context, log.child('refresh-credential'));
          } catch {
            log.warn('cycle running without a verified credential');
          }
          const result = await runIntradayCycle(context, log.child('intraday-cycle'));
          // Recorded in the same job, immediately after: the recorder needs the
          // signals this cycle just wrote and the bars it just ingested, and a
          // separate schedule would race the cycle for both.
          if (result.evaluated > 0) {
            const settings = await loadIntradaySettings();
            await recordPaperTrades(context, log.child('paper-trades'), {
              now: new Date(),
              config: settings.config,
            });
          }
        },
      },
      {
        name: 'intraday-close',
        schedule: SCHEDULES.intradayClose,
        run: async () => {
          const now = new Date();
          const expired = await expireOpenSignals(
            context.db,
            istDateKey(now),
            now,
            'Session closed — intraday setups do not carry overnight',
          );
          log.info('intraday close-out', { expired, tradingDate: istDateKey(now) });

          // Settle the day's outcomes once the tape is final. Trades still
          // open at the last cycle are closed at the force-exit bar here, so
          // the results page never carries an `unresolved` row overnight.
          const settings = await loadIntradaySettings();
          await recordPaperTrades(context, log.child('paper-trades'), {
            now,
            config: settings.config,
          });
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
  // Loaded before anything is scheduled: an invalid config must stop the
  // process at startup, not at 09:18 on the first cycle.
  const { cycleMinutes } = await loadIntradaySettings();

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
  // in its environment, and every fetch would fail upstream until 08:30.
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
        available: [
          'refresh-credential',
          'ingest-daily',
          'compute-indicators',
          'ingest-retry',
          'intraday-cycle',
          'intraday-close',
        ],
      });
      process.exitCode = 1;
      await context.close();
      return;
    }
    scheduler = buildScheduler(context, cycleMinutes);
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

  scheduler = buildScheduler(context, cycleMinutes);
  log.info('worker running; ctrl-c to stop', { intradayCycleMinutes: cycleMinutes });
}

main().catch((error: unknown) => {
  log.error('fatal', errorFields(error));
  process.exitCode = 1;
});
