import {
  cleanText,
  isAllowedHost,
  parseIsoDateKey,
  signedRupeeTextToPaise,
  stripHtml,
} from '@equitywise/core';
import type { GmpSource, RawGmpQuote } from '@equitywise/market-data';
import { fromIstParts, type IpoExchange } from '@equitywise/shared';
import { z } from 'zod';
import type { PoliteHttpClient } from './http.js';

/**
 * InvestorGain's live GMP page — the UNOFFICIAL grey-market premium
 * (docs/planning/ipos-plan.md §3.5, owner decision D1).
 *
 * This is a `GmpSource` only: it cannot supply any official field. We keep
 * the GMP, its range, the "updated" time, and the per-issue page for
 * attribution; the name, board and dates are used for matching only. Their
 * subscription, price, lot, size and "estimated listing price" columns are
 * deliberately discarded.
 *
 * The rows arrive embedded in the page's Next.js flight data
 * (`self.__next_f.push([1, "…"])`): the chunks concatenate into a stream of
 * `id:json` lines, one of which carries
 * `resultData.initialTableResponse.reportTableData`. The parser fails LOUDLY
 * when that array is missing — an unreadable page must never look like "no
 * GMP today".
 */

export const INVESTORGAIN_SOURCE_ID = 'investorgain';
export const INVESTORGAIN_URL = 'https://www.investorgain.com/report/ipo-gmp-live/331/';
const ORIGIN = 'https://www.investorgain.com';
const HOSTS = ['investorgain.com'];

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

/** The flight-data chunks of a Next.js page, concatenated in order. */
export function flightStream(html: string): string {
  let out = '';
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    const literal = match[1];
    if (literal === undefined) continue;
    try {
      out += JSON.parse(literal) as string;
    } catch {
      // A malformed chunk is skipped; a missing table is caught below.
    }
  }
  return out;
}

const rowSchema = z
  .object({
    '~ipo_name': z.string().min(1),
    '~ipo_category1': z.string().optional(),
    '~ipo_status1': z.string().optional(),
    '~Srt_Open': z.string().optional(),
    '~Srt_Close': z.string().optional(),
    '~urlrewrite_folder_name': z.string().optional(),
    '~id': z.union([z.string(), z.number()]).optional(),
    Name: z.string().optional(),
    GMP: z.string().optional(),
    'Updated-On': z.string().optional(),
  })
  .passthrough();

export type InvestorGainRow = z.infer<typeof rowSchema>;

/** Finds `reportTableData` in the flight stream; throws when absent or malformed. */
export function extractRows(html: string): { rows: InvestorGainRow[]; currentTime: string | null } {
  const stream = flightStream(html);
  const at = stream.indexOf('"initialTableResponse"');
  if (at === -1) throw new Error('InvestorGain page has no initialTableResponse — layout changed?');
  // The table sits on one `id:json` line; parse that line's JSON value.
  const lineStart = stream.lastIndexOf('\n', at) + 1;
  const colon = stream.indexOf(':', lineStart);
  const lineEnd = stream.indexOf('\n', at);
  const json = stream.slice(colon + 1, lineEnd === -1 ? undefined : lineEnd);
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('InvestorGain table line is not valid JSON');
  }
  const found = findTable(value);
  if (found === null) throw new Error('InvestorGain page has no reportTableData array');
  const rows: InvestorGainRow[] = [];
  for (const raw of found.rows) {
    const parsed = rowSchema.safeParse(raw);
    if (parsed.success) rows.push(parsed.data);
  }
  if (found.rows.length > 0 && rows.length === 0)
    throw new Error('InvestorGain rows no longer carry the expected fields');
  return { rows, currentTime: found.currentTime };
}

function findTable(value: unknown): { rows: unknown[]; currentTime: string | null } | null {
  if (value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = findTable(v);
      if (hit !== null) return hit;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  const table = record.initialTableResponse;
  if (table !== null && typeof table === 'object') {
    const t = table as Record<string, unknown>;
    if (Array.isArray(t.reportTableData))
      return {
        rows: t.reportTableData,
        currentTime: typeof t.currentTime === 'string' ? t.currentTime : null,
      };
  }
  for (const v of Object.values(record)) {
    const hit = findTable(v);
    if (hit !== null) return hit;
  }
  return null;
}

/** `₹<b>20</b> (9.09%) … 2 ↓ / 20 ↑` → GMP and the low/high range, paise. `--` → null. */
export function parseGmpCell(html: string | undefined): {
  gmpPaise: number | null;
  rangeLowPaise: number | null;
  rangeHighPaise: number | null;
} {
  const text = stripHtml(html ?? '');
  const head = /₹\s*(--|[+-]?\d[\d,]*(?:\.\d+)?)/.exec(text);
  const range = /([+-]?\d[\d,]*(?:\.\d+)?)\s*↓\s*\/\s*([+-]?\d[\d,]*(?:\.\d+)?)\s*↑/.exec(text);
  const gmpPaise = head === null || head[1] === '--' ? null : signedRupeeTextToPaise(head[1] ?? '');
  const low = range === null ? null : signedRupeeTextToPaise(range[1] ?? '');
  const high = range === null ? null : signedRupeeTextToPaise(range[2] ?? '');
  // "0 ↓ / 0 ↑" beside a "--" quote is "no range", not a range of zero.
  const noRange = gmpPaise === null && low === 0 && high === 0;
  return { gmpPaise, rangeLowPaise: noRange ? null : low, rangeHighPaise: noRange ? null : high };
}

/**
 * `2-Oct 7:02` (IST, no year) → UTC. The year comes from the page's own
 * `currentTime`; a December quote read in January belongs to the previous year.
 */
export function parseUpdatedOn(html: string | undefined, currentTime: string | null): Date | null {
  const text = stripHtml(html ?? '');
  const match = /(\d{1,2})-([A-Za-z]{3})\s+(\d{1,2}):(\d{2})/.exec(text);
  if (match === null || currentTime === null) return null;
  const now = /^(\d{4})-(\d{2})/.exec(currentTime);
  if (now === null) return null;
  const month = MONTHS[(match[2] ?? '').toLowerCase()];
  if (month === undefined) return null;
  const nowYear = Number(now[1]);
  const nowMonth = Number(now[2]);
  const year = month > nowMonth + 1 ? nowYear - 1 : nowYear;
  const day = Number(match[1]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);
  if (day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return fromIstParts({ year, month, day, hour, minute });
}

/** The exchange tag in the Name cell: `IPO` (mainboard), `NSE SME`, `BSE SME`. */
export function exchangeTag(nameHtml: string | undefined): {
  board: 'mainboard' | 'sme';
  exchange: IpoExchange | null;
} {
  const text = stripHtml(nameHtml ?? '').toUpperCase();
  if (/\bBSE SME\b/.test(text)) return { board: 'sme', exchange: 'BSE' };
  if (/\bNSE SME\b/.test(text)) return { board: 'sme', exchange: 'NSE' };
  return { board: 'mainboard', exchange: null };
}

export function parseInvestorGainPage(html: string): RawGmpQuote[] {
  const { rows, currentTime } = extractRows(html);
  const out: RawGmpQuote[] = [];
  for (const row of rows) {
    const companyName = cleanText(stripHtml(row['~ipo_name']));
    if (companyName === null) continue;
    const tag = exchangeTag(row.Name);
    const board = /^sme$/i.test(row['~ipo_category1'] ?? '') ? 'sme' : tag.board;
    const path = row['~urlrewrite_folder_name'] ?? '';
    const pageUrl = path.startsWith('/') ? `${ORIGIN}${path}` : INVESTORGAIN_URL;
    const { gmpPaise, rangeLowPaise, rangeHighPaise } = parseGmpCell(row.GMP);
    out.push({
      source: INVESTORGAIN_SOURCE_ID,
      externalKey: `investorgain:${row['~id'] ?? path}`,
      companyName,
      board,
      exchange: tag.exchange,
      openDate: parseIsoDateKey(row['~Srt_Open'] ?? ''),
      closeDate: parseIsoDateKey(row['~Srt_Close'] ?? ''),
      gmpPaise,
      rangeLowPaise,
      rangeHighPaise,
      updatedAt: parseUpdatedOn(row['Updated-On'], currentTime),
      pageUrl: isAllowedHost(pageUrl, HOSTS) ? pageUrl : INVESTORGAIN_URL,
    });
  }
  return out;
}

export function createInvestorGainSource(client: PoliteHttpClient): GmpSource {
  return {
    id: INVESTORGAIN_SOURCE_ID,
    fetchGmp: async () =>
      parseInvestorGainPage(
        await client.getText(INVESTORGAIN_URL, { accept: 'text/html,application/xhtml+xml' }),
      ),
  };
}
