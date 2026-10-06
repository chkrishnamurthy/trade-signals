import { randomUUID } from 'node:crypto';
import { createDatabase, type DatabaseHandle, ensureInstruments } from '@equitywise/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';

/**
 * The portfolio's server loading code on a real Postgres: what the overview, a
 * holding page, the analysis page, the statement check and the notices page
 * assemble from the database, who can see it, and what is left out. The route
 * and session layers are replaced by a signed-in user id.
 */

const state = vi.hoisted(() => ({ userId: 0, db: undefined as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('./auth/require-user', () => ({
  getSessionUser: async () => (state.userId === 0 ? null : { id: state.userId }),
}));
vi.mock('./db', () => ({ getDatabase: () => state.db }));

const url = resolveTestDatabaseUrl();
const suite = url === undefined ? describe.skip : describe;
const tag = randomUUID().slice(0, 6).toUpperCase();
const SETUP_TIMEOUT_MS = 60_000;

suite('portfolio server loading', () => {
  let handle: DatabaseHandle;
  let owner = 0;
  let stranger = 0;
  let a = 0;
  let b = 0;
  const symA = `SRVA${tag}`;
  const symB = `SRVB${tag}`;
  const isinA = `INE${tag}01${tag.slice(0, 2)}1`.slice(0, 12);

  /** `n` days before today, as an ISO date (UTC; close enough for a seed). */
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  // The module under test, loaded after the mocks above.
  let server: typeof import('./portfolio');
  let notices: typeof import('./portfolio-notices');

  beforeAll(async () => {
    if (url === undefined) return;
    handle = createDatabase({ connectionString: url, max: 4 });
    state.db = handle.db;
    server = await import('./portfolio');
    notices = await import('./portfolio-notices');

    const users = await handle.pool.query<{ id: number }>(
      `insert into auth_users(email) values ($1), ($2) returning id`,
      [`srv-owner-${tag}@test.example`, `srv-stranger-${tag}@test.example`],
    );
    owner = users.rows[0]?.id ?? 0;
    stranger = users.rows[1]?.id ?? 0;
    const ids = await ensureInstruments(handle.db, 'test', [
      { symbol: symA, name: 'Server A Ltd', kind: 'equity' },
      { symbol: symB, name: 'Server B Ltd', kind: 'equity' },
    ]);
    a = ids.get(symA) ?? 0;
    b = ids.get(symB) ?? 0;
    await handle.pool.query('update instruments set isin = $1 where id = $2', [isinA, a]);

    // Thirty days of closes: A rises ₹100 → ₹130, B flat at ₹200.
    for (let n = 30; n >= 0; n--) {
      const day = daysAgo(n);
      for (const [id, close] of [
        [a, (130 - n) * 100],
        [b, 20_000],
      ] as const) {
        await handle.pool.query(
          `insert into daily_candles(instrument_id, ts, open, high, low, close, volume, provider_id)
           values ($1, $2::date::timestamp at time zone 'UTC', $3, $3, $3, $3, 0, 'test')
           on conflict do nothing`,
          [id, day, close],
        );
      }
    }
    // A bonus announced for 20 days from now: recorded ahead, but not yet in effect.
    await handle.pool.query(
      `insert into corporate_actions(instrument_id, kind, ex_date, ratio, note)
       values ($1, 'bonus', current_date + 20, 0.5, 'announced') on conflict do nothing`,
      [a],
    );

    state.userId = owner;
    const add = async (
      symbol: string,
      kind: 'opening' | 'add' | 'remove',
      tradeDate: string,
      shares: number,
      pricePaise: number,
    ) => {
      const outcome = await server.addPortfolioEntry({
        symbol,
        kind,
        tradeDate,
        shares,
        pricePaise,
        chargesPaise: 0,
        acquiredOn: null,
      });
      expect(outcome).toEqual({ ok: true });
    };
    await add(symA, 'add', daysAgo(25), 100, 10_500);
    await add(symB, 'add', daysAgo(25), 10, 19_000);
    await add(symB, 'remove', daysAgo(5), 10, 21_000);
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    if (url !== undefined) {
      await handle.pool.query('delete from auth_users where id = any($1)', [[owner, stranger]]);
      await handle.pool.query('delete from corporate_actions where instrument_id = $1', [a]);
      await handle.pool.query('delete from amfi_categories where isin = $1', [isinA]);
    }
    await handle?.close();
  });

  it('refuses a request with no signed-in user', async () => {
    state.userId = 0;
    await expect(server.getPortfolio()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(server.getHoldingDetail(symA)).rejects.toMatchObject({ status: 401 });
    await expect(notices.getNotices()).rejects.toMatchObject({ status: 401 });
    state.userId = owner;
  });

  it('values what is held at the latest close, leaving a fully removed stock out, and ignores an announced bonus', async () => {
    const p = await server.getPortfolio();
    expect(p.holdings.map((h) => h.symbol)).toEqual([symA]);
    // 100 shares, not 150: the bonus is announced for later and not yet in effect.
    expect(p.holdings[0]).toMatchObject({
      shares: 100,
      costPaise: 100 * 10_500,
      ltpPaise: 13_000,
      valuePaise: 100 * 13_000,
      priceSource: 'close',
    });
    expect(p.totals).toMatchObject({ valuePaise: 1_300_000, costPaise: 1_050_000 });
    expect(p.hasRemovals).toBe(true);
    // The headline return is worked out from the light inputs.
    expect(p.returns?.status).toBe('too_short');
    expect(p.returns?.openingsAtCost).toBe(0);
  });

  it('shows a held stock with its lots, and a fully removed stock with its history', async () => {
    const held = await server.getHoldingDetail(symA);
    expect(held?.holding).toMatchObject({ symbol: symA, shares: 100 });
    expect(held?.lots).toHaveLength(1);
    expect(held?.realised).toEqual([]);

    const gone = await server.getHoldingDetail(symB.toLowerCase());
    expect(gone).not.toBeNull();
    expect(gone?.holding).toBeNull();
    expect(gone?.stock).toEqual({ symbol: symB, name: 'Server B Ltd' });
    expect(gone?.entries).toHaveLength(2);
    expect(gone?.realised).toHaveLength(1);
    // Bought 10 × ₹190, removed 10 × ₹210: ₹200 gain, nothing left.
    expect(gone?.realised[0]).toMatchObject({ symbol: symB, gainPaise: 10 * (21_000 - 19_000) });
    expect(gone?.purchases[0]).toMatchObject({ leftShares: 0 });
    expect(gone?.totalReturnPaise).toBe(20_000);
    expect(gone?.lots).toEqual([]);
    // Only that stock's rows, never another's.
    expect(gone?.realised.every((r) => r.symbol === symB)).toBe(true);
    expect(await server.getHoldingDetail('NOSUCHSTOCK')).toBeNull();
  });

  it('keeps one user’s stocks out of another’s pages', async () => {
    state.userId = stranger;
    expect(await server.getHoldingDetail(symA)).toBeNull();
    expect(await server.getHoldingDetail(symB)).toBeNull();
    const p = await server.getPortfolio();
    expect(p.holdings).toEqual([]);
    expect(p.entryCount).toBe(0);
    state.userId = owner;
  });

  it('sizes a stock by the AMFI list when it is on it, and by index when it is not', async () => {
    const before = await server.getPortfolioAnalysis();
    expect(before.analysis.sizeBasis).toEqual({ amfiPeriod: null, indexCount: 1 });
    expect(before.analysis.holdings[0]?.size).toBe('other');
    await handle.pool.query(
      `insert into amfi_categories(isin, nse_symbol, category, period_end)
       values ($1, $2, 'mid', '2026-06-30') on conflict (isin) do update set category = 'mid'`,
      [isinA, symA],
    );
    const after = await server.getPortfolioAnalysis();
    expect(after.analysis.holdings[0]?.size).toBe('mid');
    expect(after.analysis.sizeBasis).toEqual({ amfiPeriod: '2026-06-30', indexCount: 0 });
    await handle.pool.query('delete from amfi_categories where isin = $1', [isinA]);
  });

  it('builds every analysis tab from the same entries', async () => {
    const r = await server.getPortfolioAnalysis();
    expect(r.analysis.holdingCount).toBe(1);
    expect(r.returns?.perHolding.map((x) => x.symbol).sort()).toEqual([symA, symB].sort());
    expect(r.returns?.realised.count).toBe(1);
    expect(r.benchmark).not.toBeNull();
    expect(r.tax?.openLots).toEqual([expect.objectContaining({ symbol: symA, shares: 100 })]);
    expect(r.tax?.byYear[r.tax.years[0] ?? '']).toBeDefined();
    expect(r.risk?.stocks.map((s) => s.symbol)).toEqual([symA]);
    // Thirty days of history is not about six months: the risk figures say so.
    expect(r.risk?.volatility.oneYear.status).toBe('needs_history');
  });

  it('exports the realised and still-held CSVs, only for the owner', async () => {
    expect(await server.getRealisedCsv()).toContain(symB);
    expect(await server.getOpenLotsCsv()).toContain(symA);
    state.userId = stranger;
    expect(await server.getOpenLotsCsv()).not.toContain(symA);
    state.userId = owner;
  });

  it('compares a statement with the record on its date, by ISIN, and saves nothing', async () => {
    const before = (await server.getPortfolio()).entryCount;
    const result = await server.checkStatement({
      asOf: daysAgo(1),
      holdings: [
        { isin: isinA, name: 'SERVER A', shares: 100, status: 'ok' },
        { isin: 'INE000Z01019', name: 'UNKNOWN CO', shares: 5, status: 'ok' },
      ],
    });
    expect(result.rows.map((r) => [r.symbol ?? r.name, r.status])).toEqual([
      ['UNKNOWN CO', 'unknown_stock'],
      [symA, 'match'],
    ]);
    const different = await server.checkStatement({
      asOf: daysAgo(1),
      holdings: [{ isin: isinA, name: 'SERVER A', shares: 90, status: 'ok' }],
    });
    expect(different.rows[0]).toMatchObject({
      status: 'different',
      statementShares: 90,
      recordShares: 100,
    });
    // On a date before the purchase the record held nothing.
    const early = await server.checkStatement({
      asOf: daysAgo(40),
      holdings: [{ isin: isinA, name: 'SERVER A', shares: 100, status: 'ok' }],
    });
    expect(early.rows[0]).toMatchObject({ status: 'not_in_record', recordShares: 0 });
    expect((await server.getPortfolio()).entryCount).toBe(before);
  });

  it('keeps notice settings and read marks per user', async () => {
    const start = await notices.getNotices();
    expect(start.settings).toMatchObject({ stockMovePercent: 5, longTermDays: 7 });
    await notices.saveSettings({ ...start.settings, stockMovePercent: 8, longTerm: false });
    expect((await notices.getNotices()).settings).toMatchObject({
      stockMovePercent: 8,
      longTerm: false,
    });
    state.userId = stranger;
    expect((await notices.getNotices()).settings.stockMovePercent).toBe(5);
    state.userId = owner;
    expect(await notices.markRead({})).toBe(0);
  });
});
