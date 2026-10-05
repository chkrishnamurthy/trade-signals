import { feedHealth, withRetry } from '@equitywise/db';
import { config as loadEnv } from 'dotenv';
import { createContext, type WorkerContext } from './context.js';
import { createJobFailureRecorder } from './job-failures.js';
import { authMaintenance } from './jobs/auth-maintenance.js';
import {
  calendarRefresh,
  checkUnscheduledClosure,
  isTradingSession,
  sessionToday,
} from './jobs/calendar-refresh.js';
import { computeIndicators } from './jobs/compute-indicators.js';
import { crossCheckProviders } from './jobs/cross-check-bars.js';
import { evaluateAlerts } from './jobs/evaluate-alerts.js';
import { extractIpoRhp } from './jobs/extract-ipo-rhp.js';
import { createFeedJob, type FeedJob } from './jobs/feed.js';
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
import {
  backfillIpos,
  ingestIpoCalendar,
  ingestIpoDetails,
  ingestIpoGmp,
  ingestIpoListings,
  ingestIpoSubscriptions,
  ingestSebiFilings,
  ipoHistoryFeedId,
} from './jobs/ingest-ipos.js';
import { createIntradayJobs } from './jobs/intraday-orb.js';
import { marketCalendarSync } from './jobs/market-calendar-sync.js';
import { createPaperJobs } from './jobs/paper.js';
import { writePortfolioNotices } from './jobs/portfolio-notices.js';
import {
  backfillIndexCloses,
  ingestIndexCloses,
  loadFairMarketValues2018,
} from './jobs/portfolio-reference.js';
import { refreshLatestQuotes } from './jobs/quote-cache.js';
import { refreshProviderCredential } from './jobs/refresh-credential.js';
import {
  backfillCorporateHistory,
  backfillDividends,
  backfillStockAnalysis,
  buildScreenerSnapshot,
  dividendsBackfillDone,
  runStockAnalysisEod,
  stockAnalysisBackfillDone,
  sweepShareholding,
  syncCorporateActions,
  syncReferenceUniverse,
} from './jobs/stock-analysis.js';
import { syncInstrumentMetadata } from './jobs/sync-instrument-metadata.js';
import { createLogger, errorFields } from './log.js';
import { createScheduler, type Scheduler } from './scheduler.js';
import { loadIpoSourcesConfig } from './sources/ipo/config.js';

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
  /** Real tick and lot sizes over the placeholders new rows are created with. */
  instrumentMetadata: '20 8 * * 1-5',
  /** After the indicator pass: user alert rules on the session that just closed. */
  evaluateAlerts: '15 17 * * 1-5',
  /** A second attempt, in case the first ran while the credential was stale. */
  ingestRetry: '30 18 * * 1-5',
  /** Reap expired auth rows nightly (daily — auth is not market-hours bound). */
  authMaintenance: '30 3 * * *',
  /**
   * Corporate announcements: a few sweeps a day, weekends included — companies
   * file on Saturdays and Sundays too, and the page calls a day-old feed stale.
   */
  ingestAnnouncements: '20 10,13,16,19 * * *',
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
  /**
   * Stock analysis (docs/planning/screener-dhan-fyers-plan.md §10). The equity
   * list and index files before the open; corporate actions after them, so a
   * new listing resolves; tonight's bhavcopy → candles → snapshot + breadth
   * after the delivery file (re-run at 21:25 in case NSE publishes late).
   */
  referenceUniverseSync: '30 8 * * 1-5',
  corporateActionsSync: '40 8 * * 1-5',
  stockAnalysisEod: '25 19,21 * * 1-5',
  /** 300 stocks a weekday: the whole universe's shareholding in about a week. */
  shareholdingSweep: '20 6 * * 1-5',
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
   * IPOs (docs/planning/ipos-plan.md §8). NSE's issue lists change a few times
   * a day at most: before the open, midday, and after the evening filings.
   * Saturdays too — issues are announced on weekends.
   */
  ingestIpoCalendar: '40 8,12,18 * * 1-6',
  /** Detail pages (lot, registrar, RHP, anchor report) — morning and evening. */
  ingestIpoDetails: '50 7,17 * * 1-6',
  /**
   * Subscription for open issues while bidding runs (10:00–17:00 IST), and a
   * final read at 19:05 once the exchange posts the closing figure.
   */
  ingestIpoSubscriptions: '35 10,12,14,16,17 * * 1-5',
  ingestIpoSubscriptionsFinal: '5 19 * * 1-5',
  /** Listing prices come from the bhavcopy, which lands ~18:30–19:30 IST. */
  ingestIpoListings: '25 19,20 * * 1-5',
  /**
   * The UNOFFICIAL grey-market premium (owner decision D1): three light reads
   * a day, weekends included — it is quoted then too. One page per run.
   */
  ingestIpoGmp: '15 10,15,20 * * *',
  /**
   * Reads sections out of new RHPs, half an hour after each detail pass (and
   * after the midday calendar pass, which fetches new issues' detail). Three
   * documents a run at most, recent issues only; usually there are none.
   */
  extractIpoRhp: '20 8,13,18 * * 1-6',
  /** SEBI's filings list (DRHPs): one page twice a day covers its few filings a day. */
  ingestSebiFilings: '45 9,19 * * 1-6',
  /** Refresh the versioned user-facing event calendar after the session calendar. */
  marketCalendarSync: '35 6 * * *',
  /** Worker-backed cache for polled watchlist quote reads. */
  latestQuotes: '*/30 9-15 * * 1-6',
  /** NSE posts the day's index closing file in the evening; the last week is re-read. */
  ingestIndexCloses: '20 19 * * 1-5',
  /** After each stock-analysis pass stores the day's closes; once-only, so twice is safe. */
  portfolioNotices: '50 19,21 * * 1-5',
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
      {
        name: 'market-calendar-sync',
        schedule: SCHEDULES.marketCalendarSync,
        run: async () => {
          await marketCalendarSync(context, log.child('market-calendar-sync'));
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
        name: 'refresh-latest-quotes',
        schedule: SCHEDULES.latestQuotes,
        run: gated('refresh-latest-quotes', () =>
          refreshLatestQuotes(context, log.child('refresh-latest-quotes')),
        ),
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
        name: 'sync-instrument-metadata',
        schedule: SCHEDULES.instrumentMetadata,
        run: async () => {
          await syncInstrumentMetadata(context, log.child('sync-instrument-metadata'));
        },
      },
      {
        name: 'evaluate-alerts',
        schedule: SCHEDULES.evaluateAlerts,
        run: async () => {
          await evaluateAlerts(context, log.child('evaluate-alerts'));
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
        name: 'reference-universe-sync',
        schedule: SCHEDULES.referenceUniverseSync,
        run: async () => {
          await syncReferenceUniverse(context, log.child('reference-universe-sync'));
        },
      },
      {
        name: 'corporate-actions-sync',
        schedule: SCHEDULES.corporateActionsSync,
        run: async () => {
          await syncCorporateActions(context, log.child('corporate-actions-sync'));
        },
      },
      {
        name: 'stock-analysis-eod',
        schedule: SCHEDULES.stockAnalysisEod,
        run: async () => {
          await runStockAnalysisEod(context, log.child('stock-analysis-eod'), {
            // Watchlists read daily_indicators; refresh them on tonight's bars.
            afterBars: async () => {
              await computeIndicators(context, log.child('stock-analysis-indicators'));
              await evaluateAlerts(context, log.child('stock-analysis-alerts'));
            },
          });
        },
      },
      {
        name: 'shareholding-sweep',
        schedule: SCHEDULES.shareholdingSweep,
        run: async () => {
          await sweepShareholding(context, log.child('shareholding-sweep'));
        },
      },
      {
        // The first-run history load: reference, two years of bhavcopy bars and
        // corporate actions, then a snapshot. Resumable. Never scheduled; the
        // worker triggers it on start until it has completed once.
        name: 'backfill-stock-analysis',
        schedule: '0 0 31 2 *',
        run: async () => {
          await backfillStockAnalysis(context, log.child('backfill-stock-analysis'), {
            afterBars: async () => {
              await computeIndicators(context, log.child('backfill-stock-analysis-indicators'));
            },
          });
        },
      },
      {
        // One-time dividend history for a deployment loaded before dividends
        // were recorded. Never scheduled; triggered on start until done.
        name: 'backfill-dividends',
        schedule: '0 0 31 2 *',
        run: async () => {
          await backfillDividends(context, log.child('backfill-dividends'));
        },
      },
      {
        name: 'ingest-index-closes',
        schedule: SCHEDULES.ingestIndexCloses,
        run: async () => {
          await ingestIndexCloses(context, log.child('ingest-index-closes'));
        },
      },
      {
        name: 'portfolio-notices',
        schedule: SCHEDULES.portfolioNotices,
        run: async () => {
          await writePortfolioNotices(context, log.child('portfolio-notices'));
        },
      },
      {
        // On demand only (`--once backfill-index-closes`): ten years of Nifty 50 /
        // Nifty 500 closes for the portfolio benchmark. Resumable. Never scheduled.
        name: 'backfill-index-closes',
        schedule: '0 0 31 2 *',
        run: async () => {
          await backfillIndexCloses(context, log.child('backfill-index-closes'));
        },
      },
      {
        // On demand only (`--once load-fair-market-values-2018`): 31 Jan 2018 highs
        // for the long-term-gains grandfathering rule. Safe to re-run.
        name: 'load-fair-market-values-2018',
        schedule: '0 0 31 2 *',
        run: async () => {
          await loadFairMarketValues2018(context, log.child('load-fair-market-values-2018'));
        },
      },
      {
        // On demand only (`--once backfill-corporate-history`): ten years of
        // splits, bonuses and dividends for portfolio history. Never scheduled.
        name: 'backfill-corporate-history',
        schedule: '0 0 31 2 *',
        run: async () => {
          await backfillCorporateHistory(context, log.child('backfill-corporate-history'));
        },
      },
      {
        // Rebuild the latest snapshot by hand (`--once build-screener-snapshot`).
        name: 'build-screener-snapshot',
        schedule: '0 0 31 2 *',
        run: async () => {
          await buildScreenerSnapshot(context, log.child('build-screener-snapshot'));
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
        name: 'ingest-ipo-calendar',
        schedule: SCHEDULES.ingestIpoCalendar,
        run: async () => {
          await ingestIpoCalendar(context, log.child('ingest-ipo-calendar'));
        },
      },
      {
        name: 'ingest-ipo-details',
        schedule: SCHEDULES.ingestIpoDetails,
        run: async () => {
          await ingestIpoDetails(context, log.child('ingest-ipo-details'));
        },
      },
      {
        name: 'ingest-ipo-subscriptions',
        schedule: SCHEDULES.ingestIpoSubscriptions,
        run: gated('ingest-ipo-subscriptions', () =>
          ingestIpoSubscriptions(context, log.child('ingest-ipo-subscriptions')),
        ),
      },
      {
        name: 'ingest-ipo-subscriptions-final',
        schedule: SCHEDULES.ingestIpoSubscriptionsFinal,
        run: gated('ingest-ipo-subscriptions-final', () =>
          ingestIpoSubscriptions(context, log.child('ingest-ipo-subscriptions-final')),
        ),
      },
      {
        name: 'ingest-ipo-listings',
        schedule: SCHEDULES.ingestIpoListings,
        run: async () => {
          await ingestIpoListings(context, log.child('ingest-ipo-listings'));
        },
      },
      {
        name: 'ingest-ipo-gmp',
        schedule: SCHEDULES.ingestIpoGmp,
        run: async () => {
          await ingestIpoGmp(context, log.child('ingest-ipo-gmp'));
        },
      },
      {
        name: 'ingest-sebi-filings',
        schedule: SCHEDULES.ingestSebiFilings,
        run: async () => {
          await ingestSebiFilings(context, log.child('ingest-sebi-filings'));
        },
      },
      {
        name: 'extract-ipo-rhp',
        schedule: SCHEDULES.extractIpoRhp,
        run: async () => {
          await extractIpoRhp(context, log.child('extract-ipo-rhp'));
        },
      },
      {
        // On demand only (`--once backfill-ipos`): ~24 months of past issues,
        // their detail pages and listing days, paced at the slower backfill
        // interval under one budget. Idempotent. Never scheduled.
        name: 'backfill-ipos',
        schedule: '0 0 31 2 *',
        run: async () => {
          await backfillIpos(context, log.child('backfill-ipos'));
        },
      },
      {
        // On demand (`--once backfill-ipo-rhp`, and after the first history
        // load): reads up to 200 RHPs from `rhp.since` in one run instead of
        // three a run. Newest issues first; idempotent. Never scheduled.
        name: 'backfill-ipo-rhp',
        schedule: '0 0 31 2 *',
        run: async () => {
          await extractIpoRhp(context, log.child('backfill-ipo-rhp'), { maxDocuments: 200 });
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
    // A failed run is stored durably (throttled), not just printed to stdout.
    { onFailure: createJobFailureRecorder(context.db, log) },
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
          'evaluate-alerts',
          'sync-instrument-metadata',
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
          'ingest-ipo-calendar',
          'ingest-ipo-details',
          'ingest-ipo-subscriptions',
          'ingest-ipo-listings',
          'ingest-ipo-gmp',
          'extract-ipo-rhp',
          'ingest-sebi-filings',
          'backfill-ipos',
          'backfill-corporate-history',
          'ingest-index-closes',
          'portfolio-notices',
          'backfill-index-closes',
          'load-fair-market-values-2018',
          'backfill-ipo-rhp',
          'calendar-refresh',
          'calendar-check',
          'market-calendar-sync',
          'paper-entries',
          'paper-monitor',
          'paper-squareoff',
          'paper-snapshot',
          'paper-reconcile',
          'refresh-latest-quotes',
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

  // Versioned local events are provider-independent. Refresh during a regular
  // startup so a deploy does not wait for the next 06:35 schedule. One-shot
  // invocations intentionally run only the requested job.
  try {
    await marketCalendarSync(context, log.child('market-calendar-sync'));
  } catch (error) {
    log.warn('market calendar startup sync failed', errorFields(error));
  }

  const jobs = buildScheduler(context);
  scheduler = jobs.scheduler;
  feed = jobs.feed;
  log.info('worker running; ctrl-c to stop');

  // IPO history: until the history load has completed for the configured
  // first day (`backfill.since`), run it once on start — a fresh deploy, or a
  // wider window, fills itself instead of waiting for `--once backfill-ipos`.
  // Then GMP, and the RHPs from `rhp.since` in one larger run. Not awaited: the
  // load is paced and takes about an hour; the scheduler's guard keeps each job
  // from running twice at once. A load cut short is retried on the next start.
  void (async () => {
    try {
      const { since } = (await loadIpoSourcesConfig()).backfill;
      const feed = ipoHistoryFeedId(since);
      if ((await feedHealth(context.db, [feed])).get(feed)?.lastSuccess) return;
      log.info('IPO history not loaded for this window; loading it once', { since });
      await jobs.scheduler.trigger('backfill-ipos');
      await jobs.scheduler.trigger('ingest-ipo-gmp');
      await jobs.scheduler.trigger('backfill-ipo-rhp');
    } catch (error) {
      log.warn('ipo history load could not start', errorFields(error));
    }
  })();

  // Stock analysis: until the two-year history load has completed once, run it
  // on start (paced NSE file downloads, roughly half an hour). Not awaited.
  void (async () => {
    try {
      if (await stockAnalysisBackfillDone(context)) {
        // Loaded before dividends were recorded: fill those once.
        if (await dividendsBackfillDone(context)) return;
        log.info('dividend history not loaded; loading it once');
        await jobs.scheduler.trigger('backfill-dividends');
        return;
      }
      log.info('stock-analysis history not loaded; loading it once');
      await jobs.scheduler.trigger('backfill-stock-analysis');
    } catch (error) {
      log.warn('stock-analysis history load could not start', errorFields(error));
    }
  })();

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
        await refreshLatestQuotes(context, log.child('refresh-latest-quotes'));
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
