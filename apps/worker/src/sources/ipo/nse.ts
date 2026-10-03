import {
  classifySubscriptionLabel,
  cleanText,
  isAllowedHost,
  parseCount,
  parseDdMonYyyy,
  parseIstDayTime,
  parsePriceBand,
  parseRupeeAmount,
  parseShareQuantity,
  rupeeTextToPaise,
  stripHtml,
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
 * NSE's public IPO data (docs/planning/ipos-plan.md §3.1–3.3).
 *
 * The PURE PARSERS below are tested against fixtures captured 2026-10-02
 * (`__fixtures__/`); the transport at the bottom only fetches and hands the
 * bytes to them. Every parser validates with Zod and fails the whole response
 * when its ENVELOPE is wrong (a shape change must be loud), while a single
 * malformed row is skipped.
 */

export const NSE_SOURCE_ID = 'nse';
const NSE = 'https://www.nseindia.com';
const NSE_ARCHIVE = 'https://nsearchives.nseindia.com';
/** The page whose visit hands out the session cookie the JSON API checks. */
export const NSE_WARMUP_URL = `${NSE}/market-data/all-upcoming-issues-ipo`;

export type SeriesBoard = (series: string) => IpoBoard | null;

const text = z.union([z.string(), z.number()]).nullish();
const str = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v);

function keyFor(symbol: string, series: string, openDate: string | null): string {
  return `nse:${symbol}:${series}:${openDate ?? 'tba'}`;
}

/** Detail lookups use `EQ` for every mainboard series and `SME` for SME. */
export function detailSeries(board: IpoBoard): string {
  return board === 'sme' ? 'SME' : 'EQ';
}

// ---------------------------------------------------------------------------
// Issue lists: current, upcoming, past
// ---------------------------------------------------------------------------

const listRowSchema = z
  .object({
    symbol: z.string().min(1),
    companyName: z.string().nullish(),
    company: z.string().nullish(),
    series: z.string().nullish(),
    securityType: z.string().nullish(),
    issueStartDate: z.string().nullish(),
    issueEndDate: z.string().nullish(),
    ipoStartDate: z.string().nullish(),
    ipoEndDate: z.string().nullish(),
    listingDate: z.string().nullish(),
    issuePrice: text,
    priceRange: z.string().nullish(),
    priceBand: z.string().nullish(),
    issueSize: text,
    lotSize: text,
    status: z.string().nullish(),
  })
  .passthrough();

/**
 * NSE writes some outcomes into the company name of a past-issue row:
 * `…Limited-Issue Withdrawn`, `…Limited-Issue postponed`. A
 * `- Withdrawal Window` / `-Special Withdrawal Option` row is not an issue at
 * all: it is a window for bidders to withdraw from an existing one (after a
 * revision), under its own symbol or dates. Observed 2026-10-03.
 */
const NAME_STATUS = /\s*-\s*(issue\s+(?:withdrawn|postponed|deferred|cancell?ed))\s*$/i;
const WITHDRAWAL_WINDOW = /-\s*(?:special\s+)?withdrawal\s+(?:window|option)\s*$/i;
/**
 * Not initial public offers, though NSE's past list carries them: follow-on
 * offers (`Vodafone Idea Limited - FPO`, symbol `IDEAFPO`) and the numbered
 * partly-paid line of a listed company's rights issue (`ADANIENPP1`, listed
 * three times over). A bare `PP` suffix is NOT a sign: real IPOs bid under
 * `CLOUDPP` (Varanium Cloud) and `SILGOPP` (Silgo Retail). Observed 2026-10-03.
 */
const FOLLOW_ON = /-\s*FPO\s*$/i;
const NOT_AN_IPO_SYMBOL = /(?:FPO|PP\d+)$/;

/** True for a past-list row that is not an IPO (an FPO or a partly-paid line). */
export function isNotAnIpo(name: string, symbol: string): boolean {
  return FOLLOW_ON.test(name) || NOT_AN_IPO_SYMBOL.test(symbol.trim().toUpperCase());
}

/** The name without NSE's status suffix, and the status it stated (if any). */
export function splitNameStatus(name: string): {
  readonly name: string;
  readonly status: string | null;
} {
  const match = NAME_STATUS.exec(name);
  if (match === null) return { name, status: null };
  return { name: name.slice(0, match.index).trim(), status: match[1] ?? null };
}

/**
 * Parses `ipo-current-issue`, `all-upcoming-issues` and `public-past-issues`
 * rows into listings. Non-equity series (debt, InvITs, REITs, …) are dropped,
 * and so are withdrawal-window rows, FPOs and partly-paid lines (not IPOs).
 *
 * Field meanings differ by list, all observed on 2026-10-02:
 *   - current/upcoming: `issuePrice` is the band text; `issueSize` is a SHARE
 *     count; SME rows may carry `lotSize`.
 *   - past: `priceRange` is the band; `issuePrice` is the final price, padded
 *     (`"   405"`), or `-`/null before it is fixed; `listingDate` is `-` until listing.
 */
export function parseNseIssueList(
  payload: unknown,
  sourceUrl: string,
  boardOf: SeriesBoard,
): RawIpoListing[] {
  const rows = z.array(z.unknown()).parse(payload);
  const out: RawIpoListing[] = [];
  for (const raw of rows) {
    const parsed = listRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    const series = (row.series ?? row.securityType ?? '').trim().toUpperCase();
    const board = boardOf(series);
    if (board === null) continue;
    const rawName = cleanText(row.companyName ?? row.company);
    if (rawName === null || WITHDRAWAL_WINDOW.test(rawName) || isNotAnIpo(rawName, row.symbol))
      continue;
    const { name: companyName, status: nameStatus } = splitNameStatus(rawName);
    const isPast = row.ipoStartDate !== undefined || row.securityType !== undefined;
    const openDate = parseDdMonYyyy(row.issueStartDate ?? row.ipoStartDate ?? '');
    const closeDate = parseDdMonYyyy(row.issueEndDate ?? row.ipoEndDate ?? '');
    const bandText = isPast
      ? row.priceRange
      : (row.priceBand ?? (typeof row.issuePrice === 'string' ? row.issuePrice : null));
    const finalPrice = isPast ? parseRupeeAmount(str(row.issuePrice)) : null;
    const symbol = row.symbol.trim().toUpperCase();
    out.push({
      source: NSE_SOURCE_ID,
      externalKey: keyFor(symbol, series, openDate),
      symbol,
      series,
      sourceUrl,
      companyName,
      board,
      exchange: 'NSE',
      bseScripCode: null,
      isin: null,
      openDate,
      closeDate,
      listingDate: parseDdMonYyyy(row.listingDate ?? ''),
      priceBand: parsePriceBand(bandText),
      issuePricePaise: finalPrice !== null && finalPrice > 0 ? finalPrice : null,
      lotSize: parseCount(str(row.lotSize)),
      sharesOffered: isPast ? null : parseCount(str(row.issueSize)),
      sourceStatus: cleanText(row.status) ?? nameStatus,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Issue detail
// ---------------------------------------------------------------------------

const bidRowSchema = z
  .object({
    category: z.string().nullish(),
    srNo: z.string().nullish(),
    noOfSharesOffered: text,
    noOfShareOffered: text,
    noOfsharesBid: text,
    noOfSharesBid: text,
    // SME detail rows spell it this way (and carry no shares-offered column).
    noOfshareBid: text,
  })
  .passthrough();

const detailSchema = z
  .object({
    issueInfo: z.object({
      dataList: z.array(
        z.object({ title: z.string().nullish(), value: z.string().nullish() }).passthrough(),
      ),
    }),
    bidDetails: z.array(z.unknown()).nullish(),
    demandDataNSE: z.array(z.object({ timestamp: z.string().nullish() }).passthrough()).nullish(),
    /** NSE's own platform; its timestamp outlives `demandDataNSE` on closed issues. */
    demandGraph: z.object({ timestamp: z.string().nullish() }).passthrough().nullish(),
    /** The whole book, every platform: shares in the issue and shares bid. */
    demandGraphALL: z
      .object({
        totalIssueSize: text,
        totalBidRecieved: text,
        timestamp: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

/** Only the headline rows: `1`, `2`, `2.1`, `2.2`, `3` … and Total. Sub-rows `1(a)` are breakdowns. */
function isHeadlineRow(srNo: string | null | undefined, category: string): boolean {
  if (/^total$/i.test(category.trim())) return true;
  return srNo !== null && srNo !== undefined && /^\d+(?:\.\d+)?$/.test(srNo.trim());
}

export function parseSubscriptionRows(rows: readonly unknown[]): RawSubscriptionRow[] {
  const out: RawSubscriptionRow[] = [];
  for (const raw of rows) {
    const parsed = bidRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    const label = cleanText(row.category);
    // The active-category list repeats its column headings as row 0.
    if (label === null || row.srNo === 'Sr.No.' || !isHeadlineRow(row.srNo, label)) continue;
    out.push({
      category: classifySubscriptionLabel(label),
      label,
      sharesOffered: parseCount(str(row.noOfSharesOffered ?? row.noOfShareOffered)),
      sharesBid: parseCount(str(row.noOfsharesBid ?? row.noOfSharesBid ?? row.noOfshareBid)),
    });
  }
  return out;
}

type DetailPayload = z.infer<typeof detailSchema>;

/**
 * The bids on a detail payload. Two layouts, both observed 2026-10-02 and
 * again on issues back to 2024 (2026-10-03):
 *
 *   - mainboard: rows state shares offered per category; the figures are
 *     NSE's own platform (`nse` scope), timed by `demandDataNSE` while bidding
 *     runs and by `demandGraph` once that list is emptied (closed issues).
 *   - SME: rows carry no shares-offered column. They are the whole book (they
 *     can exceed `demandGraphALL`'s graph total, which counts valid bids at a
 *     price point), so the scope is consolidated; the only denominator NSE
 *     states is the issue size in `demandGraphALL`, which goes on the Total
 *     row, timed by that graph. Categories keep "—": NSE does not publish an
 *     SME issue's shares reserved per category.
 *
 * NSE's category endpoint is no substitute for SME: it reports 0 offered for
 * every category and leaves the individual-investor row out entirely.
 */
function detailSubscription(detail: DetailPayload): RawIpoSubscription | null {
  const bids = parseSubscriptionRows(detail.bidDetails ?? []);
  // Before bidding opens NSE sends a zero Total: no bids yet, not "0×".
  if (bids.length === 0 || bids.every((b) => b.sharesBid === null || b.sharesBid === 0))
    return null;
  const live = detail.demandDataNSE?.[0]?.timestamp ?? null;
  if (bids.every((b) => b.sharesOffered === null)) {
    const whole = detail.demandGraphALL ?? null;
    const issueSize = parseCount(str(whole?.totalIssueSize));
    return {
      source: NSE_SOURCE_ID,
      scope: 'consolidated',
      asOf: parseIstDayTime(whole?.timestamp ?? live ?? ''),
      rows: bids.map((b) =>
        b.category === 'total'
          ? { ...b, sharesOffered: issueSize !== null && issueSize > 0 ? issueSize : null }
          : b,
      ),
    };
  }
  const stamp = live ?? detail.demandGraph?.timestamp ?? null;
  return {
    source: NSE_SOURCE_ID,
    scope: 'nse',
    asOf: stamp === null ? null : parseIstDayTime(stamp),
    rows: bids,
  };
}

/** `Axis Bank Limited and HDFC Bank Limited` → two names; split only after a legal form. */
export function splitParties(value: string | null): string[] {
  const cleaned = cleanText(value === null ? null : stripHtml(value));
  if (cleaned === null) return [];
  const parts = cleaned
    .split(/(?<=\b(?:Limited|Ltd\.?|LLP|Private Limited|Pvt\.? Ltd\.?))\s*(?:,|;|\band\b|&)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  return parts.length > 0 ? parts : [cleaned];
}

const DOCUMENT_TITLES: readonly { readonly match: RegExp; readonly kind: IpoDocumentKind }[] = [
  { match: /^draft red herring prospectus/i, kind: 'drhp' },
  { match: /^red herring prospectus/i, kind: 'rhp' },
  { match: /^prospectus/i, kind: 'prospectus' },
  { match: /addendum|corrigendum/i, kind: 'addendum' },
  { match: /basis of allotment/i, kind: 'basis_of_allotment' },
  { match: /anchor allocation/i, kind: 'anchor_allocation' },
  { match: /ratios|basis of issue price/i, kind: 'price_band_ad' },
];

function urlsIn(value: string): string[] {
  return [...value.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0]);
}

/** `05-Oct-2026 (upto 5:00 PM) The cut-off …` → that instant, UTC. */
export function parseUpiCutoff(value: string | null): Date | null {
  if (value === null) return null;
  const day = /(\d{1,2}-[A-Za-z]{3,4}-\d{4})/.exec(value);
  const time = /(\d{1,2})[:.](\d{2})\s*([AP]\.?M\.?)/i.exec(value);
  const key = parseDdMonYyyy(day?.[1] ?? '');
  if (key === null || time === null) return null;
  let hour = Number(time[1]) % 12;
  if (/^p/i.test(time[3] ?? '')) hour += 12;
  const [y, m, d] = key.split('-').map(Number);
  return fromIstParts({ year: y ?? 0, month: m ?? 0, day: d ?? 0, hour, minute: Number(time[2]) });
}

export interface DetailContext {
  readonly key: IpoKey;
  readonly sourceUrl: string;
  readonly documentHosts: readonly string[];
}

/**
 * Parses `ipo-detail`. Facts are read BY TITLE from `issueInfo.dataList`
 * (positions differ between mainboard and SME); unknown titles are ignored.
 * Values may be wrapped in quotes or carry HTML — they are cleaned to text,
 * and links are kept only on allowlisted hosts.
 */
export function parseNseDetail(payload: unknown, context: DetailContext): RawIpoDetail {
  const detail = detailSchema.parse(payload);
  const facts = new Map<string, string>();
  let companyName: string | null = null;
  const documents: RawIpoDocument[] = [];
  for (const { title, value } of detail.issueInfo.dataList) {
    const t = cleanText(title);
    if (t === null) continue;
    const v = value ?? '';
    if (v.trim() === '' && companyName === null && facts.size === 0) {
      // A value-less title before any fact is the company's name.
      companyName = t;
      continue;
    }
    if (!facts.has(t)) facts.set(t, v);
    const doc = DOCUMENT_TITLES.find((d) => d.match.test(t));
    if (doc !== undefined)
      for (const url of urlsIn(v))
        if (isAllowedHost(url, context.documentHosts))
          documents.push({ kind: doc.kind, title: t, url });
  }
  const fact = (...titles: string[]): string | null => {
    for (const title of titles) {
      for (const [k, v] of facts)
        if (k.toLowerCase() === title.toLowerCase()) return cleanText(stripHtml(v));
    }
    return null;
  };

  const period = fact('Issue Period');
  const [openText, closeText] = (period ?? '').split(/\s+to\s+/i);
  const method = fact('Issue Type');

  return {
    source: NSE_SOURCE_ID,
    externalKey: context.key.externalKey,
    sourceUrl: context.sourceUrl,
    companyName,
    openDate: parseDdMonYyyy(openText ?? ''),
    closeDate: parseDdMonYyyy(closeText ?? ''),
    upiCutoffAt: parseUpiCutoff(fact('Cut-off time for UPI Mandate Confirmation')),
    issueMethod:
      method === null
        ? null
        : /book/i.test(method)
          ? 'book_building'
          : /fixed/i.test(method)
            ? 'fixed_price'
            : null,
    priceBand: parsePriceBand(fact('Price Range', 'Price Band', 'Issue Price')),
    faceValuePaise: parseRupeeAmount(fact('Face Value')),
    lotSize: parseShareQuantity(fact('Bid Lot', 'Lot Size', 'Market Lot')),
    minBidQuantity: parseShareQuantity(fact('Minimum Order Quantity', 'Minimum Bid Quantity')),
    retailMaxPaise: parseRupeeAmount(fact('Maximum Subscription Amount for Retail Investor')),
    employeeDiscountPaise: parseRupeeAmount(fact('Discount')),
    issueSizeText: fact('Issue Size'),
    leadManagers: splitParties(fact('Book Running Lead Managers', 'Lead Managers', 'Lead Manager')),
    registrarName: fact('Name of the Registrar', 'Registrar'),
    registrarContact: fact('Contact person name number and Email id'),
    marketMaker: fact('Market Maker'),
    sponsorBanks: splitParties(fact('Sponsor Bank', 'Sponsor Banks')),
    documents,
    subscription: detailSubscription(detail),
  };
}

// ---------------------------------------------------------------------------
// Consolidated subscription (`ipo-active-category`)
// ---------------------------------------------------------------------------

const activeCategorySchema = z
  .object({ dataList: z.array(z.unknown()), updateTime: z.string().nullish() })
  .passthrough();

/** The consolidated NSE+BSE bid figure (≈ the detail's `demandGraphALL`). */
export function parseNseActiveCategory(payload: unknown): RawIpoSubscription | null {
  const parsed = activeCategorySchema.parse(payload);
  const rows = parseSubscriptionRows(parsed.dataList);
  if (rows.length === 0 || rows.every((r) => r.sharesBid === null || r.sharesBid === 0))
    return null;
  return {
    source: NSE_SOURCE_ID,
    scope: 'consolidated',
    asOf: parseIstDayTime(parsed.updateTime ?? ''),
    rows,
  };
}

// ---------------------------------------------------------------------------
// Bhavcopy — listing-day prices
// ---------------------------------------------------------------------------

/** Every equity row of `sec_bhavdata_full_DDMMYYYY.csv` (SME series included). */
export function parseNseBhavcopyPrices(
  csv: string,
  sourceUrl: string,
  boardOf: SeriesBoard,
): RawListingDay[] {
  const lines = csv.split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? '').map((h) => h.trim());
  if (
    !header.includes('SYMBOL') ||
    !header.includes('PREV_CLOSE') ||
    !header.includes('OPEN_PRICE')
  )
    throw new Error('bhavcopy header is not the expected sec_bhavdata_full layout');
  const out: RawListingDay[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue;
    const cells = splitCsvLine(line).map((c) => c.trim());
    const cell = (name: string) => cells[header.indexOf(name)] ?? '';
    const series = cell('SERIES').toUpperCase();
    if (boardOf(series) === null) continue;
    const tradingDate = parseDdMonYyyy(cell('DATE1'));
    const prices = ['PREV_CLOSE', 'OPEN_PRICE', 'HIGH_PRICE', 'LOW_PRICE', 'CLOSE_PRICE'].map((n) =>
      rupeeTextToPaise(cell(n)),
    );
    const volume = parseCount(cell('TTL_TRD_QNTY'));
    const [prev, open, high, low, close] = prices;
    if (
      tradingDate === null ||
      volume === null ||
      prev === undefined ||
      open === undefined ||
      high === undefined ||
      low === undefined ||
      close === undefined ||
      prev === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      prev <= 0 ||
      open <= 0 ||
      low <= 0 ||
      high < low
    )
      continue;
    out.push({
      source: NSE_SOURCE_ID,
      exchange: 'NSE',
      symbol: cell('SYMBOL').toUpperCase(),
      series,
      tradingDate,
      prevClosePaise: prev,
      isin: null,
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
// Recent listings (ISINs)
// ---------------------------------------------------------------------------

const recentSchema = z.object({
  data: z.array(
    z
      .object({
        symbol: z.string(),
        series: z.string().nullish(),
        isin: z.string().nullish(),
        name: z.string().nullish(),
        listing_date: z.string().nullish(),
      })
      .passthrough(),
  ),
});

export function parseNseRecentListings(payload: unknown, boardOf: SeriesBoard): RawRecentListing[] {
  const { data } = recentSchema.parse(payload);
  const out: RawRecentListing[] = [];
  for (const row of data) {
    const series = (row.series ?? '').trim().toUpperCase();
    const listingDate = parseDdMonYyyy(row.listing_date ?? '');
    const isin = (row.isin ?? '').trim().toUpperCase();
    if (boardOf(series) === null || listingDate === null) continue;
    out.push({
      source: NSE_SOURCE_ID,
      symbol: row.symbol.trim().toUpperCase(),
      series,
      isin: /^IN[A-Z0-9]{10}$/.test(isin) ? isin : null,
      ticker: row.symbol.trim().toUpperCase(),
      companyName: cleanText(row.name) ?? row.symbol,
      listingDate,
      issuePricePaise: null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The live source
// ---------------------------------------------------------------------------

/** `2026-10-01` → `01102026`, the archive file-name form. */
export function ddmmyyyy(dateKey: string): string {
  return `${dateKey.slice(8, 10)}${dateKey.slice(5, 7)}${dateKey.slice(0, 4)}`;
}

export interface NseIpoSourceOptions {
  readonly client: PoliteHttpClient;
  readonly boardOf: SeriesBoard;
  readonly documentHosts: readonly string[];
}

/**
 * NSE as an `IpoSource`. The JSON API checks a session cookie handed out by
 * the site's own pages, so the first API call of a run visits the IPO page;
 * a 401/403 later re-visits it once and retries.
 */
export function createNseIpoSource({
  client,
  boardOf,
  documentHosts,
}: NseIpoSourceOptions): IpoSource {
  let warmed = false;
  const warm = async () => {
    await client.getText(NSE_WARMUP_URL, { accept: 'text/html,application/xhtml+xml' });
    warmed = true;
  };
  const api = async (path: string): Promise<unknown> => {
    if (!warmed) await warm();
    const url = `${NSE}${path}`;
    try {
      return await client.getJson(url, { referer: NSE_WARMUP_URL });
    } catch (error) {
      if (!(error instanceof SourceHttpError) || (error.status !== 401 && error.status !== 403))
        throw error;
      await warm();
      return client.getJson(url, { referer: NSE_WARMUP_URL });
    }
  };
  const fetchDetail = async (key: IpoKey): Promise<RawIpoDetail> => {
    const board = boardOf(key.series) ?? 'mainboard';
    const path = `/api/ipo-detail?symbol=${encodeURIComponent(key.symbol)}&series=${detailSeries(board)}`;
    return parseNseDetail(await api(path), { key, sourceUrl: `${NSE}${path}`, documentHosts });
  };

  return {
    id: NSE_SOURCE_ID,

    fetchCalendar: async () => {
      const currentUrl = `${NSE}/api/ipo-current-issue`;
      const upcomingUrl = `${NSE}/api/all-upcoming-issues?category=ipo`;
      const current = parseNseIssueList(await api('/api/ipo-current-issue'), currentUrl, boardOf);
      const upcoming = parseNseIssueList(
        await api('/api/all-upcoming-issues?category=ipo'),
        upcomingUrl,
        boardOf,
      );
      // The upcoming list carries SME lot sizes the current list lacks; merge by key.
      const byKey = new Map<string, RawIpoListing>();
      for (const row of [...upcoming, ...current]) {
        const prior = byKey.get(row.externalKey);
        byKey.set(
          row.externalKey,
          prior === undefined ? row : { ...prior, ...row, lotSize: row.lotSize ?? prior.lotSize },
        );
      }
      return [...byKey.values()];
    },

    fetchPastIssues: async () =>
      parseNseIssueList(
        await api('/api/public-past-issues'),
        `${NSE}/api/public-past-issues`,
        boardOf,
      ),

    fetchDetail,

    fetchSubscription: async (key) => {
      // SME: the category endpoint omits the individual investors and every
      // shares-offered figure; the detail payload carries the whole book.
      if (boardOf(key.series) === 'sme') return (await fetchDetail(key)).subscription;
      return parseNseActiveCategory(
        await api(`/api/ipo-active-category?symbol=${encodeURIComponent(key.symbol)}`),
      );
    },

    fetchListingDay: async (dateKey) => {
      const url = `${NSE_ARCHIVE}/products/content/sec_bhavdata_full_${ddmmyyyy(dateKey)}.csv`;
      try {
        return parseNseBhavcopyPrices(
          await client.getText(url, { accept: 'text/csv,text/plain,*/*', referer: `${NSE}/` }),
          url,
          boardOf,
        );
      } catch (error) {
        // No file for a holiday or a session not yet published: nothing listed.
        if (error instanceof SourceHttpError && error.status === 404) return [];
        throw error;
      }
    },

    fetchRecentListings: async () =>
      parseNseRecentListings(await api('/api/new-listing-today?index=RecentListing'), boardOf),
  };
}
