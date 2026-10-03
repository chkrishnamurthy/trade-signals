import type { EquityListEntry } from '@equitywise/db';
import { rupeesToPaise } from '@equitywise/shared';
import { z } from 'zod';
import { cellNumber, csvRecords, parseDdMonYyyy } from './india-disclosures.js';
import { PoliteHttpClient, SourceHttpError } from './ipo/http.js';

/**
 * NSE public end-of-day files for the stock-analysis surfaces
 * (docs/planning/screener-dhan-fyers-plan.md §2–3):
 *
 *   - `EQUITY_L.csv`                 — the listed-equity universe
 *   - `ind_*list.csv`                — index constituents (with industry)
 *   - `sec_bhavdata_full_DDMMYYYY`   — every stock's closed daily bar
 *   - corporate actions API          — splits, bonuses, consolidations
 *
 * Best-effort public inputs (plan §5.2 policy): fetched through the polite
 * client (robots.txt honoured — NSE's allows these paths; requests spaced and
 * budgeted), shown to signed-in users only, never promised complete. NSE's
 * CDN refuses non-browser clients, so the browser User-Agent applies (owner
 * decision D2, 2026-10-02, NSE only).
 *
 * The parsers are pure and tested; every transport throws on failure.
 */

const NSE_ARCHIVE = 'https://nsearchives.nseindia.com';
const NSE_API = 'https://www.nseindia.com/api';
const REFERER = 'https://www.nseindia.com/';

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

/** The cash-equity series the screener covers (owner decision, 2026-10-03). */
export const SCREENER_SERIES: ReadonlySet<string> = new Set(['EQ', 'BE', 'BZ']);

export const INDEX_FILES: readonly { readonly key: string; readonly file: string }[] = [
  { key: 'nifty50', file: 'ind_nifty50list.csv' },
  { key: 'niftynext50', file: 'ind_niftynext50list.csv' },
  { key: 'nifty100', file: 'ind_nifty100list.csv' },
  { key: 'nifty200', file: 'ind_nifty200list.csv' },
  { key: 'nifty500', file: 'ind_nifty500list.csv' },
  { key: 'niftymidcap150', file: 'ind_niftymidcap150list.csv' },
  { key: 'niftysmallcap250', file: 'ind_niftysmallcap250list.csv' },
  { key: 'niftymicrocap250', file: 'ind_niftymicrocap250_list.csv' },
  { key: 'niftytotalmarket', file: 'ind_niftytotalmarket_list.csv' },
];

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * `EQUITY_L.csv` → equity-list entries for EQ/BE/BZ.
 *
 * Header: `SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE,
 * MARKET LOT, ISIN NUMBER, FACE VALUE` (headers padded with spaces).
 */
export function parseEquityList(csv: string): EquityListEntry[] {
  const out: EquityListEntry[] = [];
  const seen = new Set<string>();
  for (const row of csvRecords(csv)) {
    const symbol = (row.SYMBOL ?? '').trim().toUpperCase();
    const series = (row.SERIES ?? '').trim().toUpperCase();
    const isin = (row['ISIN NUMBER'] ?? '').trim().toUpperCase();
    const name = (row['NAME OF COMPANY'] ?? '').trim();
    if (symbol === '' || name === '' || !SCREENER_SERIES.has(series) || seen.has(symbol)) continue;
    if (!/^IN[A-Z0-9]{10}$/.test(isin)) continue;
    const face = (row['FACE VALUE'] ?? '').trim();
    let faceValuePaise: number | null = null;
    try {
      faceValuePaise = face === '' ? null : rupeesToPaise(face);
    } catch {
      faceValuePaise = null;
    }
    seen.add(symbol);
    out.push({
      symbol,
      name,
      series: series as EquityListEntry['series'],
      isin,
      listingDate: parseDdMonYyyy(row['DATE OF LISTING'] ?? ''),
      faceValuePaise: faceValuePaise !== null && faceValuePaise > 0 ? faceValuePaise : null,
    });
  }
  return out;
}

export interface IndexConstituent {
  readonly symbol: string;
  readonly industry: string | null;
}

/** `ind_*list.csv` → constituents. Header: `Company Name,Industry,Symbol,Series,ISIN Code`. */
export function parseIndexConstituents(csv: string): IndexConstituent[] {
  const out: IndexConstituent[] = [];
  for (const row of csvRecords(csv)) {
    const symbol = (row.Symbol ?? '').trim().toUpperCase();
    if (symbol === '') continue;
    const industry = (row.Industry ?? '').trim();
    out.push({ symbol, industry: industry === '' ? null : industry });
  }
  return out;
}

export interface BhavBar {
  readonly symbol: string;
  readonly series: string;
  readonly tradingDate: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly trades: number | null;
  readonly turnoverPaise: number | null;
}

/**
 * `sec_bhavdata_full_DDMMYYYY.csv` → one closed daily bar per EQ/BE/BZ stock.
 *
 * This is the exchange's final file for a COMPLETED session, so a bar read
 * from it is closed by construction (hard rule 2; owner decision 2026-10-03
 * that the same evening's file may be screened). Rows that would violate the
 * candle CHECKs (non-positive prices, incoherent OHLC) are dropped here rather
 * than failing a whole insert batch. A symbol listed in two series keeps EQ.
 */
export function parseBhavdataBars(csv: string): BhavBar[] {
  const bySymbol = new Map<string, BhavBar>();
  for (const row of csvRecords(csv)) {
    const series = (row.SERIES ?? '').trim();
    if (!SCREENER_SERIES.has(series)) continue;
    const symbol = (row.SYMBOL ?? '').trim();
    const tradingDate = parseDdMonYyyy(row.DATE1 ?? '');
    if (symbol === '' || tradingDate === null) continue;

    const prices = [row.OPEN_PRICE, row.HIGH_PRICE, row.LOW_PRICE, row.CLOSE_PRICE].map(paiseCell);
    const [open, high, low, close] = prices;
    const volume = cellNumber(row.TTL_TRD_QNTY);
    if (open == null || high == null || low == null || close == null || volume === null) continue;
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) continue;
    if (high < low || high < open || high < close || low > open || low > close) continue;

    const turnoverLakh = cellNumber(row.TURNOVER_LACS);
    const trades = cellNumber(row.NO_OF_TRADES);
    const bar: BhavBar = {
      symbol,
      series,
      tradingDate,
      open,
      high,
      low,
      close,
      volume: Math.round(volume),
      trades: trades === null ? null : Math.round(trades),
      turnoverPaise: turnoverLakh === null ? null : Math.round(turnoverLakh * 10_000_000),
    };
    const existing = bySymbol.get(symbol);
    if (existing === undefined || series === 'EQ') bySymbol.set(symbol, bar);
  }
  return [...bySymbol.values()];
}

function paiseCell(value: string | undefined): number | null {
  const n = cellNumber(value);
  if (n === null || value === undefined) return null;
  try {
    return rupeesToPaise(value.replace(/,/g, '').trim());
  } catch {
    return null;
  }
}

const corporateActionSchema = z.object({
  symbol: z.string(),
  series: z.string().optional(),
  subject: z.string(),
  exDate: z.string(),
});

export interface RawCorporateAction {
  readonly symbol: string;
  readonly series: string | null;
  readonly subject: string;
  readonly exDate: string;
}

/** NSE `corporates-corporateActions` JSON → actions with an ISO ex-date. Unreadable rows are dropped. */
export function parseCorporateActions(payload: unknown): RawCorporateAction[] {
  const rows = z.array(z.unknown()).safeParse(payload);
  if (!rows.success) throw new Error('corporate actions: expected an array');
  const out: RawCorporateAction[] = [];
  for (const raw of rows.data) {
    const parsed = corporateActionSchema.safeParse(raw);
    if (!parsed.success) continue;
    const exDate = parseDdMonYyyy(parsed.data.exDate);
    if (exDate === null) continue;
    out.push({
      symbol: parsed.data.symbol.trim().toUpperCase(),
      series: parsed.data.series?.trim() ?? null,
      subject: parsed.data.subject,
      exDate,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export interface NseMarketSource {
  fetchEquityList(): Promise<EquityListEntry[]>;
  fetchIndex(file: string): Promise<IndexConstituent[]>;
  /** Null when NSE has no file for the date (a holiday or a weekend). */
  fetchBhavdata(date: string): Promise<{ bars: BhavBar[]; csv: string } | null>;
  fetchCorporateActions(from: string, to: string): Promise<RawCorporateAction[]>;
  readonly requestsSpent: number;
}

export interface NseMarketSourceOptions {
  readonly maxRequestsPerRun?: number;
  readonly minIntervalMs?: number;
  readonly signal?: AbortSignal;
}

/** `YYYY-MM-DD` → `DDMMYYYY` (archives) or `DD-MM-YYYY` (API). */
function ddmmyyyy(date: string, separator = ''): string {
  return `${date.slice(8, 10)}${separator}${date.slice(5, 7)}${separator}${date.slice(0, 4)}`;
}

export function createNseMarketSource(options: NseMarketSourceOptions = {}): NseMarketSource {
  const client = new PoliteHttpClient({
    sourceId: 'nse-market',
    userAgent: BROWSER_USER_AGENT,
    robotsAgent: 'equitywise',
    minIntervalMs: options.minIntervalMs ?? 1500,
    maxRequestsPerRun: options.maxRequestsPerRun ?? 60,
    timeoutMs: 30_000,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const csv = { accept: 'text/csv, text/plain, */*', referer: REFERER } as const;

  return {
    get requestsSpent() {
      return client.requestsSpent;
    },
    fetchEquityList: async () =>
      parseEquityList(await client.getText(`${NSE_ARCHIVE}/content/equities/EQUITY_L.csv`, csv)),
    fetchIndex: async (file) =>
      parseIndexConstituents(await client.getText(`${NSE_ARCHIVE}/content/indices/${file}`, csv)),
    fetchBhavdata: async (date) => {
      try {
        const text = await client.getText(
          `${NSE_ARCHIVE}/products/content/sec_bhavdata_full_${ddmmyyyy(date)}.csv`,
          csv,
        );
        return { bars: parseBhavdataBars(text), csv: text };
      } catch (error) {
        if (error instanceof SourceHttpError && error.status === 404) return null;
        throw error;
      }
    },
    fetchCorporateActions: async (from, to) =>
      parseCorporateActions(
        await client.getJson(
          `${NSE_API}/corporates-corporateActions?index=equities&from_date=${ddmmyyyy(from, '-')}&to_date=${ddmmyyyy(to, '-')}`,
          {
            accept: 'application/json',
            referer: `${REFERER}companies-listing/corporate-filings-actions`,
          },
        ),
      ),
  };
}
