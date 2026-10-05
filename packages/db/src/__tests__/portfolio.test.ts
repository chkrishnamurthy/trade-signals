import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import { createDatabase, type DatabaseHandle } from '../client.js';
import { ensureInstruments } from '../repositories/instruments.js';
import {
  deleteAllHoldingEntries,
  deleteHoldingEntry,
  latestDailyCloses,
  listHoldingEntries,
  listShareChanges,
  portfolioUsageSummary,
  recordPortfolioUsage,
  updateHoldingEntry,
  writeHoldingEntries,
} from '../repositories/portfolio.js';
import { listAllWatchedInstruments } from '../repositories/watchlists.js';

/**
 * Portfolio entries against a real Postgres: per-owner isolation, the all-or-nothing
 * validation hook, replace-on-snapshot, duplicate trade ids, cascade on account
 * deletion, and the worker's quote union picking up held stocks.
 */

const url = resolveTestDatabaseUrl();
const suite = url === undefined ? describe.skip : describe;
const tag = randomUUID().slice(0, 8);
const SETUP_TIMEOUT_MS = 30_000;

suite('portfolio entries', () => {
  let handle: DatabaseHandle;
  let owner: number;
  let stranger: number;
  let a: number;
  let b: number;
  const symA = `PFA${tag}`.toUpperCase();
  const symB = `PFB${tag}`.toUpperCase();

  beforeAll(async () => {
    if (url === undefined) return;
    handle = createDatabase({ connectionString: url, max: 4 });
    const users = await handle.db.execute<{ id: number }>(
      sql`insert into auth_users(email) values
        (${`pf-owner-${tag}@test.example`}), (${`pf-stranger-${tag}@test.example`}) returning id`,
    );
    owner = users.rows[0]!.id;
    stranger = users.rows[1]!.id;
    const ids = await ensureInstruments(handle.db, 'test', [
      { symbol: symA, name: 'Portfolio A', kind: 'equity' },
      { symbol: symB, name: 'Portfolio B', kind: 'equity' },
    ]);
    a = ids.get(symA)!;
    b = ids.get(symB)!;
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await handle?.close();
  }, SETUP_TIMEOUT_MS);

  const add = (
    instrumentId: number,
    over: Partial<{
      kind: 'opening' | 'add' | 'remove';
      shares: number;
      tradeId: string | null;
      tradeDate: string;
    }> = {},
  ) => ({
    instrumentId,
    kind: 'add' as const,
    tradeDate: '2026-01-02',
    shares: 10,
    amountPaise: 1_000_000,
    source: 'manual' as const,
    ...over,
  });

  it('keeps one owner’s entries out of another’s reach', async () => {
    const written = await writeHoldingEntries(handle.db, owner, { rows: [add(a)] });
    expect(written).toMatchObject({ ok: true, value: { inserted: 1 } });
    expect(await listHoldingEntries(handle.db, stranger)).toEqual([]);
    const mine = await listHoldingEntries(handle.db, owner);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      symbol: symA,
      shares: 10,
      amountPaise: 1_000_000,
      kind: 'add',
    });
  });

  it('cannot delete another owner’s entry by id', async () => {
    const [mine] = await listHoldingEntries(handle.db, owner);
    expect(await deleteHoldingEntry(handle.db, stranger, mine!.id)).toEqual({
      ok: true,
      value: false,
    });
    expect(await listHoldingEntries(handle.db, owner)).toHaveLength(1);
  });

  it('rolls back the whole write when the validator objects', async () => {
    const before = (await listHoldingEntries(handle.db, owner)).length;
    const result = await writeHoldingEntries(handle.db, owner, {
      rows: [add(b), add(b, { kind: 'remove', shares: 99, tradeDate: '2026-02-01' })],
      validate: () => 'You removed more shares than you held.',
    });
    expect(result).toEqual({
      ok: false,
      reason: 'rejected',
      message: 'You removed more shares than you held.',
    });
    expect((await listHoldingEntries(handle.db, owner)).length).toBe(before);
  });

  it('skips a repeated broker trade id instead of double counting', async () => {
    const row = add(b, { tradeId: `T-${tag}`, tradeDate: '2026-03-01' });
    const first = await writeHoldingEntries(handle.db, owner, { rows: [row] });
    const second = await writeHoldingEntries(handle.db, owner, { rows: [row] });
    expect(first).toMatchObject({ ok: true, value: { inserted: 1, skippedDuplicates: 0 } });
    expect(second).toMatchObject({ ok: true, value: { inserted: 0, skippedDuplicates: 1 } });
    // The same trade id belongs to a different owner independently.
    const other = await writeHoldingEntries(handle.db, stranger, { rows: [row] });
    expect(other).toMatchObject({ ok: true, value: { inserted: 1 } });
  });

  it('replaces the entries of the stocks in a fresh snapshot, and only those', async () => {
    const result = await writeHoldingEntries(handle.db, owner, {
      replaceInstrumentIds: [b],
      rows: [add(b, { kind: 'opening', shares: 7, tradeDate: '2026-10-05' })],
    });
    expect(result).toMatchObject({ ok: true, value: { inserted: 1, replaced: 1 } });
    const entries = await listHoldingEntries(handle.db, owner);
    expect(entries.filter((e) => e.instrumentId === b)).toHaveLength(1);
    expect(entries.filter((e) => e.instrumentId === a)).toHaveLength(1);
  });

  it('lets a delete be vetoed, leaving the row in place', async () => {
    const [target] = (await listHoldingEntries(handle.db, owner)).filter(
      (e) => e.instrumentId === a,
    );
    const vetoed = await deleteHoldingEntry(
      handle.db,
      owner,
      target!.id,
      () => 'A later removal depends on this.',
    );
    expect(vetoed).toMatchObject({ ok: false, reason: 'rejected' });
    expect((await listHoldingEntries(handle.db, owner)).some((e) => e.id === target!.id)).toBe(
      true,
    );
  });

  it('refuses a non-positive share count or a negative amount at the database', async () => {
    await expect(
      writeHoldingEntries(handle.db, owner, { rows: [add(a, { shares: 0 })] }),
    ).rejects.toThrow();
    await expect(
      writeHoldingEntries(handle.db, owner, { rows: [{ ...add(a), amountPaise: -1 }] }),
    ).rejects.toThrow();
  });

  it('adds held stocks to the quote refresh union without naming an owner', async () => {
    const watched = await listAllWatchedInstruments(handle.db);
    const symbols = watched.map((w) => w.symbol);
    expect(symbols).toContain(symA);
    expect(symbols).toContain(symB);
    expect(Object.keys(watched[0] ?? {}).sort()).toEqual(['exchange', 'id', 'kind', 'symbol']);
  });

  it('reads splits and bonuses for held stocks and ignores dividends', async () => {
    await handle.db.execute(
      sql`insert into corporate_actions(instrument_id, kind, ex_date, ratio) values
        (${a}, 'split', '2026-06-01', 0.2), (${a}, 'dividend', '2026-06-02', 0.99)`,
    );
    const changes = await listShareChanges(handle.db, [a, b]);
    expect(changes).toEqual([{ instrumentId: a, kind: 'split', exDate: '2026-06-01', ratio: 0.2 }]);
    expect(await listShareChanges(handle.db, [])).toEqual([]);
  });

  it('edits an entry in place, only for its owner, and lets a validator veto', async () => {
    const [target] = (await listHoldingEntries(handle.db, owner)).filter(
      (e) => e.instrumentId === a,
    );
    const patch = { tradeDate: '2026-01-05', shares: 12, amountPaise: 1_200_000 };
    expect(await updateHoldingEntry(handle.db, stranger, target!.id, patch)).toEqual({
      ok: true,
      value: false,
    });
    expect(
      await updateHoldingEntry(handle.db, owner, target!.id, patch, () => 'No.'),
    ).toMatchObject({ ok: false, reason: 'rejected' });
    expect(
      (await listHoldingEntries(handle.db, owner)).find((e) => e.id === target!.id)?.shares,
    ).toBe(target!.shares);
    expect(await updateHoldingEntry(handle.db, owner, target!.id, patch)).toEqual({
      ok: true,
      value: true,
    });
    expect(
      (await listHoldingEntries(handle.db, owner)).find((e) => e.id === target!.id),
    ).toMatchObject({ shares: 12, tradeDate: '2026-01-05', amountPaise: 1_200_000, kind: 'add' });
  });

  it('finds the newest and previous daily close as a fallback price', async () => {
    await handle.db.execute(
      sql`insert into daily_candles(instrument_id, ts, open, high, low, close, volume, provider_id) values
        (${a}, now() - interval '3 days', 100, 110, 90, 105, 10, 'test'),
        (${a}, now() - interval '2 days', 105, 115, 95, 111, 10, 'test')`,
    );
    const closes = await latestDailyCloses(handle.db, [a, b]);
    expect(closes.get(a)).toMatchObject({ closePaise: 111, previousClosePaise: 105 });
    expect(closes.has(b)).toBe(false);
    expect((await latestDailyCloses(handle.db, [])).size).toBe(0);
  });

  it('deletes everything an owner entered, and only theirs', async () => {
    const removed = await deleteAllHoldingEntries(handle.db, owner);
    expect(removed).toBeGreaterThan(0);
    expect(await listHoldingEntries(handle.db, owner)).toEqual([]);
    expect((await listHoldingEntries(handle.db, stranger)).length).toBeGreaterThan(0);
  });

  it('counts use without storing anything about holdings, and adds a day only once', async () => {
    await recordPortfolioUsage(handle.db, owner, 'view');
    await recordPortfolioUsage(handle.db, owner, 'view');
    await recordPortfolioUsage(handle.db, owner, 'import');
    await recordPortfolioUsage(handle.db, owner, 'add');
    const row = await handle.db.execute<Record<string, unknown>>(
      sql`select * from portfolio_usage where owner_id = ${owner}`,
    );
    expect(Object.keys(row.rows[0] ?? {}).sort()).toEqual([
      'active_days',
      'entries_added',
      'first_seen_at',
      'imports',
      'last_seen_at',
      'owner_id',
      'views',
    ]);
    expect(row.rows[0]).toMatchObject({ views: 2, imports: 1, entries_added: 1, active_days: 1 });
    // A visit on a later day counts as a second active day, and as a 30-day return.
    await handle.db.execute(
      sql`update portfolio_usage set first_seen_at = now() - interval '40 days', last_seen_at = now() - interval '40 days' where owner_id = ${owner}`,
    );
    await recordPortfolioUsage(handle.db, owner, 'view');
    const again = await handle.db.execute<{ active_days: number }>(
      sql`select active_days from portfolio_usage where owner_id = ${owner}`,
    );
    expect(again.rows[0]?.active_days).toBe(2);
    const summary = await portfolioUsageSummary(handle.db);
    expect(summary.users).toBeGreaterThanOrEqual(1);
    expect(summary.returnedAfter30Days).toBeGreaterThanOrEqual(1);
    expect(summary.eligibleFor30DayReturn).toBeGreaterThanOrEqual(summary.returnedAfter30Days);
  });

  it('cascades when the account is deleted', async () => {
    await handle.db.execute(sql`delete from auth_users where id = ${stranger}`);
    const left = await handle.db.execute<{ n: number }>(
      sql`select count(*)::int as n from holding_entries where owner_id = ${stranger}`,
    );
    expect(left.rows[0]?.n).toBe(0);
    await handle.db.execute(sql`delete from auth_users where id = ${owner}`);
    const usage = await handle.db.execute<{ n: number }>(
      sql`select count(*)::int as n from portfolio_usage where owner_id = ${owner}`,
    );
    expect(usage.rows[0]?.n).toBe(0);
  });
});
