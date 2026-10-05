import { readCsv } from './csv.js';
import { parseRupeesToPaise, parseShareCount } from './money.js';

/**
 * Reads the two broker files we recognise and says, for every row, whether it can
 * be saved as is, needs the user's eye, or is left out.
 *
 *   holdings snapshot  one row per stock: symbol, shares, average cost (and often
 *                      total invested). Becomes one "opening" entry per stock,
 *                      dated by the day the user uploads it.
 *   trade list         one row per trade: date, side, shares, price. Becomes
 *                      "add" / "remove" entries with their real dates.
 *
 * Pure: it never looks a symbol up (that needs the database) and never reads the
 * clock; the caller passes today's date.
 */

export type EntryKind = 'opening' | 'add' | 'remove';
export type RowStatus = 'ready' | 'check' | 'skipped';

export interface ParsedRow {
  /** 1-based line in the file, for "row 7: …" messages. */
  readonly line: number;
  readonly symbol: string;
  readonly isin: string | null;
  readonly kind: EntryKind;
  /** YYYY-MM-DD. For a holdings snapshot this is the as-of date supplied by the caller. */
  readonly tradeDate: string;
  readonly shares: number;
  /** Total money for the entry in integer paise: cost for opening/add, proceeds for remove. */
  readonly amountPaise: number;
  /** The broker's trade id, when the file has one; used to skip a repeated import. */
  readonly tradeId: string | null;
  readonly status: RowStatus;
  readonly message: string;
}

export type FileKind = 'holdings' | 'trades';

export type ParsedFile =
  | { readonly ok: true; readonly fileKind: FileKind; readonly rows: ParsedRow[] }
  | {
      readonly ok: false;
      readonly code: 'EMPTY' | 'UNRECOGNISED' | 'TOO_LARGE';
      readonly message: string;
    };

export const MAX_IMPORT_ROWS = 2_000;

const normalise = (header: string) =>
  header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

import {
  AVG,
  DATE,
  EXCHANGE,
  INVESTED,
  ISIN,
  PRICE,
  SEGMENT,
  SHARES,
  SIDE,
  SYMBOL,
  TRADE_ID,
} from './columns.js';

function indexOfAny(headers: readonly string[], names: readonly string[]): number {
  for (const name of names) {
    const found = headers.indexOf(name);
    if (found !== -1) return found;
  }
  return -1;
}

const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  // Round-trips only for a real calendar day: 31 Feb rolls over to March and fails.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

/** ISO, or DD-MM-YYYY / DD/MM/YYYY (India's order), with or without a time of day. */
export function parseTradeDate(raw: string): string | null {
  const text = raw.trim().slice(0, 10);
  if (isIsoDate(text)) return text;
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(raw.trim());
  if (m !== null) {
    const iso = `${m[3]}-${(m[2] ?? '').padStart(2, '0')}-${(m[1] ?? '').padStart(2, '0')}`;
    return isIsoDate(iso) ? iso : null;
  }
  return null;
}

const skipped = (base: Omit<ParsedRow, 'status' | 'message'>, message: string): ParsedRow => ({
  ...base,
  status: 'skipped',
  message,
});

export function parsePortfolioFile(text: string, today: string): ParsedFile {
  const records = readCsv(text);
  const headerIndex = records.findIndex((r) => r.some((c) => c !== ''));
  if (headerIndex === -1) return { ok: false, code: 'EMPTY', message: 'The file is empty.' };
  const headers = (records[headerIndex] ?? []).map(normalise);
  const body = records.slice(headerIndex + 1);
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `The file has more than ${MAX_IMPORT_ROWS} rows. Split it and import in parts.`,
    };
  }

  const cSymbol = indexOfAny(headers, SYMBOL);
  const cShares = indexOfAny(headers, SHARES);
  const cDate = indexOfAny(headers, DATE);
  const cSide = indexOfAny(headers, SIDE);
  const cPrice = indexOfAny(headers, PRICE);
  const cAvg = indexOfAny(headers, AVG);
  const cInvested = indexOfAny(headers, INVESTED);
  const cIsin = indexOfAny(headers, ISIN);
  const cTradeId = indexOfAny(headers, TRADE_ID);
  const cSegment = indexOfAny(headers, SEGMENT);
  const cExchange = indexOfAny(headers, EXCHANGE);

  const isTrades =
    cSymbol !== -1 && cShares !== -1 && cDate !== -1 && cSide !== -1 && cPrice !== -1;
  const isHoldings = cSymbol !== -1 && cShares !== -1 && (cAvg !== -1 || cInvested !== -1);
  if (!isTrades && !isHoldings) {
    return {
      ok: false,
      code: 'UNRECOGNISED',
      message:
        'We could not recognise the columns. A holdings file needs a stock, a number of shares and an average cost. A trade list needs a stock, date, whether shares were added or removed, number of shares and price.',
    };
  }

  const cell = (record: readonly string[], col: number) =>
    col === -1 ? '' : (record[col] ?? '').trim();
  const rows: ParsedRow[] = [];

  const readRecord = (record: readonly string[], k: number): ParsedRow | null => {
    if (record.every((c) => c === '')) return null;
    const line = headerIndex + k + 2;
    const symbol = cell(record, cSymbol).toUpperCase();
    const isin = cell(record, cIsin).toUpperCase() || null;
    const sharesText = cell(record, cShares);
    const shares = parseShareCount(sharesText);
    const tradeId = cell(record, cTradeId) || null;
    const base = {
      line,
      symbol,
      isin,
      kind: 'opening' as EntryKind,
      tradeDate: today,
      shares: shares ?? 0,
      amountPaise: 0,
      tradeId,
    };

    if (symbol === '') return skipped(base, 'No stock name on this row.');
    if (shares === null || shares <= 0)
      return skipped(base, `"${sharesText}" is not a whole number of shares.`);

    if (isTrades) {
      const segment = cell(record, cSegment).toUpperCase();
      const exchange = cell(record, cExchange).toUpperCase();
      const sideText = cell(record, cSide).toLowerCase();
      const date = parseTradeDate(cell(record, cDate));
      const price = parseRupeesToPaise(cell(record, cPrice));
      const kind: EntryKind | null = sideText.startsWith('b')
        ? 'add'
        : sideText.startsWith('s')
          ? 'remove'
          : null;
      const row = { ...base, kind: kind ?? 'add', tradeDate: date ?? today };
      if (segment !== '' && segment !== 'EQ')
        return skipped(row, 'Skipped: only shares are imported, not futures, options or currency.');
      if (exchange !== '' && exchange !== 'NSE')
        return skipped(row, `Skipped: ${exchange} is not supported yet; only NSE.`);
      if (kind === null) return skipped(row, `Skipped: the side "${sideText}" was not recognised.`);
      if (date === null) return skipped(row, 'Skipped: the date could not be read.');
      if (date > today) return skipped(row, 'Skipped: the date is in the future.');
      if (price === null || price <= 0)
        return skipped(row, 'Skipped: the price could not be read.');
      const verb = kind === 'add' ? 'added' : 'removed';
      return {
        ...row,
        amountPaise: shares * price,
        status: 'ready',
        message: `Ready: ${verb} ${shares} shares.`,
      };
    }

    // Holdings snapshot.
    const avg = parseRupeesToPaise(cell(record, cAvg));
    const invested = parseRupeesToPaise(cell(record, cInvested));
    let amountPaise: number | null = null;
    let note = '';
    if (invested !== null && invested > 0) {
      amountPaise = invested;
      if (avg !== null && avg > 0) {
        const byAvg = shares * avg;
        // Brokers round the average cost shown; the invested total is the exact one.
        if (Math.abs(invested - byAvg) > Math.max(byAvg, invested) * 0.01) {
          note = ' The invested total and average cost disagree by more than 1%; please check.';
        }
      }
    } else if (avg !== null && avg > 0) {
      amountPaise = shares * avg;
    }
    if (amountPaise === null)
      return skipped(base, 'Skipped: no average cost or invested amount on this row.');
    return {
      ...base,
      amountPaise,
      status: note === '' ? 'ready' : 'check',
      message: note === '' ? `Ready: ${shares} shares you hold today.` : `Check:${note}`,
    };
  };

  body.forEach((record, k) => {
    const row = readRecord(record, k);
    if (row !== null) rows.push(row);
  });

  return { ok: true, fileKind: isTrades ? 'trades' : 'holdings', rows };
}
