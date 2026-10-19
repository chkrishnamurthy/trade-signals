import { describe, expect, it } from 'vitest';
import { readCsv } from './csv.js';
import { derivePortfolio, type PortfolioEntry, wouldGoNegative } from './derive.js';
import { parsePortfolioFile, parseTradeDate, recognisePortfolioHeader } from './files.js';
import { parseRupeesToPaise, parseShareCount } from './money.js';
import { summarisePortfolio } from './summary.js';

describe('parseRupeesToPaise', () => {
  it('is exact on the digits, never a float', () => {
    expect(parseRupeesToPaise('54389.19')).toBe(5438919);
    expect(parseRupeesToPaise('16.53')).toBe(1653);
    expect(parseRupeesToPaise('0.07')).toBe(7);
    expect(parseRupeesToPaise('1,245.5')).toBe(124550);
    expect(parseRupeesToPaise('₹ 10')).toBe(1000);
    expect(parseRupeesToPaise('-48224')).toBe(-4822400);
  });
  it('rounds a third decimal half up and rejects text', () => {
    expect(parseRupeesToPaise('1.005')).toBe(101);
    expect(parseRupeesToPaise('1.004')).toBe(100);
    expect(parseRupeesToPaise('abc')).toBeNull();
    expect(parseRupeesToPaise('')).toBeNull();
    expect(parseRupeesToPaise('1.2.3')).toBeNull();
  });
});

describe('parseShareCount', () => {
  it('accepts whole numbers only', () => {
    expect(parseShareCount('280')).toBe(280);
    expect(parseShareCount('1,200')).toBe(1200);
    expect(parseShareCount('280.0')).toBe(280);
    expect(parseShareCount('280.5')).toBeNull();
    expect(parseShareCount('')).toBeNull();
    expect(parseShareCount('-3')).toBeNull();
  });
});

describe('readCsv', () => {
  it('handles quotes, doubled quotes, CRLF, BOM and a trailing empty column', () => {
    const rows = readCsv('﻿"A","B ""x""",\r\n1,"2,5",\n');
    expect(rows).toEqual([
      ['A', 'B "x"', ''],
      ['1', '2,5', ''],
    ]);
  });
});

// Synthetic: same column layout as a broker holdings export, invented figures.
const HOLDINGS_CSV = [
  '"Instrument","Qty.","Avg. cost","LTP","Invested","Cur. val","P&L","Net chg.","Day chg.",""',
  '"ALPHA",100,50.5,60,5050,6000,950,18.8,1.2,""',
  '"BETA",3290,16.53,8.59,54389.19,28261.1,-26128.09,-48.04,-0.23,""',
  '"GAMMA",10,100,90,2000,900,-1100,-55,-1,""',
  '"DELTA",2.5,100,90,250,225,-25,-10,-1,""',
  '',
].join('\n');

describe('parsePortfolioFile — holdings snapshot', () => {
  const parsed = parsePortfolioFile(HOLDINGS_CSV, '2026-10-05');
  it('recognises the layout and keeps the exact invested total', () => {
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.fileKind).toBe('holdings');
    const beta = parsed.rows.find((r) => r.symbol === 'BETA');
    expect(beta).toMatchObject({
      kind: 'opening',
      shares: 3290,
      amountPaise: 5438919,
      status: 'ready',
      tradeDate: '2026-10-05',
    });
  });
  it('flags a disagreement between average cost and invested for a person to check', () => {
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.rows.find((r) => r.symbol === 'GAMMA')?.status).toBe('check');
  });
  it('skips fractional shares with the line number', () => {
    if (!parsed.ok) throw new Error('unreachable');
    const delta = parsed.rows.find((r) => r.symbol === 'DELTA');
    expect(delta).toMatchObject({ status: 'skipped', line: 5 });
  });
  it('falls back to shares × average cost when there is no invested column', () => {
    const csv = 'Symbol,Quantity,Average Price\nABC,10,12.5\n';
    const p = parsePortfolioFile(csv, '2026-10-05');
    expect(p.ok && p.rows[0]?.amountPaise).toBe(12500);
  });
});

describe('parsePortfolioFile — trade list', () => {
  const csv = [
    'symbol,isin,trade_date,exchange,segment,trade_type,quantity,price,trade_id,order_id,order_execution_time',
    'ALPHA,INE000A01010,2025-09-02,NSE,EQ,buy,20,1540.25,T1,O1,2025-09-02T09:20:00',
    'ALPHA,INE000A01010,2026-01-20,NSE,EQ,sell,15,1600,T2,O2,2026-01-20T10:00:00',
    'BETA,,15/03/2025,NSE,EQ,buy,40,672,T3,O3,',
    'NIFTYFUT,,2025-06-03,NSE,FO,buy,75,24310,T4,O4,',
    'GAMMA,,2025-06-03,BSE,EQ,buy,5,10,T5,O5,',
    'DELTA,,2099-01-01,NSE,EQ,buy,5,10,T6,O6,',
  ].join('\n');
  const parsed = parsePortfolioFile(csv, '2026-10-05');
  it('maps buy and sell to added and removed shares with exact amounts', () => {
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.fileKind).toBe('trades');
    expect(parsed.rows[0]).toMatchObject({
      kind: 'add',
      shares: 20,
      amountPaise: 20 * 154025,
      tradeDate: '2025-09-02',
      tradeId: 'T1',
      status: 'ready',
    });
    expect(parsed.rows[1]).toMatchObject({ kind: 'remove', amountPaise: 15 * 160000 });
  });
  it('reads Indian day-first dates', () => {
    expect(parseTradeDate('15/03/2025')).toBe('2025-03-15');
    expect(parseTradeDate('2025-09-02T09:20:00')).toBe('2025-09-02');
    expect(parseTradeDate('31/02/2025')).toBeNull();
  });
  it('skips futures, other exchanges and future dates, saying why', () => {
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.rows.slice(3).map((r) => r.status)).toEqual(['skipped', 'skipped', 'skipped']);
  });
});

describe('parsePortfolioFile — rows above the table', () => {
  it('finds the header under a title and account block', () => {
    const csv = [
      'Holdings statement',
      'Client ID,AB1234',
      ',',
      'Symbol,ISIN,Sector,Quantity Available,Average Price',
      'ALPHA,INE000A01010,Tech,12,100.5',
    ].join('\n');
    const p = parsePortfolioFile(csv, '2026-10-05');
    expect(p.ok && p.rows[0]).toMatchObject({
      symbol: 'ALPHA',
      shares: 12,
      amountPaise: 120600,
      line: 5,
    });
  });
  it('recognises header rows by kind', () => {
    expect(recognisePortfolioHeader(['Instrument', 'Qty.', 'Avg. cost'])).toBe('holdings');
    expect(
      recognisePortfolioHeader(['symbol', 'trade_date', 'trade_type', 'quantity', 'price']),
    ).toBe('trades');
    expect(recognisePortfolioHeader(['Holdings statement'])).toBeNull();
  });
});

describe('parsePortfolioFile — bad input', () => {
  it('rejects an empty or unrecognised file with a plain message', () => {
    expect(parsePortfolioFile('', '2026-10-05')).toMatchObject({ ok: false, code: 'EMPTY' });
    expect(parsePortfolioFile('a,b\n1,2\n', '2026-10-05')).toMatchObject({
      ok: false,
      code: 'UNRECOGNISED',
    });
  });
});

const e = (
  id: number,
  kind: PortfolioEntry['kind'],
  date: string,
  shares: number,
  amountPaise: number,
  instrumentId = 1,
): PortfolioEntry => ({ id, instrumentId, kind, tradeDate: date, shares, amountPaise });

describe('derivePortfolio', () => {
  it('removes shares from the oldest purchase first (FIFO)', () => {
    const r = derivePortfolio(
      [
        e(1, 'add', '2025-01-01', 10, 10_000),
        e(2, 'add', '2025-02-01', 10, 14_000),
        e(3, 'remove', '2025-03-01', 5, 9_000),
      ],
      [],
    );
    expect(r.problems).toEqual([]);
    // 5 shares leave the ₹100.00 lot (cost 5,000): 15 shares remain at 5,000 + 14,000.
    expect(r.holdings[0]).toMatchObject({ instrumentId: 1, shares: 15, costPaise: 19_000 });
    expect(r.holdings[0]?.lots.map((l) => [l.entryId, l.shares, l.costPaise])).toEqual([
      [1, 5, 5_000],
      [2, 10, 14_000],
    ]);
    expect(r.realisations).toEqual([
      expect.objectContaining({
        entryId: 3,
        lotEntryId: 1,
        shares: 5,
        costPaise: 5_000,
        proceedsPaise: 9_000,
        gainPaise: 4_000,
        daysHeld: 59,
        term: 'short',
        intraday: false,
      }),
    ]);
  });
  it('closes a holding when everything is removed and leaves no cost behind', () => {
    const r = derivePortfolio(
      [e(1, 'add', '2025-01-01', 3, 1_000), e(2, 'remove', '2025-02-01', 3, 2_000)],
      [],
    );
    expect(r.holdings).toEqual([]);
  });
  it('refuses to remove more than was held on that date', () => {
    const r = derivePortfolio(
      [e(1, 'add', '2025-01-01', 3, 1_000), e(2, 'remove', '2025-02-01', 4, 2_000)],
      [],
    );
    expect(r.problems).toEqual([{ entryId: 2, code: 'REMOVES_MORE_THAN_HELD', held: 3 }]);
    expect(r.holdings[0]?.shares).toBe(3);
  });
  it('orders by date, not by when the row was typed', () => {
    const r = derivePortfolio(
      [e(2, 'remove', '2025-02-01', 3, 2_000), e(1, 'add', '2025-03-01', 3, 1_000)],
      [],
    );
    expect(r.problems.length).toBe(1);
  });
  it('applies a split to earlier entries only and keeps the total cost', () => {
    const split = { instrumentId: 1, kind: 'split', exDate: '2025-06-01', ratio: 0.2 };
    const r = derivePortfolio(
      [e(1, 'add', '2025-01-01', 10, 50_000), e(2, 'add', '2025-07-01', 5, 6_000)],
      [split],
    );
    expect(r.holdings[0]).toMatchObject({ shares: 55, costPaise: 56_000 });
    expect(r.holdings[0]?.adjustments).toEqual([
      { kind: 'split', exDate: '2025-06-01', ratio: 0.2 },
    ]);
  });
  it('applies a 1:1 bonus (ratio 0.5) and ignores dividends and other stocks', () => {
    const changes = [
      { instrumentId: 1, kind: 'bonus', exDate: '2025-06-01', ratio: 0.5 },
      { instrumentId: 1, kind: 'dividend', exDate: '2025-06-01', ratio: 0.9 },
      { instrumentId: 2, kind: 'split', exDate: '2025-06-01', ratio: 0.1 },
    ];
    const r = derivePortfolio([e(1, 'add', '2025-01-01', 7, 7_000)], changes);
    expect(r.holdings[0]?.shares).toBe(14);
  });
  it('does not adjust an opening entry dated after the ex-date', () => {
    const r = derivePortfolio(
      [e(1, 'opening', '2026-10-05', 40, 4_000)],
      [{ instrumentId: 1, kind: 'split', exDate: '2026-01-01', ratio: 0.5 }],
    );
    expect(r.holdings[0]?.shares).toBe(40);
  });
});

describe('wouldGoNegative', () => {
  it('catches an entry that would oversell, and one that breaks a later removal', () => {
    const base = [e(1, 'add', '2025-01-01', 5, 1_000), e(2, 'remove', '2025-03-01', 5, 2_000)];
    expect(wouldGoNegative(base, e(3, 'remove', '2025-02-01', 1, 100), [])).not.toBeNull();
    expect(wouldGoNegative(base, e(4, 'add', '2025-02-01', 1, 100), [])).toBeNull();
  });
});

describe('summarisePortfolio', () => {
  const holdings = [
    { instrumentId: 1, shares: 100, costPaise: 500_000, adjustments: [] },
    { instrumentId: 2, shares: 10, costPaise: 20_000, adjustments: [] },
  ];
  it('values priced holdings, ignores unpriced ones in the gain, and counts them', () => {
    const s = summarisePortfolio(
      holdings,
      new Map([[1, { ltpPaise: 6_000, previousClosePaise: 5_900 }]]),
    );
    expect(s.valuePaise).toBe(600_000);
    expect(s.gainPaise).toBe(100_000);
    expect(s.gainRatio).toBeCloseTo(0.2, 10);
    expect(s.dayChangePaise).toBe(10_000);
    expect(s.unpriced).toBe(1);
    expect(s.costPaise).toBe(520_000);
    expect(s.holdings[0]).toMatchObject({ avgCostPaise: 5_000, weight: 1 });
    expect(s.holdings[1]).toMatchObject({ valuePaise: null, gainPaise: null });
  });
  it('has no day change when the previous close is missing', () => {
    const s = summarisePortfolio(
      holdings,
      new Map([[1, { ltpPaise: 6_000, previousClosePaise: null }]]),
    );
    expect(s.dayChangeRatio).toBeNull();
    expect(s.dayChangePaise).toBe(0);
  });
});
