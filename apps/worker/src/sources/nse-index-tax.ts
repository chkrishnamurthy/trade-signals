import { rupeesToPaise } from '@equitywise/shared';
import { cellNumber, csvRecords } from './india-disclosures.js';
import { PoliteHttpClient, SourceHttpError } from './ipo/http.js';
import { BROWSER_USER_AGENT } from './nse-market.js';
import { firstZipEntry } from './zip.js';

/**
 * Two public NSE archive files the portfolio needs:
 *
 *   ind_close_all_DDMMYYYY.csv   every NSE index's open/high/low/close for a
 *                                session; the benchmark reads Nifty 50 and
 *                                Nifty 500 from it (price index: no dividends)
 *   cmDDMONYYYYbhav.csv.zip      the old-format equity bhavcopy; the 31 Jan 2018
 *                                file gives each stock's highest price that day,
 *                                the "fair market value" of the 2018 rule
 */

const NSE_ARCHIVE = 'https://nsearchives.nseindia.com';
const REFERER = 'https://www.nseindia.com/';

/** NSE index names in the file → our index symbols. */
export const INDEX_FILE_NAMES: Readonly<Record<string, string>> = {
  'Nifty 50': 'NIFTY50',
  'Nifty 500': 'NIFTY500',
};

export interface IndexClose {
  readonly symbol: string;
  readonly name: string;
  readonly date: string;
  readonly openPaise: number;
  readonly highPaise: number;
  readonly lowPaise: number;
  readonly closePaise: number;
}

const paise = (value: string | undefined): number | null => {
  if (value === undefined || cellNumber(value) === null) return null;
  try {
    return rupeesToPaise(value.replace(/,/g, '').trim());
  } catch {
    return null;
  }
};

/** `DD-MM-YYYY` → `YYYY-MM-DD`, or null. */
function ddmmyyyyDash(value: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  return m === null ? null : `${m[3]}-${m[2]}-${m[1]}`;
}

/** The indices we track, from one `ind_close_all` file. Incoherent rows are dropped. */
export function parseIndexCloses(csv: string): IndexClose[] {
  const out: IndexClose[] = [];
  for (const row of csvRecords(csv)) {
    const name = (row['Index Name'] ?? '').trim();
    const symbol = INDEX_FILE_NAMES[name];
    if (symbol === undefined) continue;
    const date = ddmmyyyyDash(row['Index Date'] ?? '');
    const open = paise(row['Open Index Value']);
    const high = paise(row['High Index Value']);
    const low = paise(row['Low Index Value']);
    const close = paise(row['Closing Index Value']);
    if (date === null || open === null || high === null || low === null || close === null) continue;
    if (low <= 0 || high < low || close < low || close > high || open < low || open > high)
      continue;
    out.push({
      symbol,
      name,
      date,
      openPaise: open,
      highPaise: high,
      lowPaise: low,
      closePaise: close,
    });
  }
  return out;
}

export interface FmvRow {
  readonly isin: string;
  readonly symbol: string;
  readonly series: string;
  /** Highest price on the day, paise: the 2018 rule's fair market value. */
  readonly highPaise: number;
  readonly closePaise: number;
}

/** Old-format bhavcopy CSV → highest and closing price per ISIN (EQ preferred over other series). */
export function parseOldBhavcopy(csv: string): FmvRow[] {
  const byIsin = new Map<string, FmvRow>();
  for (const row of csvRecords(csv)) {
    const isin = (row.ISIN ?? '').trim();
    const symbol = (row.SYMBOL ?? '').trim();
    const series = (row.SERIES ?? '').trim();
    const high = paise(row.HIGH);
    const close = paise(row.CLOSE);
    if (isin === '' || symbol === '' || high === null || close === null || high <= 0) continue;
    const existing = byIsin.get(isin);
    if (existing !== undefined && existing.series === 'EQ') continue;
    byIsin.set(isin, { isin, symbol, series, highPaise: high, closePaise: close });
  }
  return [...byIsin.values()];
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export interface NseIndexTaxSource {
  /** Null when NSE has no file for the date (a holiday or a weekend). */
  fetchIndexCloses(date: string): Promise<IndexClose[] | null>;
  fetchOldBhavcopy(date: string): Promise<FmvRow[] | null>;
  readonly requestsSpent: number;
}

export function createNseIndexTaxSource(
  options: { maxRequestsPerRun?: number; minIntervalMs?: number } = {},
): NseIndexTaxSource {
  const client = new PoliteHttpClient({
    sourceId: 'nse-index-tax',
    userAgent: BROWSER_USER_AGENT,
    robotsAgent: 'equitywise',
    minIntervalMs: options.minIntervalMs ?? 1500,
    maxRequestsPerRun: options.maxRequestsPerRun ?? 60,
    timeoutMs: 30_000,
  });
  const notFound = (error: unknown) => error instanceof SourceHttpError && error.status === 404;
  return {
    get requestsSpent() {
      return client.requestsSpent;
    },
    fetchIndexCloses: async (date) => {
      const ddmmyyyy = `${date.slice(8, 10)}${date.slice(5, 7)}${date.slice(0, 4)}`;
      try {
        const text = await client.getText(
          `${NSE_ARCHIVE}/content/indices/ind_close_all_${ddmmyyyy}.csv`,
          {
            accept: 'text/csv, text/plain, */*',
            referer: REFERER,
          },
        );
        return parseIndexCloses(text);
      } catch (error) {
        if (notFound(error)) return null;
        throw error;
      }
    },
    fetchOldBhavcopy: async (date) => {
      const year = date.slice(0, 4);
      const month = MONTHS[Number(date.slice(5, 7)) - 1] ?? '';
      const file = `cm${date.slice(8, 10)}${month}${year}bhav.csv.zip`;
      try {
        const bytes = await client.getBytes(
          `${NSE_ARCHIVE}/content/historical/EQUITIES/${year}/${month}/${file}`,
          {
            accept: 'application/zip, */*',
            referer: REFERER,
          },
        );
        return parseOldBhavcopy(firstZipEntry(bytes).data.toString('utf8'));
      } catch (error) {
        if (notFound(error)) return null;
        throw error;
      }
    },
  };
}
