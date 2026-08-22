import { describe, expect, it } from 'vitest';
import type { MoverDto } from './dashboard-types';
import { mergeMissingSymbols, mergeStockRows } from './stocks-merge';

function quote(symbol: string, overrides: Partial<MoverDto> = {}): MoverDto {
  return {
    symbol,
    name: symbol,
    sector: 'Banking',
    ltp: 100_000,
    change: null,
    changePercent: null,
    open: null,
    high: null,
    low: null,
    previousClose: null,
    averagePrice: null,
    volume: null,
    timestamp: null,
    relativeVolume: null,
    turnover: null,
    ...overrides,
  };
}

describe('mergeStockRows', () => {
  it('emits one row per symbol however many indices carry it', () => {
    const { rows } = mergeStockRows([
      { key: 'nifty50', quotes: [quote('HDFCBANK'), quote('INFY', { sector: 'IT' })] },
      { key: 'banknifty', quotes: [quote('HDFCBANK'), quote('PNB', { sector: 'PSU Banks' })] },
    ]);

    expect(rows.map((r) => r.symbol)).toEqual(['HDFCBANK', 'INFY', 'PNB']);
  });

  it('accumulates index membership onto the shared row', () => {
    const { rows } = mergeStockRows([
      { key: 'nifty50', quotes: [quote('HDFCBANK')] },
      { key: 'banknifty', quotes: [quote('HDFCBANK')] },
    ]);

    expect(rows[0]?.indices).toEqual(['nifty50', 'banknifty']);
  });

  it('keeps the first index’s name and sector for a shared symbol', () => {
    const { rows } = mergeStockRows([
      { key: 'nifty50', quotes: [quote('SBIN', { name: 'State Bank of India' })] },
      { key: 'banknifty', quotes: [quote('SBIN', { name: 'SBI', sector: 'PSU Banks' })] },
    ]);

    expect(rows[0]?.name).toBe('State Bank of India');
    expect(rows[0]?.sector).toBe('Banking');
  });

  it('counts constituents per index before deduplication', () => {
    const { counts } = mergeStockRows([
      { key: 'nifty50', quotes: [quote('HDFCBANK'), quote('INFY')] },
      { key: 'banknifty', quotes: [quote('HDFCBANK')] },
    ]);

    expect(counts.get('nifty50')).toBe(2);
    expect(counts.get('banknifty')).toBe(1);
  });

  it('does not repeat an index key if a snapshot lists a symbol twice', () => {
    const { rows } = mergeStockRows([
      { key: 'nifty50', quotes: [quote('HDFCBANK'), quote('HDFCBANK')] },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.indices).toEqual(['nifty50']);
  });

  it('handles an empty universe', () => {
    expect(mergeStockRows([]).rows).toEqual([]);
  });
});

describe('mergeMissingSymbols', () => {
  it('drops a symbol that another index resolved', () => {
    const rows = mergeStockRows([{ key: 'banknifty', quotes: [quote('HDFCBANK')] }]).rows;
    // nifty50's snapshot had no quote for HDFCBANK, but banknifty's did — the
    // row is in the table, so warning that it is missing would contradict it.
    expect(mergeMissingSymbols([['HDFCBANK'], []], rows)).toEqual([]);
  });

  it('reports a symbol no index resolved, once, sorted', () => {
    expect(mergeMissingSymbols([['TMPV', 'ZZZZ'], ['TMPV']], [])).toEqual(['TMPV', 'ZZZZ']);
  });
});
