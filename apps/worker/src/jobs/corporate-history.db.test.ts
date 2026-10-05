import { randomUUID } from 'node:crypto';
import {
  CORPORATE_HISTORY_CHECKPOINT,
  corporateHistoryFrom,
  createDatabase,
  type DatabaseHandle,
  ensureInstruments,
  getWorkerCheckpoint,
} from '@equitywise/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import type { WorkerContext } from '../context.js';
import { createLogger } from '../log.js';
import type { NseMarketSource } from '../sources/nse-market.js';
import { backfillCorporateHistory } from './stock-analysis.js';

/**
 * The ten-year corporate-history load against a real database, with NSE replaced
 * by a fake that records which windows were asked for.
 */
const url = resolveTestDatabaseUrl();
const suite = url ? describe : describe.skip;

suite('backfillCorporateHistory', () => {
  let handle: DatabaseHandle;
  let context: WorkerContext;
  const symbol = `CH${randomUUID().slice(0, 6)}`.toUpperCase();
  const windows: [string, string][] = [];

  const source: NseMarketSource = {
    fetchEquityList: async () => [],
    fetchIndex: async () => [],
    fetchBhavdata: async () => null,
    fetchCorporateActions: async (from, to) => {
      windows.push([from, to]);
      // One split long ago and one dividend, each inside exactly one window.
      return [
        {
          symbol,
          series: 'EQ',
          subject: 'Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share',
          exDate: '2018-03-15',
        },
        { symbol, series: 'EQ', subject: 'Dividend - Rs 4 Per Share', exDate: '2019-07-10' },
      ].filter((a) => a.exDate >= from && a.exDate <= to);
    },
    requestsSpent: 0,
  };

  beforeAll(async () => {
    if (url === undefined) return;
    handle = createDatabase({ connectionString: url, max: 4 });
    context = { db: handle.db } as unknown as WorkerContext;
    await ensureInstruments(handle.db, 'test', [{ symbol, name: 'History Test', kind: 'equity' }]);
  });
  afterAll(async () => {
    await handle?.close();
  });

  it('walks ten years in quarters, records old actions, and says how far back data goes', async () => {
    await backfillCorporateHistory(context, createLogger('test'), {
      now: new Date('2026-10-05T12:00:00Z'),
      source,
    });
    expect(windows[0]?.[0]).toBe('2016-10-07');
    expect(windows.at(-1)?.[1]).toBe('2026-11-04');
    for (const [from, to] of windows) {
      expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBeLessThanOrEqual(90);
    }
    const split = await handle.pool.query<{ kind: string; ratio: string }>(
      'select ca.kind, ca.ratio::text as ratio from corporate_actions ca join instruments i on i.id = ca.instrument_id where i.symbol = $1',
      [symbol],
    );
    expect(split.rows.map((r) => [r.kind, Number(r.ratio)])).toEqual([['split', 0.2]]);
    const dividend = await handle.pool.query<{ amount_paise: number }>(
      'select d.amount_paise from dividends d join instruments i on i.id = d.instrument_id where i.symbol = $1',
      [symbol],
    );
    expect(dividend.rows.map((r) => r.amount_paise)).toEqual([400]);
    expect(await getWorkerCheckpoint(handle.db, CORPORATE_HISTORY_CHECKPOINT)).toEqual({
      done: true,
      from: '2016-10-07',
    });
    expect(await corporateHistoryFrom(handle.db)).toBe('2016-10-07');
  }, 15_000);
});
