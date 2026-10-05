import { describe, expect, it } from 'vitest';
import { pickSheet, sheetRowsToCsv } from './spreadsheet';

describe('sheetRowsToCsv', () => {
  it('keeps number text exact, dates as calendar days, and quotes every field', () => {
    const csv = sheetRowsToCsv([
      ['Symbol', 'Qty', 'Avg', 'Date', 'Note'],
      ['URJA', '3290', '16.53', new Date('2025-09-02T00:00:00Z'), 'say "hi", ok'],
      [null, undefined, '', true, 7],
    ]);
    expect(csv.split('\n')).toEqual([
      '"Symbol","Qty","Avg","Date","Note"',
      '"URJA","3290","16.53","2025-09-02","say ""hi"", ok"',
      '"","","","true","7"',
    ]);
  });
});

describe('pickSheet', () => {
  it('prefers the sheet with a recognisable table, even below a title block', () => {
    const sheets = [
      { sheet: 'Summary', data: [['Account summary'], ['Value', '1000']] },
      {
        sheet: 'Equity',
        data: [
          ['Holdings'],
          [],
          ['Symbol', 'Quantity Available', 'Average Price'],
          ['A', '1', '2'],
        ],
      },
    ];
    expect(pickSheet(sheets)?.sheet).toBe('Equity');
  });
  it('falls back to the first sheet, and to null with none', () => {
    expect(pickSheet([{ sheet: 'One', data: [['x']] }])?.sheet).toBe('One');
    expect(pickSheet([])).toBeNull();
  });
});

describe('a real .xlsx workbook, end to end', () => {
  it('reads the right sheet, keeps number text exact and parses as a holdings file', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: readXlsxFile } = await import('read-excel-file/node');
    const { parsePortfolioFile } = await import('@equitywise/core');
    // Synthetic workbook: a "Summary" sheet, then an "Equity" sheet with a title block
    // above the table. Invented figures.
    const buffer = readFileSync(new URL('./__fixtures__/holdings-sample.xlsx', import.meta.url));
    const sheets = await readXlsxFile(buffer, { parseNumber: (text: string) => text });
    const sheet = pickSheet(sheets);
    expect(sheet?.sheet).toBe('Equity');
    const parsed = parsePortfolioFile(sheetRowsToCsv(sheet?.data ?? []), '2026-10-05');
    expect(parsed.ok && parsed.fileKind).toBe('holdings');
    if (!parsed.ok) return;
    expect(parsed.rows.map((r) => [r.symbol, r.shares, r.amountPaise, r.status])).toEqual([
      ['ALPHA', 12, 120600, 'ready'],
      ['BETA', 3290, 3290 * 1653, 'ready'],
    ]);
  });
});
