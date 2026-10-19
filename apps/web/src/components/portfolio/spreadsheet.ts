import { MAX_PREAMBLE_ROWS, recognisePortfolioHeader } from '@equitywise/core';

/**
 * Excel (.xlsx) support for the portfolio upload, done in the browser.
 *
 * The workbook is turned into the same CSV text a CSV upload sends, so the server
 * parses one format and never receives the spreadsheet itself. Numbers are read as
 * the text Excel stored ("54389.19"), never as floats, so paise stay exact.
 */

type Cell = unknown;

function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return '';
  // Excel date cells arrive as Dates at UTC midnight; keep the calendar day.
  if (cell instanceof Date)
    return Number.isNaN(cell.getTime()) ? '' : cell.toISOString().slice(0, 10);
  return String(cell);
}

/** Rows of cells to CSV text, every field quoted. */
export function sheetRowsToCsv(rows: readonly (readonly Cell[])[]): string {
  return rows
    .map((row) => row.map((cell) => `"${cellText(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

/** The first sheet that has a header row we recognise near its top, else the first sheet. */
export function pickSheet<
  T extends { readonly sheet: string; readonly data: readonly (readonly Cell[])[] },
>(sheets: readonly T[]): T | null {
  const recognised = sheets.find((s) =>
    s.data
      .slice(0, MAX_PREAMBLE_ROWS)
      .some((row) => recognisePortfolioHeader(row.map(cellText)) !== null),
  );
  return recognised ?? sheets[0] ?? null;
}

export type SpreadsheetResult =
  | { ok: true; text: string; sheet: string }
  | { ok: false; message: string };

export async function readSpreadsheet(file: File): Promise<SpreadsheetResult> {
  if (/\.xls$/i.test(file.name)) {
    return {
      ok: false,
      message: 'Old Excel files (.xls) cannot be read. Save it as .xlsx or CSV, then upload that.',
    };
  }
  try {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const sheets = await readXlsxFile(file, { parseNumber: (text: string) => text });
    const sheet = pickSheet(sheets);
    if (sheet === null) return { ok: false, message: 'The workbook has no sheets.' };
    return { ok: true, text: sheetRowsToCsv(sheet.data), sheet: sheet.sheet };
  } catch {
    return {
      ok: false,
      message: 'We could not read that Excel file. Save it as CSV and try again.',
    };
  }
}
