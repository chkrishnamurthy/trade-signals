/**
 * Cash dividends from the exchange's corporate-action subject line, and the
 * trailing-twelve-month figures built from them.
 *
 * Dividends never adjust prices here (owner decision, 2026-10-03:
 * split/bonus-adjusted, dividend-unadjusted). They are kept apart from
 * `corporate_actions`, whose every row is applied to the price series.
 *
 * Exactness rules — a dividend figure is shown only when it can be known:
 *   - amounts are integer paise; "Re 0.125" (12.5 paise) cannot be stored
 *     exactly and is recorded as an unknown amount, never rounded;
 *   - a subject that mentions a dividend but cannot be read ("Dividend - 50%")
 *     is recorded as an unknown amount;
 *   - a trailing sum over a window holding any unknown amount is null.
 */

export type DividendKind = 'interim' | 'final' | 'special' | 'dividend';

export interface ParsedDividend {
  readonly kind: DividendKind;
  /** Integer paise per share, or null when the subject cannot be read exactly. */
  readonly amountPaise: number | null;
}

/** "Interim Dividend - Rs 8.25", "Special Dividend Of Rs 30", "Dividend - Rs1.25". */
const PART =
  /\b(interim|final|special)?\s*dividend\s*(?:-|of|:)?\s*r(?:s|e)\.?\s*-?\s*([0-9]+(?:\.[0-9]+)?)/gi;

/**
 * Parses one subject into its dividend parts, summed per kind. Returns an
 * empty list when the subject is not a cash dividend on shares — REIT/InvIT
 * "Distribution … Per Unit" lines included.
 *
 *   "Interim Dividend - Rs 7 Per Share & Special Dividend Rs 3 Per Share"
 *       → interim 700, special 300
 *   "Annual General Meeting/Dividend - Re 1 Per Share" → dividend 100
 *   "Dividend - 50%" → dividend, unknown amount
 */
export function parseDividendSubject(subject: string): ParsedDividend[] {
  const text = subject.replace(/\s+/g, ' ').trim();
  if (!/dividend/i.test(text) || /^distribution\b/i.test(text) || /per unit/i.test(text)) return [];

  const sums = new Map<DividendKind, number | null>();
  for (const match of text.matchAll(PART)) {
    const kind = (match[1]?.toLowerCase() ?? 'dividend') as DividendKind;
    const paise = toPaise(match[2]);
    const before = sums.get(kind);
    sums.set(kind, paise === null || before === null ? null : (before ?? 0) + paise);
  }
  if (sums.size === 0) return [{ kind: 'dividend', amountPaise: null }];
  return [...sums].map(([kind, amountPaise]) => ({ kind, amountPaise }));
}

/** Rupees text → integer paise, or null when it is not a whole number of paise. */
function toPaise(rupees: string | undefined): number | null {
  if (rupees === undefined) return null;
  const [whole = '', fraction = ''] = rupees.split('.');
  if (fraction.replace(/0+$/, '').length > 2) return null;
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

export interface DividendPoint {
  readonly exDate: string;
  readonly amountPaise: number | null;
}

export interface ShareBasisChange {
  readonly exDate: string;
  /** The `corporate_actions` ratio: prices before `exDate` multiply by it. */
  readonly ratio: number;
}

export interface TrailingDividend {
  /** Sum per share on today's share basis, paise; null if any amount is unknown. */
  readonly ttmPaise: number | null;
  /** TTM ÷ close, percent; null when the TTM is unknown or there is no close. */
  readonly yieldPct: number | null;
  /** Dividends with an ex-date in the window. */
  readonly count: number;
}

/**
 * Dividends with an ex-date in (asOf − 365 days, asOf], each restated on
 * today's share basis the same way prices are (a ₹10 dividend before a 1:2
 * split is ₹5 a share today), rounded to the paise once, at the end.
 *
 * No dividend in the window is a known zero (ttm 0, yield 0): the company
 * paid none in the last year.
 */
export function trailingDividend(
  dividends: readonly DividendPoint[],
  actions: readonly ShareBasisChange[],
  asOf: string,
  closePaise: number | null,
): TrailingDividend {
  const start = shiftDays(asOf, -365);
  const inWindow = dividends.filter((d) => d.exDate > start && d.exDate <= asOf);
  let sum = 0;
  for (const d of inWindow) {
    if (d.amountPaise === null) return { ttmPaise: null, yieldPct: null, count: inWindow.length };
    let factor = 1;
    for (const a of actions) if (a.exDate > d.exDate) factor *= a.ratio;
    sum += d.amountPaise * factor;
  }
  const ttmPaise = Math.round(sum);
  const yieldPct =
    closePaise !== null && closePaise > 0
      ? Math.round((ttmPaise / closePaise) * 10_000) / 100
      : null;
  return { ttmPaise, yieldPct, count: inWindow.length };
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
