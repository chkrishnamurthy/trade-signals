/**
 * Corporate actions that change the share basis — splits, bonuses and
 * consolidations — parsed from the exchange's free-text subject, and the
 * check that decides whether a stored series actually needs the adjustment.
 *
 * The ratio convention is the `corporate_actions` table's: multiply every
 * price BEFORE the ex-date by `ratio` to put it on today's basis
 * (a 1:5 split is 0.2; a 10:1 consolidation is 10).
 *
 * Dividends and rights are deliberately not adjusting actions here (owner
 * decision, 2026-10-03: split/bonus-adjusted, dividend-unadjusted prices).
 */

export type AdjustingKind = 'split' | 'bonus' | 'consolidation';

export interface ParsedAction {
  readonly kind: AdjustingKind;
  /** Exact as a fraction, so the stored decimal is derived once. */
  readonly numerator: number;
  readonly denominator: number;
  /** numerator ÷ denominator to 10 places — the `numeric(18,10)` column's text. */
  readonly ratio: string;
}

const MONEY = String.raw`R[se]\.?\s*([0-9]+(?:\.[0-9]+)?)`;
const FACE_VALUE_CHANGE = new RegExp(`from\\s+${MONEY}.*?to\\s+${MONEY}`, 'i');
const BONUS = /bonus\s+(\d+)\s*:\s*(\d+)/i;

/**
 * Parses one exchange subject line. Returns null for anything that is not a
 * share-basis change (dividends, AGMs, rights) or cannot be read exactly.
 *
 *   "Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share"
 *       → split, 2/10
 *   "Bonus 1:2"  (1 new share for every 2 held) → bonus, 2/(1+2)
 *   "Consolidation of Shares From Re 1/- To Rs 10/-" → consolidation, 10/1
 */
export function parseCorporateActionSubject(subject: string): ParsedAction | null {
  const text = subject.replace(/\s+/g, ' ').trim();

  const bonus = BONUS.exec(text);
  if (bonus !== null) {
    const fresh = Number(bonus[1]);
    const held = Number(bonus[2]);
    if (!(fresh > 0) || !(held > 0)) return null;
    return make('bonus', held, fresh + held);
  }

  if (/split|sub-?division|consolidat/i.test(text)) {
    const fv = FACE_VALUE_CHANGE.exec(text);
    if (fv === null) return null;
    const from = toHundredths(fv[1]);
    const to = toHundredths(fv[2]);
    if (from === null || to === null || from === to) return null;
    return make(to < from ? 'split' : 'consolidation', to, from);
  }

  return null;
}

function toHundredths(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Math.round(Number(value) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function make(kind: AdjustingKind, numerator: number, denominator: number): ParsedAction {
  const g = gcd(numerator, denominator);
  const num = numerator / g;
  const den = denominator / g;
  return { kind, numerator: num, denominator: den, ratio: (num / den).toFixed(10) };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Does the stored raw series show this action's jump at its ex-date?
 *
 * Providers differ: a file like the bhavcopy is raw (the jump is there and the
 * adjustment must be applied); a broker's history API may already be adjusted
 * (no jump — applying the factor again would double-adjust). Compare the first
 * open on/after the ex-date with the last close before it:
 *
 *   'raw'              — the move matches the ratio: record the action
 *   'already_adjusted' — no move: the series is already on today's basis
 *   'ambiguous'        — neither within tolerance: do not guess
 *
 * When the ratio is close to 1 (a 1:10 bonus is 0.909), the nearer of the two
 * explanations wins.
 */
export function classifyStoredSeries(
  lastCloseBefore: number,
  firstOpenOnOrAfter: number,
  ratio: number,
): 'raw' | 'already_adjusted' | 'ambiguous' {
  if (!(lastCloseBefore > 0) || !(firstOpenOnOrAfter > 0) || !(ratio > 0)) return 'ambiguous';
  const implied = firstOpenOnOrAfter / lastCloseBefore;
  const toRaw = Math.abs(Math.log(implied / ratio));
  const toAdjusted = Math.abs(Math.log(implied));
  const tolerance = Math.log(1.25);
  if (Math.min(toRaw, toAdjusted) > tolerance) return 'ambiguous';
  return toRaw <= toAdjusted ? 'raw' : 'already_adjusted';
}
