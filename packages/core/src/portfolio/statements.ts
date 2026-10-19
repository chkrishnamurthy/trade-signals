import { parseTradeDate } from './files.js';

/**
 * Reading two PDF documents a user downloads themselves (portfolio phase 6.3).
 * The browser turns the PDF into text lines; these pure functions read them.
 *
 *   CAS            the consolidated account statement from NSDL or CDSL: every
 *                  share held in the user's demat accounts on a date, by ISIN.
 *                  It has no cost, so it is used to CHECK the user's record, not
 *                  to create entries.
 *   contract note  a broker's record of one day's trades: date, ISIN, bought or
 *                  sold, shares, price. Turned into a trade list for the usual
 *                  import review.
 *
 * Layouts differ between depositories and brokers, so rows are found by what
 * every one prints (an equity ISIN and numbers that agree with each other),
 * not by column position. A row whose numbers do not cross-check is marked for
 * the user to check. Nothing here is saved; the review step decides.
 */

/** NSE/BSE equity shares: INE + issuer (4) + security type 01 + serial (2) + check digit. */
const EQUITY_ISIN = /\b(INE[A-Z0-9]{4}01[A-Z0-9]{2}\d)\b/;

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

/** "30-Sep-2026", "30 Sep 2026", "30/09/2026", "2026-09-30" → ISO, or null. */
export function parseStatementDate(raw: string): string | null {
  const m = /^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ,]+(\d{4})$/.exec(raw.trim());
  if (m !== null) {
    const month = MONTHS[(m[2] ?? '').toLowerCase()];
    if (month === undefined) return null;
    return parseTradeDate(`${m[3]}-${month}-${(m[1] ?? '').padStart(2, '0')}`);
  }
  return parseTradeDate(raw);
}

const DATE_TOKEN =
  /(\d{1,2}[-/ ][A-Za-z]{3}[A-Za-z]*[-/ ,]+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}-\d{2}-\d{2})/;

/** Numbers on a line, Indian grouping allowed ("1,41,230.50"); signs and brackets ignored. */
export function numbersIn(text: string): { value: number; integral: boolean; raw: string }[] {
  const out: { value: number; integral: boolean; raw: string }[] = [];
  for (const m of text.matchAll(
    /(?<![A-Za-z0-9])\d{1,3}(?:,\d{2,3})*(?:\.\d+)?(?![A-Za-z0-9])|(?<![A-Za-z0-9,.])\d+(?:\.\d+)?(?![A-Za-z0-9])/g,
  )) {
    const raw = m[0];
    const value = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const decimals = raw.split('.')[1] ?? '';
    out.push({ value, integral: decimals === '' || /^0+$/.test(decimals), raw });
  }
  return out;
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005);

/** Rupees as written ("1,412.30") to integer paise, without floats. */
function rupeesToPaise(raw: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(raw.replace(/,/g, ''));
  if (m === null) return null;
  const frac = `${m[2] ?? ''}00`.slice(0, 2);
  const rest = (m[2] ?? '').slice(2);
  // Round half up on the third decimal and beyond.
  const up = rest !== '' && Number(rest[0]) >= 5 ? 1 : 0;
  return Number(m[1]) * 100 + Number(frac) + up;
}

export type StatementKind = 'cas' | 'contract_note' | 'unknown';

/** Which document the text is, from the words both kinds always print. */
export function detectStatementKind(lines: readonly string[]): StatementKind {
  const text = lines.slice(0, 120).join(' ').toLowerCase();
  if (/contract\s+note/.test(text)) return 'contract_note';
  if (/consolidated\s+account\s+statement|\bcas\b|nsdl|cdsl|holding statement/.test(text))
    return 'cas';
  return 'unknown';
}

export interface StatementHolding {
  readonly isin: string;
  /** The security name as the statement prints it. */
  readonly name: string;
  readonly shares: number;
  readonly status: 'ok' | 'check';
  readonly message: string;
}

export interface CasStatement {
  /** The date the balances are as of; null when the statement does not say. */
  readonly asOf: string | null;
  /** One row per ISIN; several demat accounts holding the same stock are added up. */
  readonly holdings: StatementHolding[];
}

/**
 * Equity holdings from a CAS. On each line with an equity ISIN, the shares are
 * the whole number n for which some later price p and value v on the line
 * agree (n × p ≈ v), taking the largest such value. Without such a pair, the first whole number is taken and
 * the row is marked to check.
 */
export function parseCasStatement(lines: readonly string[]): CasStatement {
  let asOf: string | null = null;
  for (const line of lines) {
    const m = /(?:as\s+on|as\s+of|period\s+ending|to)\s*:?\s*/i.exec(line);
    if (m === null) continue;
    const date = DATE_TOKEN.exec(line.slice(m.index + m[0].length));
    const parsed = date === null ? null : parseStatementDate(date[1] ?? '');
    if (parsed !== null && (asOf === null || parsed > asOf)) asOf = parsed;
  }

  const byIsin = new Map<
    string,
    { name: string; shares: number; check: boolean; accounts: number }
  >();
  for (const line of lines) {
    const isin = EQUITY_ISIN.exec(line);
    if (isin === null) continue;
    const after = line.slice((isin.index ?? 0) + (isin[1] ?? '').length);
    const nums = numbersIn(after);
    const firstNum = nums[0];
    const name = (firstNum === undefined ? after : after.slice(0, after.indexOf(firstNum.raw)))
      .replace(/[^A-Za-z0-9&.\-() ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Every (shares, price, value) that agrees; the one with the largest value is the
    // holding (a face value or a balance column can agree with itself by chance).
    let shares: number | null = null;
    let checked = false;
    let best = 0;
    for (let i = 0; i < nums.length; i++) {
      const n = nums[i];
      if (n === undefined || !n.integral || n.value <= 0) continue;
      for (let j = i + 1; j < nums.length; j++) {
        for (let k = j + 1; k < nums.length; k++) {
          const p = nums[j]?.value ?? 0;
          const v = nums[k]?.value ?? 0;
          if (p > 0 && v > best && close(n.value * p, v)) {
            shares = n.value;
            checked = true;
            best = v;
          }
        }
      }
    }
    if (shares === null) shares = nums.find((n) => n.integral && n.value > 0)?.value ?? null;
    if (shares === null || !Number.isSafeInteger(shares)) continue;
    const key = isin[1] ?? '';
    const cur = byIsin.get(key);
    byIsin.set(key, {
      name: cur?.name || name,
      shares: (cur?.shares ?? 0) + shares,
      check: (cur?.check ?? false) || !checked,
      accounts: (cur?.accounts ?? 0) + 1,
    });
  }
  return {
    asOf,
    holdings: [...byIsin].map(([isin, h]) => ({
      isin,
      name: h.name,
      shares: h.shares,
      status: h.check ? 'check' : 'ok',
      message: h.check
        ? 'Check: the number of shares could not be cross-checked against the price and value on the statement.'
        : h.accounts > 1
          ? `Added up from ${h.accounts} lines (more than one demat account).`
          : '',
    })),
  };
}

export interface ContractNoteTrade {
  readonly tradeDate: string;
  readonly isin: string;
  readonly name: string;
  readonly kind: 'add' | 'remove';
  readonly shares: number;
  /** Per share, paise: the net rate (with brokerage) when the note gives one, else the price. */
  readonly pricePaise: number;
  readonly tradeId: string | null;
  readonly status: 'ok' | 'check';
}

export interface ContractNote {
  readonly tradeDate: string | null;
  readonly trades: ContractNoteTrade[];
}

const SIDE = /(?:^|\s)(B|S|BUY|SELL|Buy|Sell|Bought|Sold)(?=\s|$)/;

/**
 * Equity trades from a contract note. A trade line has an equity ISIN, a side
 * (B / S / Buy / Sell) and, after the side, the shares (a whole number) and a
 * price. When a later number on the line equals shares × a rate, that rate is
 * the net rate (charges in); otherwise the first price is used and the row is
 * marked to check.
 */
export function parseContractNote(lines: readonly string[]): ContractNote {
  let tradeDate: string | null = null;
  for (const line of lines) {
    const m = /trade\s+date\s*:?\s*/i.exec(line);
    if (m === null) continue;
    const date = DATE_TOKEN.exec(line.slice(m.index + m[0].length));
    const parsed = date === null ? null : parseStatementDate(date[1] ?? '');
    if (parsed !== null) {
      tradeDate = parsed;
      break;
    }
  }
  const trades: ContractNoteTrade[] = [];
  if (tradeDate === null) return { tradeDate, trades };
  for (const line of lines) {
    const isin = EQUITY_ISIN.exec(line);
    const side = SIDE.exec(line);
    if (isin === null || side === null) continue;
    const kind = /^(B|BUY|Buy|Bought)$/.test(side[1] ?? '') ? 'add' : 'remove';
    const before = line.slice(0, side.index);
    const id = /\b(\d{8,20})\b/.exec(before.replace(isin[1] ?? '', ''));
    const nums = numbersIn(line.slice((side.index ?? 0) + (side[0] ?? '').length));
    const qtyAt = nums.findIndex((n) => n.integral && n.value > 0);
    const qty = nums[qtyAt];
    if (qty === undefined || !Number.isSafeInteger(qty.value)) continue;
    const rest = nums.slice(qtyAt + 1).filter((n) => n.value > 0);
    const gross = rest[0];
    if (gross === undefined) continue;
    // A later rate whose total also appears on the line: the net rate.
    let rate = gross;
    let crossChecked = false;
    for (let j = 1; j < rest.length && !crossChecked; j++) {
      const candidate = rest[j];
      if (candidate === undefined) continue;
      if (rest.some((t, k) => k > j && close(qty.value * candidate.value, t.value))) {
        rate = candidate;
        crossChecked = true;
      }
    }
    if (!crossChecked && rest.some((t, k) => k > 0 && close(qty.value * gross.value, t.value)))
      crossChecked = true;
    const pricePaise = rupeesToPaise(rate.raw);
    if (pricePaise === null || pricePaise <= 0) continue;
    const name = before
      .replace(isin[1] ?? '', ' ')
      .replace(/\b\d+[:.]?\d*\b/g, ' ')
      .replace(/[^A-Za-z&.\- ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    trades.push({
      tradeDate,
      isin: isin[1] ?? '',
      name,
      kind,
      shares: qty.value,
      pricePaise,
      tradeId: id === null ? null : (id[1] ?? null),
      status: crossChecked ? 'ok' : 'check',
    });
  }
  return { tradeDate, trades };
}

/**
 * The trades as the trade-list CSV the import already reads, so a contract note
 * goes through the same review as any broker file. The ISIN stands in as the
 * stock name; the server matches by ISIN.
 */
export function contractNoteToCsv(note: ContractNote): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rupees = (p: number) => `${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}`;
  return [
    'Symbol,ISIN,Trade date,Trade type,Quantity,Price,Trade ID',
    ...note.trades.map((t) =>
      [
        q(t.isin),
        q(t.isin),
        t.tradeDate,
        t.kind === 'add' ? 'buy' : 'sell',
        String(t.shares),
        rupees(t.pricePaise),
        q(t.tradeId === null ? '' : `CN-${t.tradeDate}-${t.tradeId}`),
      ].join(','),
    ),
  ].join('\n');
}
