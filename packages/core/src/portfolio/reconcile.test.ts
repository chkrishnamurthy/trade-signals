import { describe, expect, it } from 'vitest';
import { derivePortfolio, type PortfolioEntry } from './derive.js';
import { flagSameDayTrades, parsePortfolioFile } from './files.js';
import { reconcileHolding } from './reconcile.js';

describe('reconcileHolding', () => {
  it('opens a holding the user has no entries for', () => {
    expect(
      reconcileHolding({
        fileShares: 100,
        fileAmountPaise: 500_000,
        current: null,
        pricePaise: 6_000,
      }),
    ).toMatchObject({
      action: 'opening',
      shares: 100,
      amountPaise: 500_000,
      status: 'ready',
    });
  });
  it('treats a holding whose entries are all removed as new', () => {
    expect(
      reconcileHolding({
        fileShares: 10,
        fileAmountPaise: 1_000,
        current: { shares: 0, costPaise: 0 },
        pricePaise: null,
      }).action,
    ).toBe('opening');
  });
  it('changes nothing when the count already matches, whatever the cost', () => {
    const r = reconcileHolding({
      fileShares: 100,
      fileAmountPaise: 999_999,
      current: { shares: 100, costPaise: 500_000 },
      pricePaise: 6_000,
    });
    expect(r).toMatchObject({ action: 'skip', shares: 0, status: 'skipped' });
    expect(r.message).toContain('Already matches');
  });
  it('adds only the extra shares, at the file average cost, for a person to confirm', () => {
    // File: 120 shares for ₹6,000.00 (₹50 a share). Entries: 100 shares.
    const r = reconcileHolding({
      fileShares: 120,
      fileAmountPaise: 600_000,
      current: { shares: 100, costPaise: 450_000 },
      pricePaise: 6_000,
    });
    expect(r).toMatchObject({ action: 'add', shares: 20, amountPaise: 100_000, status: 'check' });
  });
  it('records fewer shares as removed today at today’s price', () => {
    const r = reconcileHolding({
      fileShares: 80,
      fileAmountPaise: 400_000,
      current: { shares: 100, costPaise: 500_000 },
      pricePaise: 6_150,
    });
    expect(r).toMatchObject({
      action: 'remove',
      shares: 20,
      amountPaise: 123_000,
      status: 'check',
    });
  });
  it('cannot record a removal without a price, and says what to do', () => {
    const r = reconcileHolding({
      fileShares: 80,
      fileAmountPaise: 400_000,
      current: { shares: 100, costPaise: 500_000 },
      pricePaise: null,
    });
    expect(r).toMatchObject({ action: 'cannot', status: 'skipped' });
    expect(r.message).toContain('add that entry yourself');
  });
});

describe('same-day trades in a trade list', () => {
  const header = 'symbol,trade_date,exchange,segment,trade_type,quantity,price,trade_id';
  it('marks an add and a remove of one stock on one day for checking, and leaves other days alone', () => {
    const csv = [
      header,
      'ALPHA,2025-09-02,NSE,EQ,buy,10,100,T1',
      'ALPHA,2025-09-02,NSE,EQ,sell,10,105,T2',
      'ALPHA,2025-09-03,NSE,EQ,buy,5,101,T3',
      'BETA,2025-09-02,NSE,EQ,buy,5,50,T4',
    ].join('\n');
    const p = parsePortfolioFile(csv, '2026-10-05');
    if (!p.ok) throw new Error('unreachable');
    expect(p.rows.map((r) => r.status)).toEqual(['check', 'check', 'ready', 'ready']);
    expect(p.rows[0]?.message).toContain('intraday');
  });
  it('ignores rows that were already skipped', () => {
    const rows = flagSameDayTrades([
      {
        line: 2,
        symbol: 'A',
        isin: null,
        kind: 'add',
        tradeDate: '2025-01-01',
        shares: 1,
        amountPaise: 1,
        tradeId: null,
        status: 'ready',
        message: '',
      },
      {
        line: 3,
        symbol: 'A',
        isin: null,
        kind: 'remove',
        tradeDate: '2025-01-01',
        shares: 1,
        amountPaise: 1,
        tradeId: null,
        status: 'skipped',
        message: 'x',
      },
    ]);
    expect(rows.map((r) => r.status)).toEqual(['ready', 'skipped']);
  });
});

describe('derivePortfolio — one day, both sides', () => {
  it('applies the addition before the removal on the same day, whatever order they were entered', () => {
    const e = (id: number, kind: PortfolioEntry['kind'], shares: number): PortfolioEntry => ({
      id,
      instrumentId: 1,
      kind,
      tradeDate: '2025-09-02',
      shares,
      amountPaise: shares * 100,
    });
    const r = derivePortfolio([e(1, 'remove', 10), e(2, 'add', 10)], []);
    expect(r.problems).toEqual([]);
    expect(r.holdings).toEqual([]);
  });
});
