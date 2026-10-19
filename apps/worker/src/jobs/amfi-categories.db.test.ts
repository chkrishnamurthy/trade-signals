import { createDatabase, type DatabaseHandle, latestAmfiPeriod } from '@equitywise/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import type { WorkerContext } from '../context.js';
import { createLogger } from '../log.js';
import type { AmfiRow, AmfiSource } from '../sources/amfi-categories.js';
import { loadAmfiCategories, MIN_AMFI_ROWS } from './amfi-categories.js';

/** The AMFI loader on a real database, with AMFI's site replaced by canned lists. */
const url = resolveTestDatabaseUrl();
const suite = url ? describe : describe.skip;

const list = (count: number, category: AmfiRow['category'], from = 0): AmfiRow[] =>
  Array.from({ length: count }, (_, i) => ({
    isin: `INE${String(from + i).padStart(6, '0')}01${String((from + i) % 10)}0`.slice(0, 12),
    nseSymbol: `S${from + i}`,
    category,
  }));

suite('AMFI categories job', () => {
  let handle: DatabaseHandle;
  let context: WorkerContext;
  let downloads = 0;
  const source = (periodEnd: string, rows: AmfiRow[]): AmfiSource => ({
    latestFile: async () => ({ periodEnd, url: `https://example.test/${periodEnd}.xlsx` }),
    download: async () => {
      downloads += 1;
      return rows;
    },
  });

  beforeAll(async () => {
    if (url === undefined) return;
    handle = createDatabase({ connectionString: url, max: 4 });
    context = { db: handle.db } as unknown as WorkerContext;
    await handle.pool.query('delete from amfi_categories');
  });
  afterAll(async () => {
    if (url !== undefined) await handle.pool.query('delete from amfi_categories');
    await handle?.close();
  });

  it('refuses a list too short to be AMFI’s and loads nothing', async () => {
    const run = await loadAmfiCategories(context, createLogger('test'), {
      source: source('2026-06-30', list(10, 'large')),
    });
    expect(run).toMatchObject({ loaded: false, rows: 10 });
    expect(await latestAmfiPeriod(handle.db)).toBeNull();
  });

  it('loads a list once, skips the same or an older one, and takes a newer one', async () => {
    const dec = list(MIN_AMFI_ROWS, 'large');
    expect(
      await loadAmfiCategories(context, createLogger('test'), {
        source: source('2025-12-31', dec),
      }),
    ).toMatchObject({ loaded: true, periodEnd: '2025-12-31', rows: MIN_AMFI_ROWS });
    expect(await latestAmfiPeriod(handle.db)).toBe('2025-12-31');

    const before = downloads;
    expect(
      await loadAmfiCategories(context, createLogger('test'), {
        source: source('2025-12-31', dec),
      }),
    ).toMatchObject({ loaded: false });
    // Same period on file: the file is not even downloaded.
    expect(downloads).toBe(before);

    // June's list moves the first company from large to small and adds new ones.
    const jun = [...list(MIN_AMFI_ROWS, 'small'), ...list(3, 'mid', MIN_AMFI_ROWS)];
    expect(
      await loadAmfiCategories(context, createLogger('test'), {
        source: source('2026-06-30', jun),
      }),
    ).toMatchObject({ loaded: true, periodEnd: '2026-06-30' });
    expect(await latestAmfiPeriod(handle.db)).toBe('2026-06-30');
    const moved = await handle.pool.query<{ category: string; period_end: string }>(
      `select category, period_end::text from amfi_categories where isin = $1`,
      [dec[0]?.isin],
    );
    expect(moved.rows[0]).toMatchObject({ category: 'small', period_end: '2026-06-30' });
  });

  it('does nothing when the page links to no list', async () => {
    const none: AmfiSource = { latestFile: async () => null, download: async () => [] };
    expect(await loadAmfiCategories(context, createLogger('test'), { source: none })).toEqual({
      loaded: false,
      periodEnd: null,
      rows: 0,
    });
  });
});
