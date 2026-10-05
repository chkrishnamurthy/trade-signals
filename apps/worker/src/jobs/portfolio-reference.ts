import {
  ensureInstruments,
  getWorkerCheckpoint,
  insertDailyCandles,
  setWorkerCheckpoint,
  upsertFairMarketValues2018,
} from '@equitywise/db';
import { istDateKey } from '@equitywise/shared';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import {
  createNseIndexTaxSource,
  INDEX_FILE_NAMES,
  type IndexClose,
  type NseIndexTaxSource,
} from '../sources/nse-index-tax.js';

/**
 * Reference data the portfolio pages read, from NSE's public archive:
 *
 *   ingest-index-closes          nightly: Nifty 50 and Nifty 500 daily closes
 *                                (the last week, so a missed night fills itself)
 *   backfill-index-closes        on demand: the same, ten years back, resumable
 *   load-fair-market-values-2018 on demand, once: 31 Jan 2018 highs for the
 *                                grandfathering rule
 *
 * Index levels are stored like stock candles (integer paise, a session's closed
 * values only, never updated) under their own provider id.
 */

export const INDEX_CLOSE_PROVIDER = 'nse-index-close';
export const INDEX_BACKFILL_CHECKPOINT = 'index-closes-backfill';
export const FMV_2018_CHECKPOINT = 'fair-market-values-2018';
export const FMV_2018_DATE = '2018-01-31';

const INDEX_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(INDEX_FILE_NAMES).map(([name, symbol]) => [symbol, name]),
);

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const isWeekday = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
};

async function indexIds(context: WorkerContext): Promise<Map<string, number>> {
  return ensureInstruments(
    context.db,
    INDEX_CLOSE_PROVIDER,
    Object.keys(INDEX_NAMES).map((symbol) => ({
      symbol,
      name: INDEX_NAMES[symbol] ?? symbol,
      kind: 'index' as const,
    })),
  );
}

async function storeCloses(
  context: WorkerContext,
  ids: Map<string, number>,
  closes: readonly IndexClose[],
): Promise<number> {
  const rows = closes.flatMap((c) => {
    const instrumentId = ids.get(c.symbol);
    return instrumentId === undefined
      ? []
      : [
          {
            instrumentId,
            ts: new Date(`${c.date}T00:00:00Z`),
            open: c.openPaise,
            high: c.highPaise,
            low: c.lowPaise,
            close: c.closePaise,
            volume: 0,
          },
        ];
  });
  return insertDailyCandles(context.db, INDEX_CLOSE_PROVIDER, rows);
}

/** Loads one session's index closes; a holiday or weekend (no file) writes nothing. */
async function loadDate(
  context: WorkerContext,
  source: NseIndexTaxSource,
  ids: Map<string, number>,
  date: string,
) {
  const closes = await source.fetchIndexCloses(date);
  return closes === null
    ? { found: false, written: 0 }
    : { found: true, written: await storeCloses(context, ids, closes) };
}

export async function ingestIndexCloses(
  context: WorkerContext,
  log: Logger,
  options: { now?: Date; source?: NseIndexTaxSource } = {},
): Promise<{ sessions: number; written: number }> {
  const today = istDateKey(options.now ?? new Date());
  const source = options.source ?? createNseIndexTaxSource({ maxRequestsPerRun: 10 });
  const ids = await indexIds(context);
  let sessions = 0;
  let written = 0;
  for (let date = shiftDate(today, -7); date <= today; date = shiftDate(date, 1)) {
    if (!isWeekday(date)) continue;
    const result = await loadDate(context, source, ids, date);
    if (result.found) sessions += 1;
    written += result.written;
  }
  log.info('index closes ingested', { sessions, written });
  return { sessions, written };
}

/** Walks back `years`, oldest first, resumable: a run cut short continues from its checkpoint. */
export async function backfillIndexCloses(
  context: WorkerContext,
  log: Logger,
  options: { now?: Date; years?: number; source?: NseIndexTaxSource } = {},
): Promise<{ sessions: number; written: number; done: boolean }> {
  const today = istDateKey(options.now ?? new Date());
  const start = shiftDate(today, -Math.round(365 * (options.years ?? 10)));
  const checkpoint = await getWorkerCheckpoint(context.db, INDEX_BACKFILL_CHECKPOINT);
  if (checkpoint?.done === true && checkpoint.from === start)
    return { sessions: 0, written: 0, done: true };
  const resumeFrom =
    typeof checkpoint?.next === 'string' && checkpoint.from === start ? checkpoint.next : start;
  const source = options.source ?? createNseIndexTaxSource({ maxRequestsPerRun: 3_000 });
  const ids = await indexIds(context);
  let sessions = 0;
  let written = 0;
  for (let date = resumeFrom; date <= today; date = shiftDate(date, 1)) {
    if (!isWeekday(date)) continue;
    const result = await loadDate(context, source, ids, date);
    if (result.found) sessions += 1;
    written += result.written;
    if (sessions % 50 === 0) {
      await setWorkerCheckpoint(
        context.db,
        INDEX_BACKFILL_CHECKPOINT,
        { from: start, next: shiftDate(date, 1), done: false },
        Date.now(),
      );
    }
  }
  await setWorkerCheckpoint(
    context.db,
    INDEX_BACKFILL_CHECKPOINT,
    { from: start, done: true },
    Date.now(),
  );
  log.info('index close backfill finished', { from: start, sessions, written });
  return { sessions, written, done: true };
}

/** Loads the 31 Jan 2018 highs once. Re-running replaces them, so it is safe. */
export async function loadFairMarketValues2018(
  context: WorkerContext,
  log: Logger,
  options: { source?: NseIndexTaxSource } = {},
): Promise<{ written: number }> {
  const source = options.source ?? createNseIndexTaxSource({ maxRequestsPerRun: 3 });
  const rows = await source.fetchOldBhavcopy(FMV_2018_DATE);
  if (rows === null || rows.length === 0) {
    log.warn('31 Jan 2018 bhavcopy not available; grandfathering stays off');
    return { written: 0 };
  }
  const written = await upsertFairMarketValues2018(context.db, rows, 'nse-bhavcopy-2018-01-31');
  await setWorkerCheckpoint(
    context.db,
    FMV_2018_CHECKPOINT,
    { done: true, rows: written },
    Date.now(),
  );
  log.info('fair market values 2018 loaded', { written });
  return { written };
}
