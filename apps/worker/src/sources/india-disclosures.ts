import type {
  DisclosureSource,
  RawAnnouncement,
  RawDeal,
  RawFiiDiiFlow,
  RawShareholding,
} from '@equitywise/market-data';
import { fromIstParts, rupeesToPaise } from '@equitywise/shared';
import { z } from 'zod';

/**
 * India exchange disclosure source (BSE + NSE public feeds).
 *
 * Public access does not establish storage or redistribution permission.
 * See docs/planning/announcement-interpretation-sources.md. The PURE PARSERS below are the tested part; the fetch
 * announcement transport throws on failure; other legacy feeds fail soft.
 * The scheduler isolates unrelated jobs.
 *
 * ⚠️ ENDPOINT VERIFICATION: BSE/NSE gate their JSON endpoints behind a browser
 * cookie/referer handshake that changes from time to time and cannot be reached
 * from this build environment. The URLs and headers below reflect the public
 * shapes at time of writing; verify and, if needed, adjust them on the VPS
 * (`pnpm --filter @equitywise/worker dev -- --once ingest-announcements`). The
 * parsers are decoupled from the transport precisely so a shape change is a
 * one-line fix with a failing test, not a rewrite.
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
// NSE bulk / block deals
// ---------------------------------------------------------------------------

const nseDealSchema = z.object({
  symbol: z.string().optional(),
  BD_SYMBOL: z.string().optional(),
  name: z.string().optional(),
  BD_SCRIP_NAME: z.string().optional(),
  clientName: z.string().optional(),
  BD_CLIENT_NAME: z.string().optional(),
  buySell: z.string().optional(),
  BD_BUY_SELL: z.string().optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
  BD_QTY_TRD: z.union([z.string(), z.number()]).optional(),
  watp: z.union([z.string(), z.number()]).optional(),
  BD_TP_WATP: z.union([z.string(), z.number()]).optional(),
  date: z.string().optional(),
  BD_DT_DATE: z.string().optional(),
});

/** Parses an NSE bulk/block-deal response into provider-neutral deals. */
export function parseNseDeals(payload: unknown, dealType: 'bulk' | 'block'): RawDeal[] {
  const container = z
    .union([z.array(z.unknown()), z.object({ data: z.array(z.unknown()) })])
    .safeParse(payload);
  if (!container.success) return [];
  const rows = Array.isArray(container.data) ? container.data : container.data.data;
  const out: RawDeal[] = [];

  for (const raw of rows) {
    const parsed = nseDealSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    const symbol = (row.symbol ?? row.BD_SYMBOL ?? '').trim();
    if (symbol === '') continue;
    const rawDate = row.date ?? row.BD_DT_DATE ?? '';
    const tradingDate = parseDdMonYyyy(rawDate) ?? rawDate.slice(0, 10);
    const side = /sell|^s$/i.test(row.buySell ?? row.BD_BUY_SELL ?? '') ? 'sell' : 'buy';
    const quantity = Math.round(toNumber(row.quantity ?? row.BD_QTY_TRD ?? 0));
    const pricePaise = rupeesToPaise(toNumber(row.watp ?? row.BD_TP_WATP ?? 0));
    const clientName = (row.clientName ?? row.BD_CLIENT_NAME ?? '').trim();

    out.push({
      source: 'nse',
      externalId: `${dealType}-${tradingDate}-${symbol}-${clientName}-${side}-${quantity}-${pricePaise}`,
      dealType,
      tradingDate,
      symbol,
      companyName: (row.name ?? row.BD_SCRIP_NAME ?? symbol).trim(),
      clientName,
      side,
      quantity,
      pricePaise,
      exchange: 'NSE',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shareholding
// ---------------------------------------------------------------------------

const shareholdingSchema = z.object({
  symbol: z.string(),
  name: z.string().optional(),
  asOf: z.string(),
  promoter: z.number().nullable().optional(),
  fii: z.number().nullable().optional(),
  dii: z.number().nullable().optional(),
  public: z.number().nullable().optional(),
});

/** Parses a normalised shareholding payload (already numeric percents). */
export function parseShareholding(payload: unknown): RawShareholding[] {
  const rows = z.array(z.unknown()).safeParse(payload);
  if (!rows.success) return [];
  const out: RawShareholding[] = [];
  for (const raw of rows.data) {
    const parsed = shareholdingSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    out.push({
      source: 'bse',
      symbol: row.symbol.trim(),
      companyName: (row.name ?? row.symbol).trim(),
      asOf: row.asOf,
      promoterPercent: row.promoter ?? null,
      fiiPercent: row.fii ?? null,
      diiPercent: row.dii ?? null,
      publicPercent: row.public ?? null,
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

/** `YYYY-MM-DD` → `YYYYMMDD`, the compact form BSE expects. */
function compact(dateKey: string): string {
  return dateKey.replace(/-/g, '');
}

/**
 * The India disclosure source.
 *
 * Announcement failures propagate to the worker for persisted health reporting.
 * Other legacy feeds still fail soft. Source coverage remains unverified.
 */
export function createIndiaDisclosureSource(): DisclosureSource {
  const safe = async <T>(run: () => Promise<readonly T[]>): Promise<readonly T[]> => {
    try {
      return await run();
    } catch {
      return [];
    }
  };

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

    fetchFiiDii: () =>
      safe(async () =>
        parseNseFiiDii(
          await fetchJson('https://www.nseindia.com/api/fiidiiTradeReact', {
            Referer: 'https://www.nseindia.com/',
          }),
        ),
      ),

    fetchDeals: ({ date }) =>
      safe(async () => {
        const day = istKey(date).split('-').reverse().join('-'); // DD-MM-YYYY
        const bulk = parseNseDeals(
          await fetchJson(
            `https://www.nseindia.com/api/historical/bulk-deals?from=${day}&to=${day}`,
            { Referer: 'https://www.nseindia.com/' },
          ),
          'bulk',
        );
        const block = parseNseDeals(
          await fetchJson(
            `https://www.nseindia.com/api/historical/block-deals?from=${day}&to=${day}`,
            { Referer: 'https://www.nseindia.com/' },
          ),
          'block',
        );
        return [...bulk, ...block];
      }),

    // Shareholding has no single clean free JSON endpoint; it is populated by the
    // seed script and can be wired to a per-symbol BSE call on the VPS.
    fetchShareholding: () => safe(async () => []),
  };
}
