/**
 * Turning pasted text or a broker export into things a watchlist can look up.
 *
 * Two inputs are recognised, decided by whether the first line reads as a
 * header:
 *
 *   list   `RELIANCE, TCS INFY` / one symbol per line / `NSE:SBIN-EQ` / `TCS.NS`
 *          — every token is a symbol (or an ISIN, which is unmistakable).
 *   csv    a broker holdings export. Zerodha (Kite "Instrument", Console
 *          "Symbol"), Groww ("Stock Name" + "ISIN"), Upstox, Angel, Dhan and
 *          most others share the same handful of column names, so the parser
 *          looks for THOSE columns by name rather than knowing each broker.
 *
 * This module is pure and runs in the browser: the file never leaves the
 * user's machine as a whole. Only the symbol / ISIN / name of each row is sent
 * up to be resolved, never the quantities, prices or P&L beside them — a
 * watchlist wants the names, and the product has no business seeing the rest.
 */

export interface ImportRow {
  /** 1-based line in the pasted text, for the preview. */
  readonly line: number;
  readonly symbol?: string;
  readonly isin?: string;
  readonly name?: string;
}

export interface ParsedImport {
  readonly format: 'list' | 'csv';
  readonly rows: readonly ImportRow[];
  /** Header columns the CSV was read through, for the preview's own words. */
  readonly columns?: { readonly symbol?: string; readonly isin?: string; readonly name?: string };
  /** Rows beyond `MAX_ROWS` are dropped and counted here. */
  readonly truncated: number;
}

/** A holdings file rarely has more; a watchlist that long is unreadable anyway. */
export const MAX_ROWS = 500;

/** Header names brokers use for the three things we can resolve by. */
const SYMBOL_HEADERS = [
  'symbol',
  'tradingsymbol',
  'trading symbol',
  'instrument',
  'ticker',
  'scrip',
  'scrip name',
  'scrip code',
  'stock',
  'stock symbol',
  'nse symbol',
  'nse code',
  'security',
];
const ISIN_HEADERS = ['isin', 'isin code', 'isin no', 'isin no.'];
const NAME_HEADERS = [
  'stock name',
  'company',
  'company name',
  'name',
  'security name',
  'instrument name',
  'scrip name',
];

/** ISIN: two-letter country, nine alphanumerics, a check digit. Indian ones start `INE`/`INF`. */
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

export function looksLikeIsin(token: string): boolean {
  return ISIN_RE.test(token.trim().toUpperCase());
}

/**
 * A symbol as a user or a broker writes it, normalised to ours.
 *
 *   `NSE:SBIN-EQ` → `SBIN`      `TCS.NS` → `TCS`      `"reliance"` → `RELIANCE`
 *
 * Series suffixes (`-EQ`, `-BE`, `-SM`…) and exchange prefixes/suffixes are
 * dropped because they name a segment, not a company. Anything that is not a
 * plausible NSE ticker (letters, digits, `&`, `-`) is rejected as not a symbol.
 */
export function normaliseSymbol(raw: string): string | null {
  let token = raw
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .toUpperCase();
  if (token === '') return null;
  token = token.replace(/^(NSE|BSE):/, '');
  token = token.replace(/\.(NS|BO|NSE|BSE)$/, '');
  token = token.replace(/-(EQ|BE|BZ|SM|ST|BL|IL|IQ|N\d|GS|GB)$/, '');
  if (!/^[A-Z0-9&-]{1,20}$/.test(token)) return null;
  if (!/[A-Z]/.test(token)) return null; // a bare number is a quantity, not a ticker
  return token;
}

export function parseImport(text: string): ParsedImport {
  const lines = text.split(/\r?\n/);
  const firstLine = lines.find((line) => line.trim() !== '') ?? '';
  const delimiter = detectDelimiter(firstLine);
  const header = delimiter === null ? null : readHeader(splitCells(firstLine, delimiter));

  return header === null ? parseList(lines) : parseCsv(lines, delimiter as string, header);
}

// --- Plain lists ------------------------------------------------------------

function parseList(lines: readonly string[]): ParsedImport {
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  let truncated = 0;

  lines.forEach((line, index) => {
    for (const token of line.split(/[,;\t\s]+/)) {
      if (token.trim() === '') continue;
      const upper = token.trim().toUpperCase();
      const row: ImportRow | null = looksLikeIsin(upper)
        ? { line: index + 1, isin: upper }
        : symbolRow(index + 1, token);
      if (row === null) continue;
      const key = row.isin ?? row.symbol ?? '';
      if (seen.has(key)) continue;
      seen.add(key);
      if (rows.length >= MAX_ROWS) {
        truncated += 1;
        continue;
      }
      rows.push(row);
    }
  });

  return { format: 'list', rows, truncated };
}

function symbolRow(line: number, token: string): ImportRow | null {
  const symbol = normaliseSymbol(token);
  return symbol === null ? null : { line, symbol };
}

// --- CSV --------------------------------------------------------------------

interface Header {
  readonly symbol?: number;
  readonly isin?: number;
  readonly name?: number;
  readonly labels: { readonly symbol?: string; readonly isin?: string; readonly name?: string };
}

/** Tab beats semicolon beats comma, because a tab in a header line is never prose. */
function detectDelimiter(line: string): '\t' | ';' | ',' | null {
  if (line.includes('\t')) return '\t';
  if (line.includes(';')) return ';';
  if (line.includes(',')) return ',';
  return null;
}

/**
 * A line is a header when at least one cell names a column we can resolve
 * by. A plain list like `RELIANCE, TCS` has no such cell and stays a list.
 */
function readHeader(cells: readonly string[]): Header | null {
  const labels = cells.map((cell) => cell.trim().toLowerCase().replace(/\s+/g, ' '));
  const find = (candidates: readonly string[]): number | undefined => {
    const index = labels.findIndex((label) => candidates.includes(label));
    return index === -1 ? undefined : index;
  };
  const symbol = find(SYMBOL_HEADERS);
  const isin = find(ISIN_HEADERS);
  // "Scrip name" is a symbol column on some exports and a name on others; if
  // it was already claimed as the symbol, do not read it twice.
  const nameIndex = find(NAME_HEADERS);
  const name = nameIndex === symbol ? undefined : nameIndex;
  if (symbol === undefined && isin === undefined && name === undefined) return null;

  const label = (index: number): string => cells[index]?.trim() ?? '';
  return {
    ...(symbol === undefined ? {} : { symbol }),
    ...(isin === undefined ? {} : { isin }),
    ...(name === undefined ? {} : { name }),
    labels: {
      ...(symbol === undefined ? {} : { symbol: label(symbol) }),
      ...(isin === undefined ? {} : { isin: label(isin) }),
      ...(name === undefined ? {} : { name: label(name) }),
    },
  };
}

function parseCsv(lines: readonly string[], delimiter: string, header: Header): ParsedImport {
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  let truncated = 0;
  let headerSeen = false;

  lines.forEach((line, index) => {
    if (line.trim() === '') return;
    if (!headerSeen) {
      headerSeen = true; // the header line itself
      return;
    }
    const cells = splitCells(line, delimiter);
    const symbolCell = header.symbol === undefined ? undefined : cells[header.symbol];
    const isinCell = header.isin === undefined ? undefined : cells[header.isin];
    const nameCell = header.name === undefined ? undefined : cells[header.name];

    const symbol = symbolCell === undefined ? null : normaliseSymbol(symbolCell);
    const isin =
      isinCell !== undefined && looksLikeIsin(isinCell) ? isinCell.trim().toUpperCase() : null;
    const name = nameCell?.trim().replace(/^["']+|["']+$/g, '') ?? '';

    // Zerodha's Kite export ends with a totals line whose instrument cell is
    // blank; Groww's ends with a blank-name line. Both fall out here.
    if (symbol === null && isin === null && name === '') return;

    const key = symbol ?? isin ?? name.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (rows.length >= MAX_ROWS) {
      truncated += 1;
      return;
    }
    rows.push({
      line: index + 1,
      ...(symbol === null ? {} : { symbol }),
      ...(isin === null ? {} : { isin }),
      ...(name === '' ? {} : { name }),
    });
  });

  return { format: 'csv', rows, columns: header.labels, truncated };
}

/** Splits one CSV line, honouring double-quoted cells (a name can hold a comma). */
export function splitCells(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] as string;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
