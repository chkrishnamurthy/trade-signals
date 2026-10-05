import { readFileSync } from 'node:fs';
import {
  createDatabase,
  type DatabaseHandle,
  dailyClosesBetween,
  ensureInstruments,
  fairMarketValuesFor,
  getWorkerCheckpoint,
  indexInstrumentIds,
} from '@equitywise/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import type { WorkerContext } from '../context.js';
import { createLogger } from '../log.js';
import {
  type NseIndexTaxSource,
  parseIndexCloses,
  parseOldBhavcopy,
} from '../sources/nse-index-tax.js';
import { firstZipEntry } from '../sources/zip.js';
import {
  backfillIndexCloses,
  FMV_2018_CHECKPOINT,
  ingestIndexCloses,
  loadFairMarketValues2018,
} from './portfolio-reference.js';

/** The portfolio reference jobs on a real database, with NSE replaced by the captured files. */
const url = resolveTestDatabaseUrl();
const suite = url ? describe : describe.skip;
const fixture = (name: string) =>
  readFileSync(new URL(`../sources/__fixtures__/${name}`, import.meta.url));

suite('portfolio reference jobs', () => {
  let handle: DatabaseHandle;
  let context: WorkerContext;
  const asked: string[] = [];
  const oct1 = parseIndexCloses(fixture('ind_close_all_01102026.csv').toString('utf8'));
  const source: NseIndexTaxSource = {
    fetchIndexCloses: async (date) => {
      asked.push(date);
      // Only 1 Oct has a file; other days are "no file" (holiday or weekend).
      return date === '2026-10-01' ? oct1 : null;
    },
    fetchOldBhavcopy: async (date) =>
      date === '2018-01-31'
        ? parseOldBhavcopy(firstZipEntry(fixture('cm31JAN2018bhav.csv.zip')).data.toString('utf8'))
        : null,
    requestsSpent: 0,
  };

  beforeAll(async () => {
    if (url === undefined) return;
    handle = createDatabase({ connectionString: url, max: 4 });
    context = { db: handle.db } as unknown as WorkerContext;
  });
  afterAll(async () => {
    await handle?.close();
  });

  it('stores Nifty 50 and Nifty 500 closes for the last week, weekdays only, and is idempotent', async () => {
    const first = await ingestIndexCloses(context, createLogger('test'), {
      now: new Date('2026-10-05T14:00:00Z'),
      source,
    });
    expect(first).toEqual({ sessions: 1, written: 2 });
    expect(asked.every((d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()))).toBe(true);
    const again = await ingestIndexCloses(context, createLogger('test'), {
      now: new Date('2026-10-05T14:00:00Z'),
      source,
    });
    expect(again.written).toBe(0);
    const ids = await indexInstrumentIds(handle.db, ['NIFTY50', 'NIFTY500']);
    const closes = await dailyClosesBetween(
      handle.db,
      [...ids.values()],
      '2026-09-28',
      '2026-10-05',
    );
    expect(closes.get(ids.get('NIFTY50')!)).toEqual([
      { date: '2026-10-01', closePaise: 2_242_195 },
    ]);
  });

  it('backfills with a resumable checkpoint and stops once done', async () => {
    const run = await backfillIndexCloses(context, createLogger('test'), {
      now: new Date('2026-10-05T14:00:00Z'),
      years: 0.02,
      source,
    });
    expect(run.done).toBe(true);
    const cp = await getWorkerCheckpoint(handle.db, 'index-closes-backfill');
    expect(cp).toMatchObject({ done: true });
    const second = await backfillIndexCloses(context, createLogger('test'), {
      now: new Date('2026-10-05T14:00:00Z'),
      years: 0.02,
      source,
    });
    expect(second.sessions).toBe(0);
    // Run again days later: the same backfill, already done, not a fresh ten years.
    const later = await backfillIndexCloses(context, createLogger('test'), {
      now: new Date('2026-10-09T14:00:00Z'),
      years: 0.02,
      source,
    });
    expect(later.sessions).toBe(0);
  });

  it('loads 31 Jan 2018 highs and matches them to instruments by symbol when the ISIN is unknown', async () => {
    const { written } = await loadFairMarketValues2018(context, createLogger('test'), { source });
    expect(written).toBe(5);
    expect(await getWorkerCheckpoint(handle.db, FMV_2018_CHECKPOINT)).toMatchObject({
      done: true,
      rows: 5,
    });
    const ids = await ensureInstruments(handle.db, 'test', [
      { symbol: 'ITC', name: 'ITC', kind: 'equity' },
    ]);
    const fmv = await fairMarketValuesFor(handle.db, [ids.get('ITC')!]);
    expect(fmv.get(ids.get('ITC')!)).toBe(27_600);
  });
});
