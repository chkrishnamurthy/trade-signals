import {
  type Database,
  finishIngestionRun,
  hasAnyIngestionRun,
  hasSuccessfulIngestionRun,
  type IngestionJob,
  startIngestionRun,
} from '@equitywise/db';
import { errorFields, type Logger } from './log.js';

/**
 * Ingestion bookkeeping for the worker: open a run before a job fetches, close
 * it after, and let `compute-indicators` ask whether the newest session was
 * actually loaded. See `packages/db/src/repositories/ingestion-runs.ts`.
 *
 * Bookkeeping must never be the reason a job fails: a database error while
 * opening or closing a run is logged and swallowed, and the job carries on.
 */

export interface RunOutcome {
  readonly requested: number;
  readonly succeeded: number;
  readonly rowsWritten: number;
  readonly failed: readonly string[];
}

/** `ok` when nothing failed, `failed` when nothing succeeded, otherwise `partial`. */
export function statusFor(outcome: RunOutcome): 'ok' | 'partial' | 'failed' {
  if (outcome.failed.length === 0) return 'ok';
  return outcome.succeeded === 0 ? 'failed' : 'partial';
}

/** Runs `job` inside a recorded ingestion run and returns its own result unchanged. */
export async function withIngestionRun<T extends RunOutcome>(
  db: Database,
  log: Logger,
  meta: { job: IngestionJob; tradingDate: string; requested?: number },
  job: () => Promise<T>,
): Promise<T> {
  let runId: number | null = null;
  try {
    runId = await startIngestionRun(db, {
      job: meta.job,
      tradingDate: meta.tradingDate,
      ...(meta.requested === undefined ? {} : { instrumentsRequested: meta.requested }),
    });
  } catch (error) {
    log.warn('could not open an ingestion run', { job: meta.job, ...errorFields(error) });
  }

  const close = async (result: Parameters<typeof finishIngestionRun>[2]): Promise<void> => {
    if (runId === null) return;
    try {
      await finishIngestionRun(db, runId, result);
    } catch (error) {
      log.warn('could not close an ingestion run', { job: meta.job, ...errorFields(error) });
    }
  };

  try {
    const outcome = await job();
    await close({
      status: statusFor(outcome),
      instrumentsRequested: outcome.requested,
      instrumentsSucceeded: outcome.succeeded,
      rowsWritten: outcome.rowsWritten,
      failedSymbols: outcome.failed,
    });
    return outcome;
  } catch (error) {
    await close({
      status: 'failed',
      instrumentsRequested: meta.requested ?? 0,
      instrumentsSucceeded: 0,
      rowsWritten: 0,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export type IndicatorGate = 'proceed' | 'warn' | 'refuse';

/**
 * What `compute-indicators` should do about the newest candle date.
 *
 * - A run recorded for that date: proceed.
 * - No run, and the table has never recorded any (a fresh deploy): proceed. The
 *   gate arms itself with the first run, so it cannot deadlock a new install.
 * - No run, gate armed: `refuse` when enforcement is on, else `warn`. Warn is
 *   the default because a wrong gate would stop every indicator; enforcement is
 *   switched on with `INDICATORS_REQUIRE_INGEST_RUN=true` once the runs have
 *   been seen to line up with the candles.
 */
export function decideIndicatorGate(input: {
  armed: boolean;
  hasRunForDate: boolean;
  enforce: boolean;
}): IndicatorGate {
  if (input.hasRunForDate || !input.armed) return 'proceed';
  return input.enforce ? 'refuse' : 'warn';
}

const CANDLE_JOBS: readonly IngestionJob[] = ['daily_candles', 'bhavcopy_candles'];

/** Applies the gate for `tradingDate` and throws when it says refuse. */
export async function checkSessionIngested(
  db: Database,
  log: Logger,
  tradingDate: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<IndicatorGate> {
  let gate: IndicatorGate;
  try {
    const [armed, hasRunForDate] = await Promise.all([
      hasAnyIngestionRun(db, CANDLE_JOBS),
      hasSuccessfulIngestionRun(db, CANDLE_JOBS, tradingDate),
    ]);
    gate = decideIndicatorGate({
      armed,
      hasRunForDate,
      enforce: env.INDICATORS_REQUIRE_INGEST_RUN?.trim().toLowerCase() === 'true',
    });
  } catch (error) {
    // Cannot read the bookkeeping: do not let that stop the pass.
    log.warn('could not read ingestion runs; proceeding', errorFields(error));
    return 'proceed';
  }

  if (gate === 'warn') {
    log.warn('no successful candle ingestion run is recorded for the newest session', {
      tradingDate,
      remedy:
        'check the ingest-daily / bhavcopy logs; set INDICATORS_REQUIRE_INGEST_RUN=true to block',
    });
  }
  if (gate === 'refuse') {
    throw new Error(
      `Refusing to compute indicators: no successful candle ingestion run for ${tradingDate}. ` +
        'The bars for that session may be missing, and indicators computed over a hole look plausible and are wrong.',
    );
  }
  return gate;
}
