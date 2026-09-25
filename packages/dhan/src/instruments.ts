import { isBseEquityRow, rupeesToPaise } from '@equitywise/shared';
import { z } from 'zod';
import type { DhanHttpClient } from './http.js';
import { internalSymbolFor } from './symbols.js';
import type {
  Exchange,
  ExchangeSegment,
  FuturesContract,
  Instrument,
  InstrumentKind,
  SecurityRef,
} from './types.js';
import { securityKey } from './types.js';

/**
 * The scrip master.
 *
 * Published as a CSV on a public CDN — no auth, no rate limit, refreshed by
 * Dhan daily. Two variants exist; only the *detailed* one carries the ISIN,
 * so that is the one we read. Columns are named in a header row, so they are
 * located by name rather than position and a reordering upstream cannot
 * silently shift a field.
 */

export const SCRIP_MASTER_URLS = {
  /** All exchanges and segments, with ISIN. ~207k rows, ~35 MB. */
  detailed: 'https://images.dhan.co/api-data/api-scrip-master-detailed.csv',
  /** Same rows without ISIN or the derived fields. Kept for reference only. */
  compact: 'https://images.dhan.co/api-data/api-scrip-master.csv',
} as const;

/** Header names, exactly as published. Verified against a live download, 2026-09-16. */
export const COLUMNS = {
  exchange: 'EXCH_ID',
  segment: 'SEGMENT',
  securityId: 'SECURITY_ID',
  isin: 'ISIN',
  instrument: 'INSTRUMENT',
  ticker: 'UNDERLYING_SYMBOL',
  symbolName: 'SYMBOL_NAME',
  displayName: 'DISPLAY_NAME',
  instrumentType: 'INSTRUMENT_TYPE',
  series: 'SERIES',
  lotSize: 'LOT_SIZE',
  tickSize: 'TICK_SIZE',
  underlyingSecurityId: 'UNDERLYING_SECURITY_ID',
  expiry: 'SM_EXPIRY_DATE',
} as const;

/**
 * Equity series we treat as the tradeable cash market.
 *
 * `EQ` is rolling settlement; `BE`/`BZ` are trade-for-trade — still equities,
 * still screenable. `SM`/`ST` (SME), `GS`/`SG` (G-secs), `N0`… (debt), `MF`
 * are not the product's universe and are dropped.
 */
export const EQUITY_SERIES: ReadonlySet<string> = new Set(['EQ', 'BE', 'BZ']);

/** `SEGMENT` codes in the master: `E` cash, `I` index, `D` NSE derivatives (C/M are currency/commodity). */
const SEGMENT_CODE = { equity: 'E', index: 'I', derivatives: 'D' } as const;

/** The one `INSTRUMENT` value kept from the derivatives segment. */
const STOCK_FUTURES = 'FUTSTK';

const futuresRowSchema = z.object({
  securityId: z.string().regex(/^\d+$/),
  underlyingSecurityId: z.string().regex(/^\d+$/),
  ticker: z.string().min(1),
  name: z.string().min(1),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lotSize: z.number().int().positive(),
});

const rowSchema = z.object({
  securityId: z.string().regex(/^\d+$/),
  ticker: z.string().min(1),
  name: z.string().min(1),
  isin: z.string(),
  series: z.string(),
  lotSize: z.number().int().nonnegative(),
  tickSizeRaw: z.number().nonnegative(),
});

/**
 * Splits one CSV line, honouring double-quoted fields.
 *
 * No Dhan row was quoted on 2026-09-16, but a company name with a comma is
 * the classic way a master CSV breaks a naive `split(',')` one morning.
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

/**
 * Tick size in paise.
 *
 * The master is inconsistent by segment, verified against live rows on
 * 2026-09-16: equities carry PAISE (`YESBANK 1.0000` = ₹0.01, `RELIANCE
 * 10.0000` = ₹0.10 — NSE's price-band tick table exactly), while indices carry
 * RUPEES (`0.0500`). Nothing downstream may see a rupee, so it is settled here.
 */
export function tickSizePaise(raw: number, kind: InstrumentKind): number {
  if (kind === 'index') return rupeesToPaise(raw);
  return Math.round(raw);
}

export interface ParseInstrumentsResult {
  readonly instruments: Instrument[];
  /** NSE stock-futures contracts, every listed expiry. */
  readonly futures: FuturesContract[];
  /** Lines that could not be parsed, with the reason. Never silently dropped. */
  readonly skipped: { readonly line: number; readonly reason: string }[];
}

/**
 * Parses the detailed scrip master into normalised instruments.
 *
 * Keeps NSE cash equities (series in {@link EQUITY_SERIES}), BSE main-board
 * equities (equity ISIN and a main-board group, see `isBseEquityRow`), NSE and
 * BSE indices, and NSE stock-futures contracts; everything else — options,
 * currency, commodity, debt, fund units, SME — is filtered out silently
 * because it is out of scope, not malformed. Rows that *are* in scope but malformed land in
 * `skipped` rather than throwing.
 */
export function parseScripMaster(csv: string): ParseInstrumentsResult {
  const lines = csv.split(/\r?\n/);
  const headerLine = lines[0] ?? '';
  const header = splitCsvLine(headerLine).map((h) => h.trim());
  const col = (name: string): number => header.indexOf(name);

  const idx = {
    exchange: col(COLUMNS.exchange),
    segment: col(COLUMNS.segment),
    securityId: col(COLUMNS.securityId),
    isin: col(COLUMNS.isin),
    ticker: col(COLUMNS.ticker),
    instrument: col(COLUMNS.instrument),
    symbolName: col(COLUMNS.symbolName),
    displayName: col(COLUMNS.displayName),
    instrumentType: col(COLUMNS.instrumentType),
    series: col(COLUMNS.series),
    lotSize: col(COLUMNS.lotSize),
    tickSize: col(COLUMNS.tickSize),
    underlyingSecurityId: col(COLUMNS.underlyingSecurityId),
    expiry: col(COLUMNS.expiry),
  };
  const missing = Object.entries(idx)
    .filter(([, i]) => i < 0)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new RangeError(`parseScripMaster: header is missing columns ${missing.join(', ')}`);
  }

  const instruments: Instrument[] = [];
  const futures: FuturesContract[] = [];
  const skipped: { line: number; reason: string }[] = [];

  for (let n = 1; n < lines.length; n += 1) {
    const line = lines[n] ?? '';
    if (line.trim() === '') continue;
    const cells = splitCsvLine(line);
    const cell = (i: number): string => (cells[i] ?? '').trim();

    const exchangeId = cell(idx.exchange);
    if (exchangeId !== 'NSE' && exchangeId !== 'BSE') continue;
    const exchange: Exchange = exchangeId;
    const segmentCode = cell(idx.segment);
    if (segmentCode === SEGMENT_CODE.derivatives) {
      // BSE derivatives (SENSEX/BANKEX options) are deferred (plan D5).
      if (exchange !== 'NSE') continue;
      if (cell(idx.instrument) !== STOCK_FUTURES) continue;
      const parsed = futuresRowSchema.safeParse({
        securityId: cell(idx.securityId),
        underlyingSecurityId: cell(idx.underlyingSecurityId),
        ticker: cell(idx.ticker),
        name: cell(idx.symbolName) || cell(idx.displayName),
        expiry: cell(idx.expiry),
        lotSize: Number(cell(idx.lotSize)),
      });
      if (!parsed.success) {
        skipped.push({ line: n + 1, reason: parsed.error.issues.map((i) => i.message).join('; ') });
        continue;
      }
      const row = parsed.data;
      futures.push({
        securityId: row.securityId,
        segment: 'NSE_FNO',
        underlyingSymbol: internalSymbolFor(row.ticker, 'equity'),
        underlyingSecurityId: row.underlyingSecurityId,
        expiry: row.expiry,
        lotSize: row.lotSize,
        name: row.name,
      });
      continue;
    }
    let kind: InstrumentKind;
    if (segmentCode === SEGMENT_CODE.equity) {
      const series = cell(idx.series);
      const inScope =
        exchange === 'NSE' ? EQUITY_SERIES.has(series) : isBseEquityRow(cell(idx.isin), series);
      if (!inScope) continue;
      kind = 'equity';
    } else if (segmentCode === SEGMENT_CODE.index) {
      kind = 'index';
    } else {
      continue;
    }

    const parsed = rowSchema.safeParse({
      securityId: cell(idx.securityId),
      ticker: cell(idx.ticker),
      // DISPLAY_NAME is the human one (`Reliance Industries`); SYMBOL_NAME
      // is the exchange one (`RELIANCE INDUSTRIES LTD`). Prefer the former.
      name: cell(idx.displayName) || cell(idx.symbolName),
      isin: cell(idx.isin),
      series: cell(idx.series),
      lotSize: Number(cell(idx.lotSize)),
      tickSizeRaw: Number(cell(idx.tickSize)),
    });
    if (!parsed.success) {
      skipped.push({ line: n + 1, reason: parsed.error.issues.map((i) => i.message).join('; ') });
      continue;
    }
    const row = parsed.data;
    const segment: ExchangeSegment =
      kind === 'index' ? 'IDX_I' : exchange === 'BSE' ? 'BSE_EQ' : 'NSE_EQ';

    instruments.push({
      securityId: row.securityId,
      segment,
      symbol: internalSymbolFor(row.ticker, kind),
      dhanSymbol: row.ticker,
      name: row.name,
      kind,
      exchange,
      isin: kind === 'index' || row.isin === '' || row.isin === 'NA' ? null : row.isin,
      lotSize: row.lotSize,
      tickSize: tickSizePaise(row.tickSizeRaw, kind),
      series: kind === 'index' ? null : row.series,
    });
  }

  return { instruments, futures, skipped };
}

/** Downloads and parses the detailed master. Unauthenticated; not rate limited. */
export async function listInstruments(http: DhanHttpClient): Promise<ParseInstrumentsResult> {
  const csv = await http.requestText(SCRIP_MASTER_URLS.detailed, { skipRateLimit: true });
  return parseScripMaster(csv);
}

// ---------------------------------------------------------------------------
// Index — the lookup every request needs
// ---------------------------------------------------------------------------

function symbolKeyFor(symbol: string, kind: InstrumentKind, exchange: Exchange): string {
  return `${exchange}:${kind}:${symbol.trim().toUpperCase()}`;
}

/**
 * Bidirectional symbol ⇄ security id lookup.
 *
 * This is the one piece of state Dhan forces on us that Fyers did not: a
 * request cannot be built from a symbol alone. Built once from the master and
 * refreshed on the same cadence; a miss is a loud null, never a guess.
 */
export class InstrumentIndex {
  private readonly bySymbol = new Map<string, Instrument>();
  private readonly byKey = new Map<string, Instrument>();
  private readonly futuresBySymbol = new Map<string, FuturesContract[]>();

  constructor(instruments: readonly Instrument[], futures: readonly FuturesContract[] = []) {
    for (const instrument of instruments) {
      // Symbol collisions (a ticker listed under both EQ and BE) resolve to
      // the first row seen, which in the published order is EQ. The exchange
      // is part of the key: RELIANCE on NSE and on BSE are two listings.
      const symbolKey = symbolKeyFor(instrument.symbol, instrument.kind, instrument.exchange);
      if (!this.bySymbol.has(symbolKey)) this.bySymbol.set(symbolKey, instrument);
      this.byKey.set(securityKey(instrument), instrument);
    }
    for (const contract of futures) {
      const list = this.futuresBySymbol.get(contract.underlyingSymbol) ?? [];
      list.push(contract);
      this.futuresBySymbol.set(contract.underlyingSymbol, list);
    }
    for (const list of this.futuresBySymbol.values()) {
      list.sort((a, b) => (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0));
    }
  }

  get size(): number {
    return this.byKey.size;
  }

  /** Every listed futures contract on a stock, nearest expiry first. Empty when not in F&O. */
  futuresFor(symbol: string): readonly FuturesContract[] {
    return this.futuresBySymbol.get(symbol.trim().toUpperCase()) ?? [];
  }

  /** Every symbol with at least one listed futures contract. */
  futuresUnderlyings(): readonly string[] {
    return [...this.futuresBySymbol.keys()];
  }

  /** `RELIANCE` / `equity` / `NSE` → the instrument, or null when unknown. */
  lookup(symbol: string, kind: InstrumentKind, exchange: Exchange = 'NSE'): Instrument | null {
    return this.bySymbol.get(symbolKeyFor(symbol, kind, exchange)) ?? null;
  }

  /** The request ref for a symbol, or null when unknown. */
  refFor(symbol: string, kind: InstrumentKind, exchange: Exchange = 'NSE'): SecurityRef | null {
    const instrument = this.lookup(symbol, kind, exchange);
    return instrument === null
      ? null
      : { segment: instrument.segment, securityId: instrument.securityId };
  }

  /** The instrument behind a response key, or null when unknown. */
  byRef(ref: SecurityRef): Instrument | null {
    return this.byKey.get(securityKey(ref)) ?? null;
  }

  all(): readonly Instrument[] {
    return [...this.byKey.values()];
  }
}
