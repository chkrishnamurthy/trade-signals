import { withRetry } from '@equitywise/db';
import { config as loadEnv } from 'dotenv';
import { createContext, type WorkerContext } from './context.js';
import { authMaintenance } from './jobs/auth-maintenance.js';
import {
  calendarRefresh,
  checkUnscheduledClosure,
  isTradingSession,
  sessionToday,
} from './jobs/calendar-refresh.js';
import { computeIndicators } from './jobs/compute-indicators.js';
import { crossCheckProviders } from './jobs/cross-check-bars.js';
import { createFeedJob, type FeedJob } from './jobs/feed.js';
import { backfillBhavcopy, ingestBhavcopy } from './jobs/ingest-bhavcopy.js';
import { ingestDailyCandles } from './jobs/ingest-daily.js';
import {
  backfillFlowFeeds,
  ingestAnnouncements,
  ingestDeals,
  ingestDeliveryStats,
  ingestFiiDii,
  ingestParticipantOi,
  ingestShareholding,
} from './jobs/ingest-disclosures.js';
import { ingestFuturesOi } from './jobs/ingest-futures-oi.js';
import { createIntradayJobs } from './jobs/intraday-orb.js';
import { createPaperJobs } from './jobs/paper.js';
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
   *
   * Every held provider is refreshed here; the Fyers reasoning above sets the
   * hour and is harmless for the rest.
   */
  refreshCredential: '5 7 * * 1-5',
  /**
   * Nightly rollover at 01:35 for providers whose token lasts 24 h from its
   * mint rather than to a fixed hour (Dhan). Left to the 07:05 job alone, a
   * token minted at 07:05 dies at 07:04 the next morning — mid pre-open, with
   * the morning check the one to discover it. Rolling it over at 01:35 (renewed
   * without the secrets when it still has life, minted otherwise) moves the
   * daily gap to the middle of the night, where nothing is reading. Every day,
   * not weekdays: a 24 h token does not survive a weekend. Providers whose
   * token is dated to a fixed hour (Fyers) are skipped.
   */
  credentialRollover: '35 1 * * *',
  ingestDaily: '15 16 * * 1-5',
  computeIndicators: '45 16 * * 1-5',
  /** A second attempt, in case the first ran while the credential was stale. */
  ingestRetry: '30 18 * * 1-5',
  /** Reap expired auth rows nightly (daily — auth is not market-hours bound). */
  authMaintenance: '30 3 * * *',
  /** Corporate announcements: a few sweeps through the trading day. */
  ingestAnnouncements: '20 10,13,16,19 * * 1-5',
  /** FII/DII cash figures settle after the session; pull in the evening. */
  ingestFiiDii: '45 19 * * 1-5',
  /** Bulk & block deals are published after close. */
  ingestDeals: '50 18 * * 1-5',
  /**
   * NSE's full bhavdata (delivery) and participant-wise OI files land
   * ~18:30–19:30 IST. A second pass at 20:30 catches a late publish; the
   * upsert makes the repeat harmless.
   */
  ingestDelivery: '10 19,20 * * 1-5',
  ingestParticipantOi: '20 19,20 * * 1-5',
  /** Shareholding changes quarterly; a weekly sweep is ample. */
  ingestShareholding: '15 6 * * 6',
  /**
   * Stock-futures OI for the PREVIOUS session, the morning after: the
   * provider treats a session's daily bar as forming until the next IST date
   * (the same rule as the daily-candle pass). Tue–Sat covers Mon–Fri sessions.
   */
  ingestFuturesOi: '45 6 * * 2-6',
  /**
   * Every NSE and BSE equity's closed session from the exchanges' bhavcopies
   * (multi-exchange plan §2.4). Both publish after the close, typically by
   * 18:00–19:00 IST; 19:30 with a 21:30 retry covers a late publish, and the
   * append-only insert makes the repeat harmless.
   */
  ingestBhavcopy: '30 19,21 * * 1-5',
  /**
   * A second indicator pass once the bhavcopy candles are in, so a listing
   * outside the configured universe gets its indicators the same evening.
   */
  computeIndicatorsLate: '50 21 * * 1-5',
} as const;

interface Jobs {
  scheduler: Scheduler;
  feed: FeedJob;
  paper: ReturnType<typeof createPaperJobs>;
}

function buildScheduler(context: WorkerContext): Jobs {
  const feed = createFeedJob(context, log.child('feed'));
  const intraday = createIntradayJobs(context, log.child('intraday'), {
    feedHealthy: () => feed.healthy(),
  });
  const paper = createPaperJobs(context, log.child('paper'));
  /**
   * Calendar gating (plan §9.1): every in-session job first asks the exchange
   * calendar. A holiday, weekend or detected closure is a logged no-op — the
   * cron fields below say "Mon–Sat" only so the calendar can say the rest.
   */
  let cached: { at: number; session: Awaited<ReturnType<typeof sessionToday>> } | null = null;
  const gated = (name: string, run: () => Promise<unknown>) => async (): Promise<void> => {
    // The monitor asks every second; one calendar read a minute is plenty.
    if (cached === null || Date.now() - cached.at > 60_000)
      cached = { at: Date.now(), session: await sessionToday(context) };
    const { session } = cached;
    if (!isTradingSession(session)) {
      log.debug('outside a trading session', { job: name, kind: session.kind });
      return;
    }
    await run();
  };
  const scheduler = createScheduler(
    [
      // The exchange calendar: today's session row at 06:30, and the
      // unscheduled-closure cross-check five minutes after the open.
      {
        name: 'calendar-refresh',
        schedule: '0 30 6 * * *',
        run: async () => {
          await calendarRefresh(context, log.child('calendar-refresh'));
        },
      },
      {
        name: 'calendar-check',
        schedule: '0 20 9 * * 1-6',
        run: async () => {
          await checkUnscheduledClosure(context, log.child('calendar-check'));
        },
      },
      // The live socket: open at 09:05, closed at 15:35. The quote sweep below
      // stands down while the socket is healthy and takes over when it is not.
      { name: 'feed-start', schedule: '0 5 9 * * 1-6', run: gated('feed-start', feed.start) },
      { name: 'feed-stop', schedule: '0 35 15 * * 1-6', run: async () => feed.stop() },
      // ORB-VC: warm up 1m history at 08:50, evaluate each closed 5m candle at
      // +2s (and +17s for late bars), sample quotes every 5s for the lifecycle,
      // and close anything the session left unresolved.
      { name: 'intraday-reconcile', schedule: '20 * * * * *', run: intraday.reconcile },
      {
        name: 'intraday-quotes',
        schedule: '*/5 * 9-15 * * 1-6',
        run: gated('intraday-quotes', intraday.quoteCycle),
      },
      {
        name: 'intraday-scan',
        schedule: '2,17 */5 9-14 * * 1-6',
        run: gated('intraday-scan', async () => {
          await intraday.scan();
          // Decisions follow the scan on the same tick, so an intent is decided
          // before its next-candle entry window has moved on.
          await paper.entries();
        }),
      },
      {
        name: 'intraday-warmup',
        schedule: '0 50 8 * * 1-6',
        run: gated('intraday-warmup', intraday.warmup),
      },
      // Per-user paper trading (plan §9.1).
      {
        name: 'paper-entries',
        schedule: '30 * 9-14 * * 1-6',
        run: gated('paper-entries', paper.entries),
      },
      {
        name: 'paper-monitor',
        schedule: '* * 9-15 * * 1-6',
        run: gated('paper-monitor', paper.monitor),
      },
      {
        name: 'paper-squareoff',
        schedule: '*/15 15-59 15 * * 1-6',
        run: gated('paper-squareoff', paper.squareOff),
      },
      {
        name: 'paper-snapshot',
        schedule: '0 */5 9-15 * * 1-6',
        run: gated('paper-snapshot', paper.snapshot),
      },
      {
        name: 'paper-reconcile',
        schedule: '0 45 6,15 * * *',
        run: async () => {
          await paper.reconcile();
        },
      },
      {
        name: 'refresh-credential',
        schedule: SCHEDULES.refreshCredential,
        run: async () => {
          await refreshProviderCredential(context, log.child('refresh-credential'));
        },
      },
      {
        name: 'credential-rollover',
        schedule: SCHEDULES.credentialRollover,
        run: async () => {
          await refreshProviderCredential(context, log.child('credential-rollover'), {
            rolloverOnly: true,
          });
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
        name: 'ingest-bhavcopy',
        schedule: SCHEDULES.ingestBhavcopy,
        run: gated('ingest-bhavcopy', async () => {
          await ingestBhavcopy(context, log.child('ingest-bhavcopy'));
        }),
      },
      {
        name: 'compute-indicators-late',
        schedule: SCHEDULES.computeIndicatorsLate,
        run: gated('compute-indicators-late', async () => {
          await computeIndicators(context, log.child('compute-indicators-late'));
        }),
      },
      {
        // On demand only (`--once backfill-bhavcopy`): ~430 days of both
        // exchanges' bhavcopies, one file per exchange per weekday, so every
        // listing has the history a 200-day EMA needs. Idempotent. Never
        // scheduled — 31 February does not exist.
        name: 'backfill-bhavcopy',
        schedule: '0 0 31 2 *',
        run: async () => {
          await backfillBhavcopy(context, log.child('backfill-bhavcopy'));
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
        name: 'ingest-announcements',
        schedule: SCHEDULES.ingestAnnouncements,
        run: async () => {
          await ingestAnnouncements(context, log.child('ingest-announcements'));
        },
      },
      {
        name: 'ingest-fii-dii',
        schedule: SCHEDULES.ingestFiiDii,
        run: async () => {
          await ingestFiiDii(context, log.child('ingest-fii-dii'));
        },
      },
      {
        name: 'ingest-deals',
        schedule: SCHEDULES.ingestDeals,
        run: async () => {
          await ingestDeals(context, log.child('ingest-deals'));
        },
      },
      {
        name: 'ingest-delivery',
        schedule: SCHEDULES.ingestDelivery,
        run: async () => {
          await ingestDeliveryStats(context, log.child('ingest-delivery'));
        },
      },
      {
        name: 'ingest-participant-oi',
        schedule: SCHEDULES.ingestParticipantOi,
        run: async () => {
          await ingestParticipantOi(context, log.child('ingest-participant-oi'));
        },
      },
      {
        name: 'ingest-shareholding',
        schedule: SCHEDULES.ingestShareholding,
        run: async () => {
          await ingestShareholding(context, log.child('ingest-shareholding'));
        },
      },
      {
        name: 'ingest-futures-oi',
        schedule: SCHEDULES.ingestFuturesOi,
        run: async () => {
          await ingestFuturesOi(context, log.child('ingest-futures-oi'));
        },
      },
      {
        // On demand only (`--once backfill-flows`): walks ~45 days of the
        // delivery and participant-OI archives so the flow page has its
        // trailing averages from day one. Idempotent. Never scheduled.
        name: 'backfill-flows',
        schedule: '0 0 31 2 *',
        run: async () => {
          await backfillFlowFeeds(context, log.child('backfill-flows'));
        },
      },
      {
        // On demand only (`--once cross-check-bars`): it reads both providers'
        // budgets and writes nothing. The schedule is a placeholder that never
        // fires — 31 February does not exist.
        name: 'cross-check-bars',
        schedule: '0 0 31 2 *',
        run: async () => {
          await crossCheckProviders(context, log.child('cross-check-bars'));
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
  return { scheduler, feed, paper };
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
  let feed: FeedJob | null = null;

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
    feed?.stop();
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

  log.info('market data', {
    provider: context.providerId,
    held: [...context.providers.keys()],
  });

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
        available: [
          'refresh-credential',
          'credential-rollover',
          'ingest-daily',
          'compute-indicators',
          'ingest-retry',
          'cross-check-bars',
          'ingest-announcements',
          'ingest-fii-dii',
          'ingest-deals',
          'ingest-delivery',
          'ingest-participant-oi',
          'ingest-shareholding',
          'ingest-futures-oi',
          'backfill-flows',
          'calendar-refresh',
          'calendar-check',
          'paper-entries',
          'paper-monitor',
          'paper-squareoff',
          'paper-snapshot',
          'paper-reconcile',
        ],
      });
      process.exitCode = 1;
      await context.close();
      return;
    }
    const jobs = buildScheduler(context);
    scheduler = jobs.scheduler;
    scheduler.stop(); // one-shot: do not also arm the schedules
    await scheduler.trigger(jobName);
    jobs.feed.stop();
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

  const jobs = buildScheduler(context);
  scheduler = jobs.scheduler;
  feed = jobs.feed;
  log.info('worker running; ctrl-c to stop');

  // Restart recovery (plan §9.3): today's session row, then — if the session
  // is under way — the socket, a decision pass for intents still inside their
  // window, and the square-off in case the worker was down at 15:15. The
  // monitor's checkpoint makes the observation replay idempotent.
  try {
    const session = await calendarRefresh(context, log.child('calendar-refresh'));
    const now = Date.now();
    if (isTradingSession(session) && session.openAt !== null && session.closeAt !== null) {
      if (now >= session.openAt - 10 * 60_000 && now < session.closeAt + 5 * 60_000)
        await jobs.feed.start();
      if (now >= session.openAt) {
        await jobs.paper.entries(now);
        await jobs.paper.monitor(now);
        await jobs.paper.squareOff(now);
      }
    }
  } catch (error) {
    log.warn('startup recovery incomplete', errorFields(error));
  }
}

main().catch((error: unknown) => {
  log.error('fatal', errorFields(error));
  process.exitCode = 1;
});
