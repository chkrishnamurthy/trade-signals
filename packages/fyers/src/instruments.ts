import { isBseEquityRow, rupeesToPaise } from '@equitywise/shared';
import { z } from 'zod';
import type { FyersHttpClient } from './http.js';
import { internalSymbolFor, parseFyersSymbol } from './symbols.js';
import type { Exchange, Instrument, InstrumentKind } from './types.js';

/**
 * The NSE and BSE symbol masters.
 *
 * Published as a headerless CSV on a public CDN — no auth, no rate limit.
 * Columns are positional and documented in the v3 spec under "Symbol Master".
 */

export const SYMBOL_MASTER_URLS = {
  /** NSE Capital Market: equities and indices. */
  nseCapitalMarket: 'https://public.fyers.in/sym_details/NSE_CM.csv',
  /** BSE Capital Market: equities, indices — and debt, G-secs, MF units (filtered). */
  bseCapitalMarket: 'https://public.fyers.in/sym_details/BSE_CM.csv',
} as const;

/**
 * Column positions in the symbol master CSV (21 columns, no header row).
 * Verified against a live download, 2026-08-21.
 */
export const COLUMNS = {
  fyToken: 0,
  name: 1,
  instrumentType: 2,
  lotSize: 3,
  tickSize: 4,
  isin: 5,
  tradingSession: 6,
  lastUpdated: 7,
  expiryDate: 8,
  ticker: 9,
  exchange: 10,
  segment: 11,
  scripCode: 12,
  underlyingSymbol: 13,
  underlyingScripCode: 14,
  strikePrice: 15,
  optionType: 16,
  underlyingFyToken: 17,
} as const;

export const EXPECTED_COLUMN_COUNT = 21;

/**
 * Exchange instrument types we care about.
 * 0 = equity, 10 = index (v3 spec, Appendix -> Exchanges). On BSE only groups
 * A and T carry type 0; every other equity group is type 50, shared with debt,
 * G-secs and MF units — `isBseEquityRow` (ISIN + group) decides those.
 */
export const INSTRUMENT_TYPE = { equity: 0, index: 10, bseOther: 50 } as const;

const rowSchema = z.object({
  fyToken: z.string().min(1),
  name: z.string().min(1),
  instrumentType: z.number().int(),
  lotSize: z.number().int().nonnegative(),
  tickSizeRupees: z.number().positive(),
  isin: z.string(),
  lastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ticker: z.string().min(1),
  scripCode: z.number().int().nonnegative(),
});

/**
 * Splits one CSV line, honouring double-quoted fields.
 *
 * Company names in the master contain commas (`"ABC, LTD"`), so a naive
 * `split(',')` silently shifts every later column.
 */
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

function kindFor(instrumentType: number, exchange: Exchange): InstrumentKind | null {
  if (instrumentType === INSTRUMENT_TYPE.equity) return 'equity';
  if (instrumentType === INSTRUMENT_TYPE.index) return 'index';
  // Candidate only; isBseEquityRow decides once the ISIN and group are known.
  if (exchange === 'BSE' && instrumentType === INSTRUMENT_TYPE.bseOther) return 'equity';
  return null;
}

export interface ParseInstrumentsResult {
  readonly instruments: Instrument[];
  /** Lines that could not be parsed, with the reason. Never silently dropped. */
  readonly skipped: { readonly line: number; readonly reason: string }[];
}

/**
 * Parses the symbol master CSV into normalised instruments.
 *
 * Accepts either exchange's master. Rows that are not an equity or index —
 * and, on BSE, not a main-board equity share — are filtered out. Rows that
 * *are* relevant but malformed are collected into `skipped` rather than
 * throwing — one bad row upstream should not cost us the other 9,000.
 */
export function parseSymbolMaster(csv: string): ParseInstrumentsResult {
  const instruments: Instrument[] = [];
  const skipped: { line: number; reason: string }[] = [];

  const lines = csv.split('\n');
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line === '') continue;

    const fields = splitCsvLine(line);
    if (fields.length < EXPECTED_COLUMN_COUNT) {
      skipped.push({
        line: index + 1,
        reason: `expected ${EXPECTED_COLUMN_COUNT} columns, got ${fields.length}`,
      });
      continue;
    }

    const ticker = (fields[COLUMNS.ticker] ?? '').trim();
    const exchange: Exchange | null = ticker.startsWith('NSE:')
      ? 'NSE'
      : ticker.startsWith('BSE:')
        ? 'BSE'
        : null;
    if (exchange === null) continue;

    const instrumentType = Number(fields[COLUMNS.instrumentType]);
    const kind = kindFor(instrumentType, exchange);
    if (kind === null) continue;

    const parsed = rowSchema.safeParse({
      fyToken: (fields[COLUMNS.fyToken] ?? '').trim(),
      name: (fields[COLUMNS.name] ?? '').trim(),
      instrumentType,
      lotSize: Number(fields[COLUMNS.lotSize]),
      tickSizeRupees: Number(fields[COLUMNS.tickSize]),
      isin: (fields[COLUMNS.isin] ?? '').trim(),
      lastUpdated: (fields[COLUMNS.lastUpdated] ?? '').trim(),
      ticker,
      scripCode: Number(fields[COLUMNS.scripCode]),
    });

    if (!parsed.success) {
      skipped.push({
        line: index + 1,
        reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
      continue;
    }

    let symbol: string;
    let group: string | null;
    try {
      symbol = internalSymbolFor(parsed.data.ticker);
      // Confirms the suffix agrees with the numeric instrument type.
      const shape = parseFyersSymbol(parsed.data.ticker);
      group = shape.group;
      if (exchange === 'BSE' && kind === 'equity') {
        // Out of scope (debt, G-sec, MF unit, SME), not malformed: drop quietly.
        if (group === null || !isBseEquityRow(parsed.data.isin, group)) continue;
      }
      if (shape.kind !== kind) {
        skipped.push({
          line: index + 1,
          reason: `type ${instrumentType} says ${kind} but ticker says ${shape.kind}`,
        });
        continue;
      }
    } catch (error) {
      skipped.push({
        line: index + 1,
        reason: error instanceof Error ? error.message : 'bad ticker',
      });
      continue;
    }

    instruments.push({
      fyToken: parsed.data.fyToken,
      symbol,
      fyersSymbol: parsed.data.ticker,
      name: parsed.data.name,
      kind,
      exchange,
      isin: parsed.data.isin === '' ? null : parsed.data.isin,
      lotSize: parsed.data.lotSize,
      // Tick size is published in rupees (0.05); we store paise (5).
      tickSize: rupeesToPaise(parsed.data.tickSizeRupees),
      scripCode: parsed.data.scripCode,
      group,
      lastUpdated: parsed.data.lastUpdated,
    });
  }

  return { instruments, skipped };
}

/**
 * Downloads and parses the NSE symbol master.
 *
 * The CDN is public and not rate limited, so this bypasses the token bucket —
 * spending API budget on a static file would be pure waste.
 */
export async function listInstruments(
  http: FyersHttpClient,
  url: string = SYMBOL_MASTER_URLS.nseCapitalMarket,
): Promise<ParseInstrumentsResult> {
  const csv = await http.requestText(url, { method: 'GET', skipRateLimit: true });
  return parseSymbolMaster(csv);
}

/** Both masters, concatenated: NSE first, then BSE. */
export async function listAllInstruments(http: FyersHttpClient): Promise<ParseInstrumentsResult> {
  const [nse, bse] = await Promise.all([
    listInstruments(http, SYMBOL_MASTER_URLS.nseCapitalMarket),
    listInstruments(http, SYMBOL_MASTER_URLS.bseCapitalMarket),
  ]);
  return {
    instruments: [...nse.instruments, ...bse.instruments],
    skipped: [...nse.skipped, ...bse.skipped],
  };
}
