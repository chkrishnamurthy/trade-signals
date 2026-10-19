import { describe, expect, it } from 'vitest';
import { parsePortfolioFile } from './files.js';
import {
  contractNoteToCsv,
  detectStatementKind,
  numbersIn,
  parseCasStatement,
  parseContractNote,
  parseStatementDate,
} from './statements.js';

// Synthetic lines in the published layouts (no real statement is in the repository).
const CDSL = [
  'CDSL Consolidated Account Statement',
  'Statement for the period from 01-Sep-2026 to 30-Sep-2026',
  'HOLDING STATEMENT AS ON 30-09-2026',
  'ISIN Security Current Bal Frozen Bal Pledge Bal Free Bal Market Price Value',
  'INE002A01018 RELIANCE INDUSTRIES LIMITED - EQ 100.000 0.000 0.000 100.000 1,412.30 1,41,230.00',
  'INE040A01034 HDFC BANK LIMITED EQ NEW FV RE. 1/- 60.000 0.000 0.000 60.000 1,742.30 1,04,538.00',
  'INF204KB14I2 NIPPON INDIA ETF GOLD BEES 50.000 0.000 0.000 50.000 80.10 4,005.00',
];
const NSDL = [
  'NSDL Consolidated Account Statement',
  'Summary of value of holdings as on September 30, 2026',
  'Equity Shares',
  'ISIN Company Name Face Value No. of Shares Market Price Value',
  'INE154A01025 ITC LIMITED 1.00 200 409.65 81,930.00',
  'INE002A01018 RELIANCE INDUSTRIES LIMITED 10.00 25 1,412.30 35,307.50',
];

describe('reading a CAS', () => {
  it('knows a CAS from a contract note', () => {
    expect(detectStatementKind(CDSL)).toBe('cas');
    expect(detectStatementKind(['Contract Note cum Tax Invoice'])).toBe('contract_note');
    expect(detectStatementKind(['Bank statement'])).toBe('unknown');
  });
  it('reads Indian-grouped numbers and dates in the formats statements use', () => {
    expect(numbersIn('1,41,230.00 and 100.000').map((n) => [n.value, n.integral])).toEqual([
      [141230, true],
      [100, true],
    ]);
    expect(parseStatementDate('30-Sep-2026')).toBe('2026-09-30');
    expect(parseStatementDate('30/09/2026')).toBe('2026-09-30');
    expect(parseStatementDate('31-Feb-2026')).toBeNull();
  });
  it('takes the shares whose price and value agree, equities only, with the as-of date', () => {
    const cas = parseCasStatement(CDSL);
    expect(cas.asOf).toBe('2026-09-30');
    expect(cas.holdings.map((h) => [h.isin, h.shares, h.status])).toEqual([
      ['INE002A01018', 100, 'ok'],
      ['INE040A01034', 60, 'ok'],
    ]);
    expect(cas.holdings[0]?.name).toBe('RELIANCE INDUSTRIES LIMITED - EQ');
  });
  it('skips the face value on an NSDL line', () => {
    const cas = parseCasStatement(NSDL);
    expect(cas.holdings.map((h) => [h.isin, h.shares, h.status])).toEqual([
      ['INE154A01025', 200, 'ok'],
      ['INE002A01018', 25, 'ok'],
    ]);
  });
  it('adds up one stock held in two demat accounts, and marks a row it cannot cross-check', () => {
    const cas = parseCasStatement([
      'INE002A01018 RELIANCE 100.000 1,412.30 1,41,230.00',
      'INE002A01018 RELIANCE 5.000 1,412.30 7,061.50',
      'INE154A01025 ITC LIMITED 200',
    ]);
    expect(cas.holdings).toEqual([
      expect.objectContaining({ isin: 'INE002A01018', shares: 105, status: 'ok' }),
      expect.objectContaining({ isin: 'INE154A01025', shares: 200, status: 'check' }),
    ]);
  });
});

const NOTE = [
  'CONTRACT NOTE CUM TAX INVOICE',
  'Trade Date: 02/10/2026',
  'Order No. Order Time Trade No. Trade Time Security / Contract Description Buy(B) / Sell(S) Quantity Gross Rate Brokerage Net Rate Closing Rate Net Total',
  '1300000012345678 10:15:01 75012345 10:15:02 RELIANCE INDUSTRIES LTD INE002A01018 B 10 1,410.50 0.00 1,410.50 1,412.30 14,105.00',
  '1300000012345679 11:02:11 75012399 11:02:12 ITC LTD INE154A01025 S 50 410.00 0.41 409.59 409.65 20,479.50',
  'NIFTY 26OCT 25000 CE NFO B 75 120.00 0.00 120.00 118.00 9,000.00',
];

describe('reading a contract note', () => {
  it('reads each equity trade with its date, side, shares and net rate', () => {
    const note = parseContractNote(NOTE);
    expect(note.tradeDate).toBe('2026-10-02');
    expect(note.trades).toEqual([
      expect.objectContaining({
        isin: 'INE002A01018',
        kind: 'add',
        shares: 10,
        pricePaise: 141_050,
        tradeId: '1300000012345678',
        status: 'ok',
      }),
      // The net rate (after brokerage), not the gross price.
      expect.objectContaining({
        isin: 'INE154A01025',
        kind: 'remove',
        shares: 50,
        pricePaise: 40_959,
        status: 'ok',
      }),
    ]);
    expect(note.trades[0]?.name).toBe('RELIANCE INDUSTRIES LTD');
  });
  it('turns the trades into a trade list the import reads, matched by ISIN', () => {
    const parsed = parsePortfolioFile(contractNoteToCsv(parseContractNote(NOTE)), '2026-10-05');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.fileKind).toBe('trades');
    expect(
      parsed.rows.map((r) => [r.isin, r.kind, r.tradeDate, r.shares, r.amountPaise, r.status]),
    ).toEqual([
      ['INE002A01018', 'add', '2026-10-02', 10, 1_410_500, 'ready'],
      ['INE154A01025', 'remove', '2026-10-02', 50, 2_047_950, 'ready'],
    ]);
  });
  it('reads nothing without a trade date', () => {
    expect(parseContractNote(NOTE.slice(2)).trades).toEqual([]);
  });
});
