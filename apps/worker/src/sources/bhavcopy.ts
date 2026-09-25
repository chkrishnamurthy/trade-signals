import { inflateRawSync } from 'node:zlib';
import { BSE_EQUITY_GROUPS, type Exchange, isEquityIsin, rupeesToPaise } from '@equitywise/shared';

/**
 * The exchanges' end-of-day bhavcopy, in the common UDiFF format.
 *
 * Since July 2024 NSE and BSE publish the cash-market bhavcopy in the same
 * 34-column layout (`TradDt, …, FinInstrmId, ISIN, TckrSymb, SctySrs, …,
 * OpnPric, HghPric, LwPric, ClsPric, …, TtlTradgVol, TtlTrfVal, …`), verified
 * against both live files on 2026-09-25. One parser serves both.
 *
 * This is what gives EVERY listed equity a daily candle without spending the
 * brokers' request budgets: one file per exchange per session, instead of one
 * history call per name (multi-exchange plan §2.4). The file is published
 * after the close, so every row is a CLOSED session (hard rule 2).
 *
 * Public access does not establish redistribution rights — the same caveat as
 * every exchange feed (docs/planning/announcement-interpretation-sources.md).
 */

/** One equity's closed session, as the exchange printed it. Prices in paise. */
export interface BhavcopyRow {
  readonly exchange: Exchange;
  /** `YYYY-MM-DD`, the trading date. */
  readonly tradingDate: string;
  /** The exchange's ticker: NSE symbol, or BSE scrip id (`RELIANCE`). */
  readonly symbol: string;
  /** BSE scrip code (`500325`) or NSE token. */
  readonly exchangeCode: string;
  readonly isin: string;
  /** NSE series (`EQ`, `BE`, `BZ`) or BSE group (`A`, `B`, `T`, `X`…). */
  readonly series: string;
  readonly name: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly previousClose: number | null;
  /** Shares traded. A count. */
  readonly volume: number;
  /** Turnover, paise. */
  readonly value: number | null;
  readonly trades: number | null;
}

export interface ParseBhavcopyResult {
  readonly rows: BhavcopyRow[];
  /** In-scope rows that could not be parsed, with the reason. Never silently dropped. */
  readonly skipped: { readonly line: number; readonly reason: string }[];
}

/** NSE cash series the product screens: rolling (`EQ`) and trade-for-trade (`BE`, `BZ`). */
export const NSE_EQUITY_SERIES: ReadonlySet<string> = new Set(['EQ', 'BE', 'BZ']);

const REQUIRED = [
  'TradDt',
  'Sgmt',
  'FinInstrmTp',
  'FinInstrmId',
  'ISIN',
  'TckrSymb',
  'SctySrs',
  'FinInstrmNm',
  'OpnPric',
  'HghPric',
  'LwPric',
  'ClsPric',
  'PrvsClsgPric',
  'TtlTradgVol',
  'TtlTrfVal',
  'TtlNbOfTxsExctd',
] as const;

/** A main-board equity on this exchange — the same universe the providers' masters keep. */
export function isScreenableEquity(exchange: Exchange, isin: string, series: string): boolean {
  if (!isEquityIsin(isin)) return false;
  return exchange === 'NSE' ? NSE_EQUITY_SERIES.has(series) : BSE_EQUITY_GROUPS.has(series);
}

/**
 * Parses one exchange's UDiFF cash-market bhavcopy.
 *
 * Keeps main-board equities (equity-share ISIN, and an NSE equity series or a
 * BSE main-board group); drops debt, G-secs, fund units, SME and anything not
 * `STK` in the `CM` segment — out of scope, not malformed.
 */
export function parseBhavcopy(csv: string, exchange: Exchange): ParseBhavcopyResult {
  const lines = csv.split(/\r?\n/);
  const header = (lines[0] ?? '').replace(/^﻿/, '').split(',');
  const col = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
  const missing = REQUIRED.filter((name) => col[name] === undefined);
  if (missing.length > 0) {
    throw new RangeError(`parseBhavcopy: header is missing ${missing.join(', ')}`);
  }
  const at = (cells: readonly string[], name: (typeof REQUIRED)[number]): string =>
    (cells[col[name] ?? -1] ?? '').trim();

  const rows: BhavcopyRow[] = [];
  const skipped: { line: number; reason: string }[] = [];

  for (let n = 1; n < lines.length; n += 1) {
    const line = lines[n] ?? '';
    if (line.trim() === '') continue;
    // No UDiFF field is quoted: names carry `&` and `.` but never a comma.
    const cells = line.split(',');
    if (at(cells, 'Sgmt') !== 'CM' || at(cells, 'FinInstrmTp') !== 'STK') continue;
    const isin = at(cells, 'ISIN');
    const series = at(cells, 'SctySrs');
    if (!isScreenableEquity(exchange, isin, series)) continue;

    const tradingDate = at(cells, 'TradDt');
    const symbol = at(cells, 'TckrSymb');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tradingDate) || symbol === '') {
      skipped.push({ line: n + 1, reason: 'missing trade date or symbol' });
      continue;
    }
    try {
      const open = paise(at(cells, 'OpnPric'));
      const high = paise(at(cells, 'HghPric'));
      const low = paise(at(cells, 'LwPric'));
      const close = paise(at(cells, 'ClsPric'));
      const volume = count(at(cells, 'TtlTradgVol'));
      if (open === null || high === null || low === null || close === null || volume === null) {
        skipped.push({ line: n + 1, reason: 'missing OHLC or volume' });
        continue;
      }
      if (low > high || open < low || open > high || close < low || close > high) {
        skipped.push({ line: n + 1, reason: 'OHLC out of order' });
        continue;
      }
      rows.push({
        exchange,
        tradingDate,
        symbol: symbol.toUpperCase(),
        exchangeCode: at(cells, 'FinInstrmId'),
        isin,
        series,
        name: at(cells, 'FinInstrmNm'),
        open,
        high,
        low,
        close,
        previousClose: paise(at(cells, 'PrvsClsgPric')),
        volume,
        value: paise(at(cells, 'TtlTrfVal')),
        trades: count(at(cells, 'TtlNbOfTxsExctd')),
      });
    } catch (error) {
      skipped.push({ line: n + 1, reason: error instanceof Error ? error.message : 'bad number' });
    }
  }
  return { rows, skipped };
}

/** A rupee decimal string to paise, exactly. Empty is null; malformed throws. */
function paise(text: string): number | null {
  if (text === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new RangeError(`not a price: '${text}'`);
  return rupeesToPaise(text);
}

function count(text: string): number | null {
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`not a count: '${text}'`);
  return Math.round(value);
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  Accept: 'text/csv,application/zip,application/octet-stream,*/*',
};

/** `YYYY-MM-DD` → `YYYYMMDD`. */
function compact(date: string): string {
  return date.replaceAll('-', '');
}

/** Where each exchange publishes the day's file (verified reachable 2026-09-25). */
export function bhavcopyUrl(exchange: Exchange, tradingDate: string): string {
  const day = compact(tradingDate);
  return exchange === 'BSE'
    ? `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${day}_F_0000.CSV`
    : `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${day}_F_0000.csv.zip`;
}

/** Thrown when the exchange has no file for the date — a holiday, or not yet published. */
export class BhavcopyNotPublishedError extends Error {
  constructor(exchange: Exchange, tradingDate: string, status: number) {
    super(`${exchange} bhavcopy for ${tradingDate} is not published (HTTP ${status})`);
    this.name = 'BhavcopyNotPublishedError';
  }
}

export interface BhavcopySource {
  fetch(exchange: Exchange, tradingDate: string): Promise<ParseBhavcopyResult>;
}

/**
 * The live transport. NSE ships a one-file zip; BSE a bare CSV. Every failure
 * throws, so the job records it against the feed rather than writing nothing
 * silently.
 */
export function createBhavcopySource(fetchImpl: typeof fetch = fetch): BhavcopySource {
  return {
    async fetch(exchange, tradingDate) {
      const referer =
        exchange === 'BSE' ? 'https://www.bseindia.com/' : 'https://www.nseindia.com/';
      const response = await fetchImpl(bhavcopyUrl(exchange, tradingDate), {
        headers: { ...BROWSER_HEADERS, Referer: referer },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404) {
        throw new BhavcopyNotPublishedError(exchange, tradingDate, response.status);
      }
      if (!response.ok) {
        throw new Error(`${exchange} bhavcopy for ${tradingDate} responded ${response.status}`);
      }
      const body = Buffer.from(await response.arrayBuffer());
      const csv = exchange === 'NSE' ? unzipSingleFile(body) : body.toString('utf8');
      // An exchange that answers 200 with an HTML error page is "not published".
      if (!csv.startsWith('TradDt') && !csv.startsWith('﻿TradDt')) {
        throw new BhavcopyNotPublishedError(exchange, tradingDate, response.status);
      }
      return parseBhavcopy(csv, exchange);
    },
  };
}

/**
 * Extracts the only file in a zip archive.
 *
 * NSE's archive holds exactly one deflated CSV. Reading the local file header
 * directly avoids a zip dependency for a single fixed-shape file.
 */
export function unzipSingleFile(zip: Buffer): string {
  if (zip.readUInt32LE(0) !== 0x04034b50) throw new RangeError('not a zip archive');
  const method = zip.readUInt16LE(8);
  const nameLength = zip.readUInt16LE(26);
  const extraLength = zip.readUInt16LE(28);
  const start = 30 + nameLength + extraLength;
  // Sizes in the local header can be zero when bit 3 (data descriptor) is set;
  // take them from the central directory instead.
  const central = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const compressedSize = central >= 0 ? zip.readUInt32LE(central + 20) : zip.readUInt32LE(18);
  const data = zip.subarray(start, start + compressedSize);
  if (method === 0) return data.toString('utf8');
  if (method === 8) return inflateRawSync(data).toString('utf8');
  throw new RangeError(`unsupported zip compression method ${method}`);
}
