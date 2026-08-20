/**
 * Money.
 *
 * Every price, quantity-times-price, P&L figure and threshold in this system is
 * an INTEGER NUMBER OF PAISE. ₹1,245.50 is `124550`. There are no floats, no
 * decimal libraries and no rupee-valued numbers anywhere below the presentation
 * layer. See CLAUDE.md, hard rule 3.
 *
 * This module is the only sanctioned boundary between the two representations:
 * `rupeesToPaise` on the way in (Fyers responses, YAML config, user input),
 * `formatPaise` on the way out (React components), and `paiseToRupees` only for
 * third-party interop that genuinely demands a rupee float.
 */

/** Paise in one rupee. */
export const PAISE_PER_RUPEE = 100;

/** Largest paise value that survives a round trip through a JS number. */
export const MAX_SAFE_PAISE = Number.MAX_SAFE_INTEGER;

const DECIMAL_PATTERN = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/**
 * Renders a number as a plain (non-exponential) decimal string.
 *
 * `String(n)` gives the shortest representation that round-trips, which is what
 * we want: `String(1245.5)` is `"1245.5"`, not `"1245.4999999999998"`. Only very
 * large or very small magnitudes fall back to exponential notation, and those
 * are not prices, but we handle them rather than silently mis-parsing.
 */
function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`rupeesToPaise: expected a finite number, received ${String(value)}`);
  }
  const text = String(value);
  // `String` only reaches for exponential notation at extreme magnitudes, and
  // always with a lowercase 'e'.
  return text.includes('e') ? value.toFixed(20) : text;
}

/**
 * Converts rupees to integer paise.
 *
 * Accepts a number or a decimal string. Strings are preferred wherever the
 * source is textual (JSON, YAML, form input) because they carry no accumulated
 * float error at all.
 *
 * Digits beyond the second decimal place are rounded half-away-from-zero:
 * `1245.505` -> `124551`, `-1245.505` -> `-124551`. Sub-paise precision is not
 * representable on an Indian exchange, so this is a rounding, not a truncation.
 *
 * @throws RangeError on a non-finite number, an unparseable string, or a result
 *   outside the safe-integer range.
 */
export function rupeesToPaise(rupees: number | string): number {
  const text = typeof rupees === 'number' ? numberToDecimalString(rupees) : rupees.trim();

  const match = DECIMAL_PATTERN.exec(text);
  if (match === null) {
    throw new RangeError(`rupeesToPaise: cannot parse ${JSON.stringify(text)} as a decimal`);
  }

  const [, signText = '', wholeText = '', fractionText = ''] = match;
  if (wholeText === '' && fractionText === '') {
    throw new RangeError(`rupeesToPaise: cannot parse ${JSON.stringify(text)} as a decimal`);
  }

  const whole = wholeText === '' ? 0 : Number(wholeText);
  const kept = fractionText.slice(0, 2).padEnd(2, '0');
  const dropped = fractionText.slice(2);

  let magnitude = whole * PAISE_PER_RUPEE + Number(kept);
  if (dropped !== '' && Number(dropped[0]) >= 5) {
    magnitude += 1;
  }

  // `magnitude !== 0` keeps negative zero out of the system: -0 is a real
  // value in JS, it compares unequal under Object.is, and it has no business
  // representing an amount of money.
  const paise = signText === '-' && magnitude !== 0 ? -magnitude : magnitude;
  if (!Number.isSafeInteger(paise)) {
    throw new RangeError(`rupeesToPaise: ${text} rupees exceeds the safe paise range`);
  }
  return paise;
}

/** Throws unless `paise` is a safe integer. */
export function assertPaise(paise: number, label = 'value'): void {
  if (!Number.isSafeInteger(paise)) {
    throw new RangeError(`${label}: expected integer paise, received ${String(paise)}`);
  }
}

/**
 * Converts integer paise back to a rupee float.
 *
 * Lossy by construction. Use it only where a third party demands rupees as a
 * number; never to do arithmetic, and never to round-trip back into storage.
 * For anything a human reads, use {@link formatPaise} instead.
 */
export function paiseToRupees(paise: number): number {
  assertPaise(paise, 'paiseToRupees');
  return paise / PAISE_PER_RUPEE;
}

/** Exact decimal string for a paise amount — no float ever materialises. */
function paiseToDecimalString(paise: number): Intl.StringNumericLiteral {
  const sign = paise < 0 ? '-' : '';
  const magnitude = Math.abs(paise);
  const whole = Math.floor(magnitude / PAISE_PER_RUPEE);
  const fraction = magnitude % PAISE_PER_RUPEE;
  // Assembled from an integer, a '.' and two digits, so it always matches the
  // `${number}` shape that Intl's string overload requires. TypeScript cannot
  // see that through template concatenation.
  return `${sign}${whole}.${String(fraction).padStart(2, '0')}` as Intl.StringNumericLiteral;
}

export interface FormatPaiseOptions {
  /** Prefix the Indian rupee sign. Default `true`. */
  readonly withSymbol?: boolean;
  /** Decimal places to show, 0-2. Default `2`. */
  readonly decimals?: number;
  /** Passed through to `Intl.NumberFormat`. Default `'auto'`. */
  readonly signDisplay?: 'auto' | 'always' | 'never' | 'exceptZero';
}

/**
 * Formats paise for display, with Indian digit grouping (lakh/crore).
 *
 * `formatPaise(12455000)` -> `"₹1,24,550.00"`.
 *
 * This is the only function that should ever appear in a React component's
 * price path.
 */
export function formatPaise(paise: number, options: FormatPaiseOptions = {}): string {
  assertPaise(paise, 'formatPaise');

  const { withSymbol = true, decimals = 2, signDisplay = 'auto' } = options;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 2) {
    throw new RangeError(`formatPaise: decimals must be 0, 1 or 2, received ${String(decimals)}`);
  }

  const formatter = new Intl.NumberFormat('en-IN', {
    ...(withSymbol
      ? { style: 'currency' as const, currency: 'INR', currencyDisplay: 'symbol' as const }
      : {}),
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay,
    useGrouping: true,
  });

  // Intl.NumberFormat V3 accepts a decimal string, which keeps large amounts
  // exact instead of routing them through a float.
  return formatter.format(paiseToDecimalString(paise));
}
