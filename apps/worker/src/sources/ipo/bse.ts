import {
  classifySubscriptionLabel,
  cleanText,
  isAllowedHost,
  parseCount,
  parsePriceBand,
  parseRupeeAmount,
  rupeeTextToPaise,
} from '@equitywise/core';
import type {
  IpoKey,
  IpoSource,
  RawIpoDetail,
  RawIpoDocument,
  RawIpoListing,
  RawIpoSubscription,
  RawListingDay,
  RawRecentListing,
  RawSubscriptionRow,
} from '@equitywise/market-data';
import { fromIstParts, type IpoBoard, type IpoDocumentKind } from '@equitywise/shared';
import { z } from 'zod';
import { splitCsvLine } from '../india-disclosures.js';
import { type PoliteHttpClient, SourceHttpError } from './http.js';

/**
 * BSE's public-issue data (docs/planning/ipos-plan.md Phase 10).
 *
 * Endpoints found in BSE's own site bundles on 2026-10-02 and verified live:
 *   - `GetPublicIssue_par`            live (`L`) and forthcoming (`F`) issues
 *   - `GetMkt_ISSUE_BBS_IPO?IPO_NO=`  one issue's detail, a flat record
 *   - `Pubissues_BBS_CumultveCatdem_ng?IPO_NO=`  category demand (both exchanges)
 *   - `MoreCompanyN?Fromdt=&flag=1|2&type=2`  new listings, mainboard | SME
 *   - `download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_YYYYMMDD_F_0000.CSV`
 *
 * Two facts shape the parsers: BSE's IPO "scrip code" is a BIDDING code, not
 * the trading code a listed stock gets — so listings are matched by ISIN or
 * the trading code in the listing's own URL; and on a stock's listing day the
 * end-of-day file writes 0 as the previous close, so the issue price comes from
 * the listings list instead (prevClose is null here).
 *
 * The PURE PARSERS are tested against fixtures; every envelope failure throws.
 */

export const BSE_SOURCE_ID = 'bse';
const API = 'https://api.bseindia.com/BseIndiaAPI/api';
const SITE = 'https://www.bseindia.com';
const HEADERS = { Referer: `${SITE}/`, Origin: SITE } as const;

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** `2026-09-30T00:00:00` → `2026-09-30`. */
function isoDay(value: unknown): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(value));
  return match === null ? null : `${match[1]}-${match[2]}-${match[3]}`;
}

/** `30 Sep 2026`, `05th Octomber 2026` (sic) → key. Month by its first three letters. */
export function parseBseDay(text: string): string | null {
  const match = /(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,})[\s-]+(\d{4})/.exec(text);
  if (match === null) return null;
  const month = MONTHS[(match[2] ?? '').slice(0, 3).toLowerCase()];
  const day = Number(match[1]);
  if (month === undefined || day < 1 || day > 31) return null;
  return `${match[3]}-${pad(month)}-${pad(day)}`;
}

/** A naive IST timestamp (`2026-10-01T17:00:00` or `10/1/2026 5:00:00 PM`) → UTC. */
export function parseBseIstTime(value: unknown): Date | null {
  const text = str(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (iso !== null)
    return fromIstParts({
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
      hour: Number(iso[4]),
      minute: Number(iso[5]),
      second: Number(iso[6] ?? 0),
    });
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)/i.exec(
    text,
  );
  if (us === null) return null;
  let hour = Number(us[4]) % 12;
  if (/^p/i.test(us[7] ?? '')) hour += 12;
  return fromIstParts({
    year: Number(us[3]),
    month: Number(us[1]),
    day: Number(us[2]),
    hour,
    minute: Number(us[5]),
    second: Number(us[6] ?? 0),
  });
}

function boardOf(platform: unknown): IpoBoard | null {
  const p = str(platform).toLowerCase();
  if (p === 'mainboard') return 'mainboard';
  if (p === 'sme') return 'sme';
  return null;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

const calendarRowSchema = z
  .object({
    Scrip_cd: z.union([z.number(), z.string()]),
    Scrip_Name: z.string().nullish(),
    Start_Dt: z.string().nullish(),
    End_Dt: z.string().nullish(),
    Price_Band: z.string().nullish(),
    IR_flag: z.string().nullish(),
    Status: z.string().nullish(),
    eXCHANGE_PLATFORM: z.string().nullish(),
    IPO_NO: z.union([z.number(), z.string()]),
  })
  .passthrough();

/** `GetPublicIssue_par` → equity IPOs only (FPOs, rights, buybacks, debt dropped). */
export function parseBseCalendar(payload: unknown, sourceUrl: string): RawIpoListing[] {
  const { Table } = z.object({ Table: z.array(z.unknown()) }).parse(payload);
  const out: RawIpoListing[] = [];
  for (const raw of Table) {
    const parsed = calendarRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    if ((row.IR_flag ?? '').toUpperCase() !== 'IPO') continue;
    const board = boardOf(row.eXCHANGE_PLATFORM);
    const companyName = cleanText(row.Scrip_Name);
    if (board === null || companyName === null) continue;
    const ipoNo = str(row.IPO_NO);
    out.push({
      source: BSE_SOURCE_ID,
      externalKey: `bse:${ipoNo}`,
      symbol: ipoNo,
      series: board === 'sme' ? 'SME' : 'MainBoard',
      sourceUrl,
      companyName,
      board,
      exchange: 'BSE',
      bseScripCode: str(row.Scrip_cd),
      isin: null,
      openDate: isoDay(row.Start_Dt),
      closeDate: isoDay(row.End_Dt),
      listingDate: null,
      priceBand: parsePriceBand(row.Price_Band),
      issuePricePaise: null,
      lotSize: null,
      sharesOffered: null,
      sourceStatus:
        row.Status === 'L' ? 'Live' : row.Status === 'F' ? 'Forthcoming' : (row.Status ?? null),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

const detailSchema = z.object({ IPONO_0: z.array(z.record(z.unknown())).min(1) }).passthrough();

/**
 * BSE writes a party as `Name^address||||||||email|contact person`: `^` ends
 * the name and `|` separates that party's own sub-fields. Several parties (when
 * there are) are separated by `~`. Only the names are kept.
 */
export function bseParties(value: unknown): string[] {
  return str(value)
    .split('~')
    .map((part) => cleanText((part.split('^')[0] ?? '').split('|')[0]))
    .filter((p): p is string => p !== null);
}

const DOCUMENT_FIELDS: readonly {
  readonly field: string;
  readonly kind: IpoDocumentKind;
  readonly title: string;
}[] = [
  { field: 'Prospectus_GID', kind: 'rhp', title: 'Red Herring Prospectus' },
  { field: 'Price_Band_Advertisement', kind: 'price_band_ad', title: 'Price band advertisement' },
  { field: 'Addendum', kind: 'addendum', title: 'Addendum' },
  { field: 'Corrigendum', kind: 'addendum', title: 'Corrigendum' },
  { field: 'Anchor_Details', kind: 'anchor_allocation', title: 'Anchor allocation' },
];

/** The UPI cut-off as BSE writes it: `05th Octomber 2026 (Upto 5.00 Pm)`. */
export function parseBseCutoff(text: string): Date | null {
  const day = parseBseDay(text);
  const time = /(\d{1,2})[.:](\d{2})\s*([ap])\.?\s*m/i.exec(text);
  if (day === null || time === null) return null;
  let hour = Number(time[1]) % 12;
  if (/p/i.test(time[3] ?? '')) hour += 12;
  const [y, m, d] = day.split('-').map(Number);
  return fromIstParts({ year: y ?? 0, month: m ?? 0, day: d ?? 0, hour, minute: Number(time[2]) });
}

export function parseBseDetail(
  payload: unknown,
  context: { key: IpoKey; sourceUrl: string; documentHosts: readonly string[] },
): RawIpoDetail {
  const record = detailSchema.parse(payload).IPONO_0[0] ?? {};
  const field = (name: string) => cleanText(str(record[name]));
  const [openText, closeText] = (field('Issue_Period') ?? '').split(/\s+to\s+/i);
  const documents: RawIpoDocument[] = [];
  for (const doc of DOCUMENT_FIELDS) {
    const url = field(doc.field);
    if (url !== null && /^https?:\/\//.test(url) && isAllowedHost(url, context.documentHosts))
      documents.push({ kind: doc.kind, title: doc.title, url });
  }
  const shares = parseCount(field('Issue_Size_No_of_shares'));
  return {
    source: BSE_SOURCE_ID,
    externalKey: context.key.externalKey,
    sourceUrl: context.sourceUrl,
    companyName: field('ScripName'),
    openDate: parseBseDay(openText ?? ''),
    closeDate: parseBseDay(closeText ?? ''),
    upiCutoffAt: parseBseCutoff(field('Cut_off_time_for_UPI_Mandate_Confirmation') ?? ''),
    issueMethod: null,
    priceBand: parsePriceBand(field('Price_Band')),
    faceValuePaise: parseRupeeAmount(field('Face_Value')),
    lotSize: parseCount(field('Market_Lot')),
    minBidQuantity: parseCount(field('Minimum_Bid_Quantity')),
    retailMaxPaise: null,
    employeeDiscountPaise: null,
    // BSE states only the share count; the size is then priced at the band and marked derived.
    issueSizeText: shares === null ? null : `Public issue of ${shares} equity shares`,
    leadManagers: [
      ...bseParties(record.Book_Running_Lead_Manager),
      ...bseParties(record.Co_Book_Running_Lead_Manager),
    ],
    registrarName: bseParties(record.Registrar)[0] ?? null,
    registrarContact: null,
    marketMaker: bseParties(record.Market_Maker)[0] ?? null,
    sponsorBanks: bseParties(record.Sponsor_Bank),
    documents,
    subscription: null,
  };
}

// ---------------------------------------------------------------------------
// Subscription (cumulative category demand)
// ---------------------------------------------------------------------------

const demandRowSchema = z
  .object({
    SRNo: z.string().nullish(),
    col2: z.string().nullish(),
    col3: z.union([z.string(), z.number()]).nullish(),
    col4: z.union([z.string(), z.number()]).nullish(),
    Maxdt: z.string().nullish(),
  })
  .passthrough();

/**
 * Category demand → headline rows only (`1`, `2`, `2.1`, `3` … and Total;
 * `1(a)` sub-rows are breakdowns). Two shapes exist: the cumulative table
 * (`Table`, bids on both exchanges) and the book-building table (`table1`,
 * BSE's own bids — all the bids there are for a BSE-only SME issue). An empty
 * response (`{}`) is "no figure here", not an error.
 */
export function parseBseDemand(payload: unknown): RawIpoSubscription | null {
  const envelope = z
    .object({ Table: z.array(z.unknown()).nullish(), table1: z.array(z.unknown()).nullish() })
    .passthrough()
    .parse(payload);
  const table = envelope.Table ?? envelope.table1;
  if (table === null || table === undefined) return null;
  const scope = envelope.Table !== null && envelope.Table !== undefined ? 'consolidated' : 'bse';
  const rows: RawSubscriptionRow[] = [];
  let asOf: Date | null = null;
  for (const raw of table) {
    const parsed = demandRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    const label = cleanText(row.col2);
    const srNo = (row.SRNo ?? '').trim();
    if (label === null || srNo === 'Sr.No.') continue;
    asOf ??= parseBseIstTime(row.Maxdt);
    const total = /^total$/i.test(label);
    if (!total && !/^\d+(?:\.\d+)?$/.test(srNo)) continue;
    rows.push({
      category: classifySubscriptionLabel(label),
      label,
      sharesOffered: parseCount(str(row.col3)),
      sharesBid: parseCount(str(row.col4)),
    });
  }
  if (rows.length === 0 || rows.every((r) => r.sharesBid === null || r.sharesBid === 0))
    return null;
  return { source: BSE_SOURCE_ID, scope, asOf, rows };
}

// ---------------------------------------------------------------------------
// New listings and the end-of-day file
// ---------------------------------------------------------------------------

const listingRowSchema = z
  .object({
    CompanyName: z.string(),
    Company_Short_Name: z.string().nullish(),
    IssuePrice: z.union([z.number(), z.string()]).nullish(),
    ListedOn: z.string(),
    IMAGE: z.string().nullish(),
  })
  .passthrough();

/** `…/stock-share-price/roopa-screen-ltd/roopa/544954/` → ticker `ROOPA`, code `544954`. */
export function tickerAndCode(url: string | null | undefined): {
  ticker: string | null;
  code: string | null;
} {
  const match = /stock-share-price\/[^/]+\/([^/]+)\/(\d+)\/?$/.exec(url ?? '');
  return match === null
    ? { ticker: null, code: null }
    : { ticker: (match[1] ?? '').toUpperCase(), code: match[2] ?? null };
}

/** `MoreCompanyN` (mainboard `flag=1`, SME `flag=2`) → new listings with the issue price. */
export function parseBseListings(payload: unknown, board: IpoBoard): RawRecentListing[] {
  const { Table } = z.object({ Table: z.array(z.unknown()) }).parse(payload);
  const out: RawRecentListing[] = [];
  for (const raw of Table) {
    const parsed = listingRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    const listingDate = isoDay(row.ListedOn);
    const { ticker, code } = tickerAndCode(row.IMAGE);
    if (listingDate === null || code === null) continue;
    const price =
      row.IssuePrice === null || row.IssuePrice === undefined
        ? null
        : rupeeTextToPaise(str(row.IssuePrice));
    out.push({
      source: BSE_SOURCE_ID,
      symbol: code,
      series: board === 'sme' ? 'SME' : 'MainBoard',
      isin: null,
      ticker: cleanText(row.Company_Short_Name)?.toUpperCase() ?? ticker,
      companyName: cleanText(row.CompanyName) ?? code,
      listingDate,
      issuePricePaise: price !== null && price > 0 ? price : null,
    });
  }
  return out;
}

/**
 * BSE's end-of-day file → equity rows keyed by trading code (`symbol`) and
 * ISIN. A previous close of 0 (a stock's first day) becomes null.
 */
export function parseBseBhavcopy(csv: string, sourceUrl: string): RawListingDay[] {
  const lines = csv.split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? '').map((h) => h.trim());
  if (
    !header.includes('FinInstrmId') ||
    !header.includes('OpnPric') ||
    !header.includes('PrvsClsgPric')
  )
    throw new Error('BSE bhavcopy header is not the expected layout');
  const col = (cells: string[], name: string) => (cells[header.indexOf(name)] ?? '').trim();
  const out: RawListingDay[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue;
    const cells = splitCsvLine(line);
    if (col(cells, 'FinInstrmTp') !== 'STK') continue;
    const tradingDate = isoDay(col(cells, 'TradDt'));
    const [open, high, low, close, prev] = [
      'OpnPric',
      'HghPric',
      'LwPric',
      'ClsPric',
      'PrvsClsgPric',
    ].map((n) => rupeeTextToPaise(col(cells, n)));
    const volume = parseCount(col(cells, 'TtlTradgVol'));
    if (
      tradingDate === null ||
      volume === null ||
      open === null ||
      open === undefined ||
      high === null ||
      high === undefined ||
      low === null ||
      low === undefined ||
      close === null ||
      close === undefined ||
      open <= 0 ||
      low <= 0 ||
      high < low
    )
      continue;
    const isin = col(cells, 'ISIN').toUpperCase();
    out.push({
      source: BSE_SOURCE_ID,
      exchange: 'BSE',
      symbol: col(cells, 'FinInstrmId'),
      series: col(cells, 'SctySrs'),
      tradingDate,
      prevClosePaise: prev === null || prev === undefined || prev <= 0 ? null : prev,
      isin: /^IN[A-Z0-9]{10}$/.test(isin) ? isin : null,
      openPaise: open,
      highPaise: high,
      lowPaise: low,
      closePaise: close,
      volume,
      sourceUrl,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The live source
// ---------------------------------------------------------------------------

const compact = (dateKey: string) => dateKey.replace(/-/g, '');

function minusDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - days)).toISOString().slice(0, 10);
}

export interface BseIpoSourceOptions {
  readonly client: PoliteHttpClient;
  readonly documentHosts: readonly string[];
  /** "Today" as an IST key, for the new-listings window. */
  readonly today: () => string;
}

export function createBseIpoSource({
  client,
  documentHosts,
  today,
}: BseIpoSourceOptions): IpoSource {
  const api = (path: string) => client.getJson(`${API}${path}`, { headers: HEADERS });
  return {
    id: BSE_SOURCE_ID,
    fetchCalendar: async () =>
      parseBseCalendar(await api('/GetPublicIssue_par/w'), `${API}/GetPublicIssue_par/w`),
    // BSE publishes no past-issue list; closed issues keep what was collected while live.
    fetchPastIssues: async () => [],
    fetchDetail: async (key) => {
      const path = `/GetMkt_ISSUE_BBS_IPO/w?IPO_NO=${encodeURIComponent(key.symbol)}`;
      return parseBseDetail(await api(path), { key, sourceUrl: `${API}${path}`, documentHosts });
    },
    fetchSubscription: async (key) => {
      const ipoNo = encodeURIComponent(key.symbol);
      // Cumulative (both exchanges) first; SME issues answer `{}` there and are
      // read from the book-building table instead, as BSE's own page does.
      return (
        parseBseDemand(await api(`/Pubissues_BBS_CumultveCatdem_ng/w?IPO_NO=${ipoNo}`)) ??
        parseBseDemand(await api(`/Pubissues_GetBkbldgCatdem_PAR_ng/w?IPO_NO=${ipoNo}`))
      );
    },
    fetchListingDay: async (dateKey) => {
      const url = `${SITE}/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${compact(dateKey)}_F_0000.CSV`;
      try {
        return parseBseBhavcopy(
          await client.getText(url, { accept: 'text/csv,*/*', headers: HEADERS }),
          url,
        );
      } catch (error) {
        if (error instanceof SourceHttpError && error.status === 404) return [];
        throw error;
      }
    },
    fetchRecentListings: async () => {
      const from = compact(minusDays(today(), 10));
      const main = parseBseListings(
        await api(`/MoreCompanyN/w?Fromdt=${from}&company=&flag=1&type=2`),
        'mainboard',
      );
      const sme = parseBseListings(
        await api(`/MoreCompanyN/w?Fromdt=${from}&company=&flag=2&type=2`),
        'sme',
      );
      return [...main, ...sme];
    },
  };
}
