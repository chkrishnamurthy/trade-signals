import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { dailyCandles, ingestionRuns } from '../schema/index.js';

/**
 * Ingestion bookkeeping: which sessions the worker actually loaded.
 *
 * A job opens a run before it fetches and closes it after, so a worker outage
 * leaves an absent or `failed` row instead of a silent hole. `compute-indicators`
 * reads this before it computes (see `apps/worker/src/jobs/compute-indicators.ts`).
 *
 * Jobs write these rows; nothing in `apps/web` does.
 */

export type IngestionJob = 'daily_candles' | 'bhavcopy_candles' | 'indicators';
export type IngestionStatus = 'running' | 'ok' | 'partial' | 'failed';

export async function startIngestionRun(
  db: Database,
  input: { job: IngestionJob; tradingDate: string; instrumentsRequested?: number },
): Promise<number> {
  const [row] = await db
    .insert(ingestionRuns)
    .values({
      job: input.job,
      tradingDate: input.tradingDate,
      instrumentsRequested: input.instrumentsRequested ?? 0,
    })
    .returning({ id: ingestionRuns.id });
  if (row === undefined) throw new Error('Ingestion run insert returned no row.');
  return row.id;
}

export async function finishIngestionRun(
  db: Database,
  id: number,
  result: {
    status: Exclude<IngestionStatus, 'running'>;
    instrumentsRequested: number;
    instrumentsSucceeded: number;
    rowsWritten: number;
    failedSymbols?: readonly string[];
    error?: string | null;
  },
): Promise<void> {
  await db
    .update(ingestionRuns)
    .set({
      finishedAt: new Date(),
      status: result.status,
      instrumentsRequested: result.instrumentsRequested,
      instrumentsSucceeded: result.instrumentsSucceeded,
      rowsWritten: result.rowsWritten,
      // A retry re-fetches exactly these, so keep the list bounded.
      failedSymbols: [...(result.failedSymbols ?? [])].slice(0, 500),
      error: result.error?.slice(0, 1000) ?? null,
    })
    .where(eq(ingestionRuns.id, id));
}

/** True once any run of these jobs has ever been recorded — the gate arms itself. */
export async function hasAnyIngestionRun(
  db: Database,
  jobs: readonly IngestionJob[],
): Promise<boolean> {
  const [row] = await db
    .select({ id: ingestionRuns.id })
    .from(ingestionRuns)
    .where(inArray(ingestionRuns.job, [...jobs]))
    .limit(1);
  return row !== undefined;
}

/** True when a run of one of these jobs finished `ok` or `partial` for the date. */
export async function hasSuccessfulIngestionRun(
  db: Database,
  jobs: readonly IngestionJob[],
  tradingDate: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: ingestionRuns.id })
    .from(ingestionRuns)
    .where(
      and(
        inArray(ingestionRuns.job, [...jobs]),
        eq(ingestionRuns.tradingDate, tradingDate),
        inArray(ingestionRuns.status, ['ok', 'partial']),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export interface IngestionRunRow {
  readonly id: number;
  readonly job: string;
  readonly tradingDate: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly status: string;
  readonly instrumentsRequested: number;
  readonly instrumentsSucceeded: number;
  readonly rowsWritten: number;
  readonly failedCount: number;
  readonly error: string | null;
}

/** The most recent runs, newest first. For `pnpm data:coverage`. */
export async function listIngestionRuns(db: Database, limit = 40): Promise<IngestionRunRow[]> {
  return db
    .select({
      id: ingestionRuns.id,
      job: ingestionRuns.job,
      tradingDate: ingestionRuns.tradingDate,
      startedAt: ingestionRuns.startedAt,
      finishedAt: ingestionRuns.finishedAt,
      status: ingestionRuns.status,
      instrumentsRequested: ingestionRuns.instrumentsRequested,
      instrumentsSucceeded: ingestionRuns.instrumentsSucceeded,
      rowsWritten: ingestionRuns.rowsWritten,
      failedCount: sql<number>`coalesce(array_length(${ingestionRuns.failedSymbols}, 1), 0)::int`,
      error: ingestionRuns.error,
    })
    .from(ingestionRuns)
    .orderBy(desc(ingestionRuns.startedAt), desc(ingestionRuns.id))
    .limit(limit);
}

/** The timestamp of the newest stored daily candle across all instruments, or null. */
export async function getLatestDailyCandleTime(db: Database): Promise<Date | null> {
  const [row] = await db
    .select({ ts: sql<Date | null>`max(${dailyCandles.ts})` })
    .from(dailyCandles);
  return row?.ts === null || row?.ts === undefined ? null : new Date(row.ts);
}
