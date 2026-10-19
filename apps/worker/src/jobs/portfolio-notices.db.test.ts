import {
  createDatabase,
  type DatabaseHandle,
  DEFAULT_NOTICE_SETTINGS_ROW,
  ensureInstruments,
  listNotices,
  saveNoticeSettings,
  unreadNoticeCount,
} from '@equitywise/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import type { WorkerContext } from '../context.js';
import { createLogger } from '../log.js';
import { writePortfolioNotices } from './portfolio-notices.js';

/** The holding-notices job on a real database. */
const url = resolveTestDatabaseUrl();
const suite = url ? describe : describe.skip;

suite('portfolio notices job', () => {
  let handle: DatabaseHandle;
  let context: WorkerContext;
  let owner = 0;
  let other = 0;
  const now = new Date('2026-10-05T15:00:00Z'); // 20:30 IST, after the evening pass

  beforeAll(async () => {
    if (url === undefined) return;
    handle = createDatabase({ connectionString: url, max: 4 });
    context = { db: handle.db } as unknown as WorkerContext;
    const users = await handle.pool.query<{ id: number }>(
      `insert into auth_users(email) values ('notices-a@example.test'), ('notices-b@example.test') returning id`,
    );
    owner = users.rows[0]?.id ?? 0;
    other = users.rows[1]?.id ?? 0;
    const ids = await ensureInstruments(handle.db, 'test', [
      { symbol: 'NOTA', name: 'Notice A Ltd', kind: 'equity' },
      { symbol: 'NOTB', name: 'Notice B Ltd', kind: 'equity' },
    ]);
    const a = ids.get('NOTA') ?? 0;
    const b = ids.get('NOTB') ?? 0;
    // Owner holds 100 NOTA (bought a year ago less 3 days) and 10 NOTB; the other user holds NOTB only.
    await handle.pool.query(
      `insert into holding_entries(owner_id, instrument_id, kind, trade_date, shares, amount_paise, source) values
       ($1, $3, 'add', '2025-10-08', 100, 4000000, 'manual'),
       ($1, $4, 'add', '2026-01-05', 10, 2000000, 'manual'),
       ($2, $4, 'add', '2026-01-05', 5, 1000000, 'manual')`,
      [owner, other, a, b],
    );
    // NOTA fell 400 → 360 (−10%) on 5 Oct; NOTB flat.
    await handle.pool.query(
      `insert into daily_candles(instrument_id, ts, open, high, low, close, volume, provider_id) values
       ($1, '2026-10-01T00:00:00Z', 40000, 40000, 40000, 40000, 0, 'test'),
       ($1, '2026-10-05T00:00:00Z', 36000, 36000, 36000, 36000, 0, 'test'),
       ($2, '2026-10-01T00:00:00Z', 200000, 200000, 200000, 200000, 0, 'test'),
       ($2, '2026-10-05T00:00:00Z', 200000, 200000, 200000, 200000, 0, 'test')
       on conflict do nothing`,
      [a, b],
    );
    // A dividend on NOTB in two days; a bonus on NOTA announced for next month (not yet in effect).
    await handle.pool.query(
      `insert into market_events(instrument_id, symbol, event_type, title, event_date) values ($1, 'NOTB', 'dividend', 'Interim dividend', '2026-10-07')`,
      [b],
    );
    await handle.pool.query(
      `insert into dividends(instrument_id, ex_date, kind, amount_paise, subject, source) values ($1, '2026-10-07', 'interim', 1500, 'Interim Dividend - Rs 15', 'test') on conflict do nothing`,
      [b],
    );
    await handle.pool.query(
      `insert into corporate_actions(instrument_id, kind, ex_date, ratio, note) values ($1, 'bonus', '2026-11-02', 0.5, 'test') on conflict do nothing`,
      [a],
    );
  });
  afterAll(async () => {
    if (url !== undefined) {
      await handle.pool.query('delete from auth_users where id = any($1)', [[owner, other]]);
    }
    await handle?.close();
  });

  it('writes each owner the notices for their own holdings, once', async () => {
    const run = await writePortfolioNotices(context, createLogger('test'), { now });
    expect(run.failed).toBe(0);
    const mine = await listNotices(handle.db, owner);
    expect(mine.map((n) => n.kind).sort()).toEqual([
      'event_soon',
      'long_term_soon',
      'portfolio_move',
      'stock_move',
    ]);
    const move = mine.find((n) => n.kind === 'stock_move');
    expect(move?.data).toMatchObject({
      symbol: 'NOTA',
      changeRatio: expect.closeTo(-0.1, 12),
      valueChangePaise: -400_000,
    });
    // The bonus is not in effect yet: no "shares changed" notice, and the share count is 100.
    expect(mine.some((n) => n.kind === 'share_change')).toBe(false);
    const theirs = await listNotices(handle.db, other);
    expect(theirs.map((n) => n.kind)).toEqual(['event_soon']);
    expect(theirs[0]?.data).toMatchObject({ symbol: 'NOTB', shares: 5, dividendPaise: 1500 });

    const again = await writePortfolioNotices(context, createLogger('test'), { now });
    expect(again.written).toBe(0);
    expect(await unreadNoticeCount(handle.db, owner)).toBe(4);
  });

  it('writes nothing a user has switched off', async () => {
    await handle.pool.query('delete from holding_notices where owner_id = $1', [other]);
    await saveNoticeSettings(handle.db, other, { ...DEFAULT_NOTICE_SETTINGS_ROW, events: false });
    await writePortfolioNotices(context, createLogger('test'), { now });
    expect(await listNotices(handle.db, other)).toEqual([]);
  });
});
