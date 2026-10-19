import { PoliteHttpClient } from './ipo/http.js';
import { BROWSER_USER_AGENT } from './nse-market.js';

/**
 * AMFI's half-yearly list of Large, Mid and Small Cap companies (SEBI circular of
 * 6 Oct 2017: large = the top 100 by average market value over six months, mid =
 * 101 to 250, small = the rest). AMFI publishes an Excel file twice a year, in
 * early January (six months to 31 Dec) and early July (to 30 Jun). The file's
 * host and folder have moved between releases, so the newest file is found from
 * the listing page rather than guessed from a pattern.
 */

export const AMFI_LISTING_PAGE = 'https://www.amfiindia.com/otherdata/categorisation-of-stocks';

export type AmfiCategory = 'large' | 'mid' | 'small';

export interface AmfiRow {
  readonly isin: string;
  /** NSE trading symbol; null when the company is not listed on NSE. */
  readonly nseSymbol: string | null;
  readonly category: AmfiCategory;
}

export interface AmfiFileRef {
  /** The last day of the six months the list covers, YYYY-MM-DD. */
  readonly periodEnd: string;
  readonly url: string;
}

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/** The Excel files the listing page links to (`…AverageMarketCapitalization30Jun2026.xlsx`), newest first. */
export function listAmfiFiles(html: string): AmfiFileRef[] {
  const found = new Map<string, AmfiFileRef>();
  const link =
    /https:\/\/[^"'\\\s<>]*AverageMarketCapitalization(\d{2})([A-Za-z]{3})(\d{4})\.xlsx/g;
  for (const m of html.matchAll(link)) {
    const month = MONTHS[(m[2] ?? '').toLowerCase()];
    if (month === undefined) continue;
    const periodEnd = `${m[3]}-${month}-${m[1]}`;
    if (!found.has(periodEnd)) found.set(periodEnd, { periodEnd, url: m[0] });
  }
  return [...found.values()].sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
}

const text = (cell: unknown) => (typeof cell === 'string' ? cell.trim() : '');

const CATEGORY: Record<string, AmfiCategory> = {
  'large cap': 'large',
  'mid cap': 'mid',
  'small cap': 'small',
};

/**
 * The company rows of AMFI's sheet. Columns are found by their headings, not
 * their positions (the ISIN, the NSE symbol and the category), and a row counts
 * only with a real ISIN and one of the three categories.
 */
export function parseAmfiRows(rows: readonly (readonly unknown[])[]): AmfiRow[] {
  const headerAt = rows.findIndex((r) => r.some((c) => text(c).toLowerCase() === 'isin'));
  if (headerAt === -1) return [];
  const header = (rows[headerAt] ?? []).map((c) => text(c).toLowerCase());
  const isinCol = header.indexOf('isin');
  const symbolCol = header.indexOf('nse symbol');
  const categoryCol = header.findIndex((h) => /^categori[sz]ation/.test(h));
  if (isinCol === -1 || categoryCol === -1) return [];
  const out = new Map<string, AmfiRow>();
  for (const row of rows.slice(headerAt + 1)) {
    const isin = text(row[isinCol]).toUpperCase();
    const category = CATEGORY[text(row[categoryCol]).toLowerCase()];
    if (!/^IN[A-Z0-9]{10}$/.test(isin) || category === undefined) continue;
    const symbol = symbolCol === -1 ? '' : text(row[symbolCol]);
    out.set(isin, { isin, nseSymbol: symbol === '' || symbol === '-' ? null : symbol, category });
  }
  return [...out.values()];
}

export interface AmfiSource {
  /** The newest file the listing page links to; null when it links to none. */
  latestFile(): Promise<AmfiFileRef | null>;
  /** The company rows of one file. */
  download(file: AmfiFileRef): Promise<AmfiRow[]>;
}

export function createAmfiSource(): AmfiSource {
  // The listing page and the files sit on different hosts of the same organisation.
  const client = new PoliteHttpClient({
    sourceId: 'amfi',
    userAgent: BROWSER_USER_AGENT,
    robotsAgent: 'equitywise',
    minIntervalMs: 1500,
    maxRequestsPerRun: 6,
    timeoutMs: 30_000,
  });
  return {
    latestFile: async () => {
      const html = await client.getText(AMFI_LISTING_PAGE, { accept: 'text/html,*/*' });
      return listAmfiFiles(html)[0] ?? null;
    },
    download: async (file) => {
      const bytes = await client.getBytes(file.url, {
        accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*',
      });
      const { default: readXlsxFile } = await import('read-excel-file/node');
      const sheets = await readXlsxFile(Buffer.from(bytes));
      // The list is on one sheet; read every sheet and keep the one with companies.
      for (const sheet of sheets) {
        const rows = parseAmfiRows(sheet.data);
        if (rows.length > 0) return rows;
      }
      return [];
    },
  };
}
