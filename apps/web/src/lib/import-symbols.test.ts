import { describe, expect, it } from 'vitest';
import {
  looksLikeIsin,
  MAX_ROWS,
  normaliseSymbol,
  parseImport,
  splitCells,
} from './import-symbols';

describe('normaliseSymbol', () => {
  it('strips exchange prefixes, suffixes and series codes', () => {
    expect(normaliseSymbol('NSE:SBIN-EQ')).toBe('SBIN');
    expect(normaliseSymbol('TCS.NS')).toBe('TCS');
    expect(normaliseSymbol('reliance')).toBe('RELIANCE');
    expect(normaliseSymbol('"INFY"')).toBe('INFY');
    expect(normaliseSymbol('M&M')).toBe('M&M');
    expect(normaliseSymbol('BAJAJ-AUTO')).toBe('BAJAJ-AUTO');
  });

  it('rejects things that are not tickers', () => {
    expect(normaliseSymbol('')).toBeNull();
    expect(normaliseSymbol('12')).toBeNull();
    expect(normaliseSymbol('Reliance Industries')).toBeNull();
    expect(normaliseSymbol('₹1,234.50')).toBeNull();
  });
});

describe('looksLikeIsin', () => {
  it('recognises an Indian ISIN and nothing shorter', () => {
    expect(looksLikeIsin('INE002A01018')).toBe(true);
    expect(looksLikeIsin('ine467b01029')).toBe(true);
    expect(looksLikeIsin('RELIANCE')).toBe(false);
    expect(looksLikeIsin('INE002A0101')).toBe(false);
  });
});

describe('parseImport — plain lists', () => {
  it('reads comma, space, semicolon and newline separated symbols', () => {
    const parsed = parseImport('RELIANCE, TCS INFY;HDFCBANK\nsbin\n');
    expect(parsed.format).toBe('list');
    expect(parsed.rows.map((row) => row.symbol)).toEqual([
      'RELIANCE',
      'TCS',
      'INFY',
      'HDFCBANK',
      'SBIN',
    ]);
  });

  it('keeps an ISIN as an ISIN and de-duplicates', () => {
    const parsed = parseImport('INE002A01018 RELIANCE reliance INE002A01018');
    expect(parsed.rows).toEqual([
      { line: 1, isin: 'INE002A01018' },
      { line: 1, symbol: 'RELIANCE' },
    ]);
  });

  it('drops tokens that cannot be a symbol rather than failing the paste', () => {
    const parsed = parseImport('RELIANCE 100 ₹2,500 TCS');
    expect(parsed.rows.map((row) => row.symbol)).toEqual(['RELIANCE', 'TCS']);
  });

  it('caps the row count and reports the overflow', () => {
    const text = Array.from({ length: MAX_ROWS + 5 }, (_, i) => `S${i}`).join('\n');
    const parsed = parseImport(text);
    expect(parsed.rows).toHaveLength(MAX_ROWS);
    expect(parsed.truncated).toBe(5);
  });
});

describe('parseImport — broker exports', () => {
  it('reads a Zerodha Kite holdings export by its Instrument column', () => {
    const csv = [
      'Instrument,Qty.,Avg. cost,LTP,Cur. val,P&L,Net chg.,Day chg.',
      'RELIANCE,10,2400.00,2500.00,25000.00,1000.00,4.17,0.50',
      'TCS,5,3500.00,3600.00,18000.00,500.00,2.86,-0.20',
      ',,,,43000.00,1500.00,,',
    ].join('\n');
    const parsed = parseImport(csv);
    expect(parsed.format).toBe('csv');
    expect(parsed.columns).toEqual({ symbol: 'Instrument' });
    expect(parsed.rows).toEqual([
      { line: 2, symbol: 'RELIANCE' },
      { line: 3, symbol: 'TCS' },
    ]);
  });

  it('reads a Zerodha Console export by Symbol and ISIN', () => {
    const csv = [
      'Symbol,ISIN,Sector,Quantity Available,Average Price,Previous Closing Price',
      'INFY,INE009A01021,IT,20,1400.00,1450.00',
    ].join('\n');
    const parsed = parseImport(csv);
    expect(parsed.rows).toEqual([{ line: 2, symbol: 'INFY', isin: 'INE009A01021' }]);
  });

  it('reads a Groww export, which has a company name and an ISIN but no symbol', () => {
    const csv = [
      'Stock Name,ISIN,Quantity,Average buy price,Buy value,Closing price',
      '"Reliance Industries",INE002A01018,10,2400,24000,2500',
      'Tata Consultancy Services,INE467B01029,5,3500,17500,3600',
      ',,,,,',
    ].join('\n');
    const parsed = parseImport(csv);
    expect(parsed.columns).toEqual({ isin: 'ISIN', name: 'Stock Name' });
    expect(parsed.rows).toEqual([
      { line: 2, isin: 'INE002A01018', name: 'Reliance Industries' },
      { line: 3, isin: 'INE467B01029', name: 'Tata Consultancy Services' },
    ]);
  });

  it('accepts tab-separated (pasted from a spreadsheet) with a name column only', () => {
    const tsv = 'Company\tQty\nHDFC Bank\t3\nInfosys\t7';
    const parsed = parseImport(tsv);
    expect(parsed.rows.map((row) => row.name)).toEqual(['HDFC Bank', 'Infosys']);
  });

  it('treats a header-less two-column paste as a list, not a CSV', () => {
    const parsed = parseImport('RELIANCE,10\nTCS,5');
    expect(parsed.format).toBe('list');
    expect(parsed.rows.map((row) => row.symbol)).toEqual(['RELIANCE', 'TCS']);
  });
});

describe('splitCells', () => {
  it('honours quoted cells with the delimiter and escaped quotes inside', () => {
    expect(splitCells('"Tata Motors, Ltd",TATAMOTORS,"say ""hi"""', ',')).toEqual([
      'Tata Motors, Ltd',
      'TATAMOTORS',
      'say "hi"',
    ]);
  });
});
