import type {
  DisclosureSource,
  OiBucket,
  OiParticipant,
  RawAnnouncement,
  RawDeal,
  RawDeliveryStat,
  RawFiiDiiFlow,
  RawParticipantOi,
  RawShareholding,
} from '@equitywise/market-data';
import { fromIstParts, rupeesToPaise } from '@equitywise/shared';
import { z } from 'zod';

/**
 * India exchange disclosure source (BSE + NSE public feeds).
 *
 * Public access does not establish storage or redistribution permission.
 * See docs/planning/announcement-interpretation-sources.md. The PURE PARSERS
 * below are the tested part; every transport THROWS on failure so the worker
 * records it against the feed's health. The scheduler isolates unrelated jobs.
 *
 * Transports, by feed (verified reachable with a plain GET on 2026-09-17):
 *   - Announcements: BSE `AnnGetData` JSON (cookie/referer gated; may need
 *     adjusting on the VPS when BSE changes its handshake).
 *   - FII/DII cash: NSE `fiidiiTradeReact` JSON.
 *   - Bulk/block deals, delivery (full bhavdata), participant-wise OI: NSE's
 *     static daily archive CSVs on `nsearchives.nseindia.com` — plain files,
 *     no session dance, published once per session after the close.
 *   - Shareholding: NSE `corporate-share-holdings-master` JSON per symbol
 *     (promoter and public % only — the exchange's summary has no FII/DII
 *     split, so those stay null rather than be guessed).
 */

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    headers: { ...BROWSER_HEADERS, ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
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

/** `11-Sep-2026` → `2026-09-11`. Returns null when unparseable. */
export function parseDdMonYyyy(value: string): string | null {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim());
  if (match === null) return null;
  const day = Number(match[1]);
  const month = MONTHS[(match[2] ?? '').toLowerCase()];
  const year = Number(match[3]);
  if (month === undefined) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** An IST wall-clock timestamp string → a UTC `Date`. Tolerant of formats. */
export function parseIstTimestamp(value: string): Date | null {
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(
      value.trim(),
    );
  if (iso === null) return null;
  const year = Number(iso[1]),
    month = Number(iso[2]),
    day = Number(iso[3]);
  const hour = Number(iso[4]),
    minute = Number(iso[5]),
    second = Number(iso[6] ?? 0);
  if (
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return null;
  if (iso[8] !== undefined) {
    const parsed = new Date(value.trim().replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return new Date(
    fromIstParts({ year, month, day, hour, minute, second }).getTime() +
      Number((iso[7] ?? '').padEnd(3, '0')),
  );
}

/** ₹ crore (as reported) → integer paise. */
export function croreToPaise(crore: number): number {
  return rupeesToPaise(crore * 10_000_000);
}

// ---------------------------------------------------------------------------
// BSE corporate announcements
// ---------------------------------------------------------------------------

const bseAnnouncementSchema = z.object({
  NEWSID: z.union([z.string(), z.number()]),
  SCRIP_CD: z.union([z.string(), z.number()]).optional(),
  slongname: z.string().optional(),
  SLONGNAME: z.string().optional(),
  NEWSSUB: z.string().optional(),
  HEADLINE: z.string().optional(),
  CATEGORYNAME: z.string().optional(),
  NEWS_DT: z.string().optional(),
  DT_TM: z.string().optional(),
  ATTACHMENTNAME: z.string().optional(),
  NSURL: z.string().optional(),
});

const bseAnnouncementsEnvelope = z.object({ Table: z.array(z.unknown()).optional() });

/** Parses a BSE `AnnGetData` response into provider-neutral announcements. */
export function parseBseAnnouncements(payload: unknown): RawAnnouncement[] {
  const envelope = bseAnnouncementsEnvelope.safeParse(payload);
  const rows = envelope.success ? (envelope.data.Table ?? []) : [];
  const out: RawAnnouncement[] = [];

  for (const raw of rows) {
    const parsed = bseAnnouncementSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    const headline = (row.HEADLINE ?? row.NEWSSUB ?? '').trim();
    if (headline === '') continue;

    const announcedAt = parseIstTimestamp(row.NEWS_DT ?? row.DT_TM ?? '');
    if (announcedAt === null) continue;
    const attachment = row.ATTACHMENTNAME?.trim();
    out.push({
      source: 'bse',
      externalId: String(row.NEWSID),
      symbol: String(row.SCRIP_CD ?? '').trim(),
      companyName: (row.SLONGNAME ?? row.slongname ?? '').trim(),
      category: row.CATEGORYNAME?.trim() || null,
      headline,
      detail: row.NEWSSUB?.trim() || null,
      attachmentUrl:
        attachment !== undefined && attachment !== ''
          ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${attachment}`
          : (row.NSURL ?? null),
      announcedAt,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// NSE FII/DII cash flows
// ---------------------------------------------------------------------------

const nseFiiDiiSchema = z.object({
  category: z.string(),
  date: z.string(),
  buyValue: z.union([z.string(), z.number()]),
  sellValue: z.union([z.string(), z.number()]),
  netValue: z.union([z.string(), z.number()]),
});

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value.replace(/,/g, ''));
}

/** Parses NSE's `fiidiiTradeReact` response (values in ₹ crore) into paise flows. */
export function parseNseFiiDii(payload: unknown): RawFiiDiiFlow[] {
  const rows = z.array(z.unknown()).safeParse(payload);
  if (!rows.success) return [];
  const out: RawFiiDiiFlow[] = [];

  for (const raw of rows.data) {
    const parsed = nseFiiDiiSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    const tradingDate = parseDdMonYyyy(row.date);
    if (tradingDate === null) continue;
    const participant = /^fii|fpi/i.test(row.category) ? 'fii' : 'dii';

    out.push({
      source: 'nse',
      tradingDate,
      participant,
      segment: 'cash',
      buyPaise: croreToPaise(toNumber(row.buyValue)),
      sellPaise: croreToPaise(toNumber(row.sellValue)),
      netPaise: croreToPaise(toNumber(row.netValue)),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Splits one CSV line, honouring double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char ?? '';
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Parses a header-led CSV into trimmed records keyed by trimmed header.
 *
 * NSE pads some headers with spaces (`Future Stock Short       `) and every
 * bhavdata cell with a leading space, so trimming both is the difference
 * between a working parser and one that finds no columns.
 */
function csvRecords(csv: string, headerLine = 0): Record<string, string>[] {
  const lines = csv.split(/\r?\n/);
  const header = splitCsvLine(lines[headerLine] ?? '').map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let n = headerLine + 1; n < lines.length; n += 1) {
    const line = lines[n] ?? '';
    if (line.trim() === '') continue;
    const cells = splitCsvLine(line);
    const record: Record<string, string> = {};
    header.forEach((name, i) => {
      record[name] = (cells[i] ?? '').trim();
    });
    out.push(record);
  }
  return out;
}

/** A numeric cell; `-`, blank and non-numbers are null, never 0. */
function cellNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const cleaned = value.replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// NSE bulk / block deals (daily archive CSV)
// ---------------------------------------------------------------------------

/**
 * Parses NSE's `bulk.csv` / `block.csv` archive into provider-neutral deals.
 *
 * Header: `Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,
 * Trade Price / Wght. Avg. Price[,Remarks]`. An empty day is a single row
 * reading `NO RECORDS`, which parses to nothing rather than to a deal.
 */
export function parseNseDealsCsv(csv: string, dealType: 'bulk' | 'block'): RawDeal[] {
  const out: RawDeal[] = [];
  for (const row of csvRecords(csv)) {
    const symbol = (row.Symbol ?? '').trim();
    const tradingDate = parseDdMonYyyy(row.Date ?? '');
    if (symbol === '' || tradingDate === null) continue;
    const quantity = cellNumber(row['Quantity Traded']);
    const price = cellNumber(row['Trade Price / Wght. Avg. Price']);
    if (quantity === null || price === null || quantity <= 0 || price <= 0) continue;
    const side = /sell|^s$/i.test(row['Buy/Sell'] ?? '') ? 'sell' : 'buy';
    const clientName = (row['Client Name'] ?? '').trim();
    const pricePaise = rupeesToPaise(price);
    const rounded = Math.round(quantity);

    out.push({
      source: 'nse',
      externalId: `${dealType}-${tradingDate}-${symbol}-${clientName}-${side}-${rounded}-${pricePaise}`,
      dealType,
      tradingDate,
      symbol,
      companyName: (row['Security Name'] ?? symbol).trim() || symbol,
      clientName,
      side,
      quantity: rounded,
      pricePaise,
      exchange: 'NSE',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// NSE full bhavdata — delivery
// ---------------------------------------------------------------------------

/** Series that are the cash-equity universe; the rest (SME, G-secs, …) are skipped. */
const DELIVERY_SERIES: ReadonlySet<string> = new Set(['EQ', 'BE', 'BZ']);

/**
 * Parses NSE's `sec_bhavdata_full_DDMMYYYY.csv` into delivery stats.
 *
 * Header: `SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE,
 * LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS,
 * NO_OF_TRADES, DELIV_QTY, DELIV_PER`. Turnover is ₹ lakh; prices are rupees.
 * A row whose delivery cells read `-` is not a zero-delivery session and is
 * skipped.
 */
export function parseNseBhavdata(csv: string): RawDeliveryStat[] {
  const out: RawDeliveryStat[] = [];
  for (const row of csvRecords(csv)) {
    if (!DELIVERY_SERIES.has(row.SERIES ?? '')) continue;
    const symbol = (row.SYMBOL ?? '').trim();
    const tradingDate = parseDdMonYyyy(row.DATE1 ?? '');
    if (symbol === '' || tradingDate === null) continue;

    const traded = cellNumber(row.TTL_TRD_QNTY);
    const delivered = cellNumber(row.DELIV_QTY);
    const percent = cellNumber(row.DELIV_PER);
    const close = cellNumber(row.CLOSE_PRICE);
    const prevClose = cellNumber(row.PREV_CLOSE);
    const avg = cellNumber(row.AVG_PRICE);
    const turnoverLakh = cellNumber(row.TURNOVER_LACS);
    const trades = cellNumber(row.NO_OF_TRADES);
    if (
      traded === null ||
      delivered === null ||
      percent === null ||
      close === null ||
      prevClose === null ||
      avg === null ||
      turnoverLakh === null ||
      trades === null
    )
      continue;
    if (traded < 0 || delivered < 0 || delivered > traded || close <= 0 || prevClose <= 0) continue;

    out.push({
      source: 'nse',
      tradingDate,
      symbol,
      tradedQty: Math.round(traded),
      deliverableQty: Math.round(delivered),
      deliveryPercent: Math.min(100, Math.max(0, percent)),
      closePaise: rupeesToPaise(close),
      prevClosePaise: rupeesToPaise(prevClose),
      avgPricePaise: rupeesToPaise(avg),
      turnoverPaise: rupeesToPaise(turnoverLakh * 100_000),
      trades: Math.round(trades),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// NSE participant-wise open interest
// ---------------------------------------------------------------------------

const PARTICIPANTS: Readonly<Record<string, OiParticipant>> = {
  FII: 'fii',
  DII: 'dii',
  PRO: 'pro',
  CLIENT: 'client',
};

/** Column-pair → bucket. Headers are matched after trimming. */
const OI_COLUMNS: readonly { bucket: OiBucket; long: string; short: string }[] = [
  { bucket: 'index_fut', long: 'Future Index Long', short: 'Future Index Short' },
  { bucket: 'stock_fut', long: 'Future Stock Long', short: 'Future Stock Short' },
  { bucket: 'index_ce', long: 'Option Index Call Long', short: 'Option Index Call Short' },
  { bucket: 'index_pe', long: 'Option Index Put Long', short: 'Option Index Put Short' },
  { bucket: 'stock_ce', long: 'Option Stock Call Long', short: 'Option Stock Call Short' },
  { bucket: 'stock_pe', long: 'Option Stock Put Long', short: 'Option Stock Put Short' },
];

/** `Sep 16, 2026` (as in the file's title row) → `2026-09-16`. */
export function parseMonDYyyy(value: string): string | null {
  const match = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(value);
  if (match === null) return null;
  const month = MONTHS[(match[1] ?? '').toLowerCase()];
  if (month === undefined) return null;
  return `${match[3]}-${String(month).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
}

/**
 * Parses NSE's `fao_participant_oi_DDMMYYYY.csv`.
 *
 * The file opens with a quoted title row (`"Participant wise Open Interest …
 * as on Sep 16, 2026"`), then a header row with padded names, then one row
 * per client type and a `TOTAL`. The session date is read from the title;
 * `tradingDate` is the fallback when the title is missing or unreadable.
 */
export function parseNseParticipantOi(csv: string, tradingDate: string): RawParticipantOi[] {
  const lines = csv.split(/\r?\n/);
  const first = lines[0] ?? '';
  const titled = /participant/i.test(first) && !/client type/i.test(first);
  const date = (titled ? parseMonDYyyy(first) : null) ?? tradingDate;
  const out: RawParticipantOi[] = [];

  for (const row of csvRecords(csv, titled ? 1 : 0)) {
    const participant = PARTICIPANTS[(row['Client Type'] ?? '').trim().toUpperCase()];
    if (participant === undefined) continue;
    for (const column of OI_COLUMNS) {
      const long = cellNumber(row[column.long]);
      const short = cellNumber(row[column.short]);
      if (long === null || short === null || long < 0 || short < 0) continue;
      out.push({
        source: 'nse',
        tradingDate: date,
        participant,
        bucket: column.bucket,
        longContracts: Math.round(long),
        shortContracts: Math.round(short),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// NSE shareholding master
// ---------------------------------------------------------------------------

const nseShareholdingSchema = z.object({
  symbol: z.string().optional(),
  name: z.string().optional(),
  /** `30-JUN-2026` — the quarter end. */
  date: z.string(),
  pr_and_prgrp: z.union([z.string(), z.number()]).nullable().optional(),
  public_val: z.union([z.string(), z.number()]).nullable().optional(),
});

function percentCell(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Parses NSE's `corporate-share-holdings-master` response for one symbol.
 *
 * The exchange's summary carries promoter-group and public percentages per
 * quarter and nothing finer, so `fiiPercent`/`diiPercent` are null: absent,
 * not zero. Rows with neither figure are dropped.
 */
export function parseNseShareholdingMaster(payload: unknown, symbol: string): RawShareholding[] {
  const rows = z.array(z.unknown()).safeParse(payload);
  if (!rows.success) return [];
  const out: RawShareholding[] = [];
  const seen = new Set<string>();
  for (const raw of rows.data) {
    const parsed = nseShareholdingSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    const asOf = parseDdMonYyyy(row.date);
    if (asOf === null || seen.has(asOf)) continue;
    const promoter = percentCell(row.pr_and_prgrp);
    const pub = percentCell(row.public_val);
    if (promoter === null && pub === null) continue;
    seen.add(asOf);
    out.push({
      source: 'nse',
      symbol: (row.symbol ?? symbol).trim().toUpperCase() || symbol,
      companyName: (row.name ?? symbol).trim() || symbol,
      asOf,
      promoterPercent: promoter,
      fiiPercent: null,
      diiPercent: null,
      publicPercent: pub,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The live source
// ---------------------------------------------------------------------------

function istKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

/** `YYYY-MM-DD` → `YYYYMMDD`, the compact form BSE and the NSE archives expect. */
function compact(dateKey: string): string {
  return dateKey.replace(/-/g, '');
}

const NSE_ARCHIVE = 'https://nsearchives.nseindia.com';
const NSE_HEADERS = { Referer: 'https://www.nseindia.com/' } as const;

async function fetchText(url: string, headers: Record<string, string>): Promise<string> {
  const response = await fetch(url, {
    headers: { ...BROWSER_HEADERS, ...headers, Accept: 'text/csv, text/plain, */*' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.text();
}

/**
 * The India disclosure source.
 *
 * Every method throws on transport or shape failure; the jobs record the
 * failure against the feed and keep whatever was ingested before.
 */
export function createIndiaDisclosureSource(): DisclosureSource {
  return {
    id: 'india-exchanges',

    fetchAnnouncements: async ({ since }) => {
      const from = compact(istKey(since));
      const to = compact(istKey(new Date()));
      const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?strCat=-1&strPrevDate=${from}&strToDate=${to}&strSearch=P&strscrip=&strType=C`;
      const payload = await fetchJson(url, { Referer: 'https://www.bseindia.com/' });
      const envelope = z.object({ Table: z.array(z.unknown()) }).parse(payload);
      const rows = parseBseAnnouncements(envelope);
      if (rows.length !== envelope.Table.length)
        throw new Error('Announcement response contains invalid or undated filings');
      return rows;
    },

    fetchFiiDii: async () =>
      parseNseFiiDii(await fetchJson('https://www.nseindia.com/api/fiidiiTradeReact', NSE_HEADERS)),

    // The archive files are the CURRENT session's snapshot, not a date query;
    // `date` is only used to stamp a row the file leaves undated (it never does).
    fetchDeals: async () => {
      const [bulk, block] = await Promise.all([
        fetchText(`${NSE_ARCHIVE}/content/equities/bulk.csv`, NSE_HEADERS),
        fetchText(`${NSE_ARCHIVE}/content/equities/block.csv`, NSE_HEADERS),
      ]);
      return [...parseNseDealsCsv(bulk, 'bulk'), ...parseNseDealsCsv(block, 'block')];
    },

    fetchDeliveryStats: async ({ date }) => {
      const key = istKey(date);
      const ddmmyyyy = `${key.slice(8, 10)}${key.slice(5, 7)}${key.slice(0, 4)}`;
      const csv = await fetchText(
        `${NSE_ARCHIVE}/products/content/sec_bhavdata_full_${ddmmyyyy}.csv`,
        NSE_HEADERS,
      );
      return parseNseBhavdata(csv);
    },

    fetchParticipantOi: async ({ date }) => {
      const key = istKey(date);
      const ddmmyyyy = `${key.slice(8, 10)}${key.slice(5, 7)}${key.slice(0, 4)}`;
      const csv = await fetchText(
        `${NSE_ARCHIVE}/content/nsccl/fao_participant_oi_${ddmmyyyy}.csv`,
        NSE_HEADERS,
      );
      return parseNseParticipantOi(csv, key);
    },

    // One request per symbol, paced: the endpoint is per-scrip and the
    // exchange rate-limits browsers that hammer it.
    fetchShareholding: async ({ symbols }) => {
      const out: RawShareholding[] = [];
      for (const symbol of symbols) {
        const url = `https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(symbol)}`;
        out.push(...parseNseShareholdingMaster(await fetchJson(url, NSE_HEADERS), symbol));
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      return out;
    },
  };
}
