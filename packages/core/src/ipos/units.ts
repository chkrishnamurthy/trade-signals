import { fromIstParts, type PriceBand, rupeesToPaise } from '@equitywise/shared';

/**
 * Reading the numbers and dates Indian offer documents and exchanges write.
 *
 * Pure (hard rule 1). Every parser returns `null` when it cannot read the text
 * with certainty — a missing value is shown as missing, never guessed. Money
 * comes out as INTEGER PAISE (hard rule 3): amounts are converted from their
 * decimal TEXT through `rupeesToPaise`, so no float ever carries a rupee value.
 */

/** Rupees in one lakh and one crore. */
const LAKH = 100_000;
const CRORE = 10_000_000;
const MILLION = 1_000_000;
const BILLION = 1_000_000_000;

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
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** A `YYYY-MM-DD` key from parts, or null when the date does not exist. */
export function dateKey(year: number, month: number, day: number): string | null {
  return isRealDate(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : null;
}

/**
 * `05-Oct-2026`, `01-OCT-2026`, `5-Sept-2026` → `2026-10-05`. Case-insensitive;
 * surrounding whitespace allowed; anything else is null.
 */
export function parseDdMonYyyy(value: string): string | null {
  const match = /^\s*(\d{1,2})[-\s]([A-Za-z]{3,4})[-\s](\d{4})\s*$/.exec(value);
  if (match === null) return null;
  const month = MONTHS[(match[2] ?? '').toLowerCase()];
  if (month === undefined) return null;
  return dateKey(Number(match[3]), month, Number(match[1]));
}

/** `2026-09-30` (already a key) → itself when it is a real date, else null. */
export function parseIsoDateKey(value: string): string | null {
  const match = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(value);
  if (match === null) return null;
  return dateKey(Number(match[1]), Number(match[2]), Number(match[3]));
}

/**
 * An IST wall-clock moment written as `01-Oct-2026 17:00:00` (seconds
 * optional) → its UTC instant. Null when unreadable.
 */
export function parseIstDayTime(value: string): Date | null {
  const match = /(\d{1,2}-[A-Za-z]{3,4}-\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (match === null) return null;
  const key = parseDdMonYyyy(match[1] ?? '');
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] ?? 0);
  if (key === null || hour > 23 || minute > 59 || second > 59) return null;
  const [y, m, d] = key.split('-').map(Number);
  return fromIstParts({ year: y ?? 0, month: m ?? 0, day: d ?? 0, hour, minute, second });
}

/** The UTC instant of an IST wall-clock time on a date key. */
export function istInstant(key: string, hour: number, minute: number): Date | null {
  const valid = parseIsoDateKey(key);
  if (valid === null || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const [y, m, d] = valid.split('-').map(Number);
  return fromIstParts({ year: y ?? 0, month: m ?? 0, day: d ?? 0, hour, minute });
}

/**
 * A count written with Indian or Western grouping, or as the exchanges'
 * float-ish strings: `15,00,000`, `8471153.0`, `1.4456E7` → integer.
 * Null for blanks, `-`, `NA`, negatives and non-integers that do not round
 * cleanly to a whole count.
 */
export function parseCount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'number' ? String(value) : value.replace(/,/g, '').trim();
  if (text === '' || text === '-' || /^n\.?a\.?$/i.test(text)) return null;
  if (!/^\d+(?:\.\d+)?(?:[eE][+]?\d+)?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  const rounded = Math.round(n);
  // `8471153.0` and `1.4456E7` are whole counts written as floats; 12.5 shares is not.
  if (Math.abs(n - rounded) > 1e-6 || !Number.isSafeInteger(rounded)) return null;
  return rounded;
}

/** A dimensionless decimal (a ratio, a percentage): `0.4393`, `9.09`, `-1.64`. */
export function parseDecimal(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'number' ? String(value) : value.replace(/,/g, '').trim();
  if (!/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const AMOUNT = String.raw`(\d[\d,]*(?:\.\d+)?)`;
const CURRENCY = String.raw`(?:rs\.?|inr|₹)`;

/** A decimal rupee string (`2,00,000`, `405.50`) → paise; null if unreadable. */
export function rupeeTextToPaise(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  try {
    return rupeesToPaise(cleaned);
  } catch {
    return null;
  }
}

/**
 * A signed decimal rupee string (`-5`, `13.5`, `+2`) → paise, for quantities
 * like a grey-market premium that can be negative.
 */
export function signedRupeeTextToPaise(text: string): number | null {
  const match = /^\s*([+-]?)\s*(\d[\d,]*(?:\.\d+)?)\s*$/.exec(text);
  if (match === null) return null;
  const magnitude = rupeeTextToPaise(match[2] ?? '');
  if (magnitude === null) return null;
  return match[1] === '-' && magnitude !== 0 ? -magnitude : magnitude;
}

/**
 * A rupee amount scaled by a lakh/crore/million/billion word: (`14500`,
 * `lakhs`) → paise. NSE states issue sizes in lakhs for some issues and in
 * millions for others. Integer arithmetic only: the decimal text becomes paise
 * first, then scales.
 */
export function scaledRupeesToPaise(numberText: string, unit: string | null): number | null {
  const base = rupeeTextToPaise(numberText);
  if (base === null) return null;
  const word = (unit ?? '').toLowerCase();
  const factor = /^(lakh|lakhs|lac|lacs)$/.test(word)
    ? LAKH
    : /^(crore|crores|cr)$/.test(word)
      ? CRORE
      : /^(million|millions|mn)$/.test(word)
        ? MILLION
        : /^(billion|billions|bn)$/.test(word)
          ? BILLION
          : word === ''
            ? 1
            : null;
  if (factor === null) return null;
  const paise = base * factor;
  return Number.isSafeInteger(paise) ? paise : null;
}

/**
 * A single money amount: `Rs. 2,00,000`, `Rs.10 per Equity Share`, `₹405`,
 * `   405`, `Rs. 38 per Equity Share is being offered …` → paise. The text must
 * start with the amount (optionally after a currency mark); `NA`, `-` and
 * blanks are null.
 */
export function parseRupeeAmount(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = value.replace(/^["\s]+|["\s]+$/g, '');
  const match = new RegExp(String.raw`^${CURRENCY}?\s*${AMOUNT}(?:\s*/-)?(?:\s|$)`, 'i').exec(
    `${text} `,
  );
  if (match === null) return null;
  return rupeeTextToPaise(match[1] ?? '');
}

/**
 * A price band: `Rs.208 to Rs.220`, `Rs. 385 to Rs. 405 per Equity Share`,
 * `₹98-103`, or a fixed price (`Rs.1000`, `402`). Null when unreadable, when
 * the low end exceeds the high end, or when either end is not positive.
 */
export function parsePriceBand(value: string | null | undefined): PriceBand | null {
  if (value === null || value === undefined) return null;
  const text = value.replace(/^["\s]+|["\s]+$/g, '');
  // `/-` is the Indian "rupees only" suffix: `Rs. 70/- to Rs. 75/-per equity share`.
  const range = new RegExp(
    String.raw`^${CURRENCY}?\s*${AMOUNT}(?:\s*/-)?\s*(?:to|-|–)\s*${CURRENCY}?\s*${AMOUNT}(?:\s|$|/-)`,
    'i',
  ).exec(`${text} `);
  if (range !== null) {
    const low = rupeeTextToPaise(range[1] ?? '');
    const high = rupeeTextToPaise(range[2] ?? '');
    if (low === null || high === null || low <= 0 || high <= 0 || low > high) return null;
    return { lowPaise: low, highPaise: high };
  }
  const single = new RegExp(
    String.raw`^${CURRENCY}?\s*${AMOUNT}\s*(?:/-)?\s*(?:per\b.*)?$`,
    'i',
  ).exec(text);
  if (single === null) return null;
  const price = rupeeTextToPaise(single[1] ?? '');
  if (price === null || price <= 0) return null;
  return { lowPaise: price, highPaise: price };
}

/**
 * A share count at the start of a phrase: `68 Equity Shares and in multiples
 * thereof`, `1600 Equity Shares`, `37 Equity shares` → the count.
 */
export function parseShareQuantity(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const match = /^\s*"?\s*([\d,]+)\s*(?:equity\s+)?shares?\b/i.exec(value);
  if (match === null) return null;
  const count = parseCount(match[1] ?? '');
  return count !== null && count > 0 ? count : null;
}

/** Removes a source's wrapping quotes and collapses whitespace. */
export function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value
    .replace(/^\s*"+|"+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text === '' || /^(na|n\/a|-|null)$/i.test(text) ? null : text;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** A numeric character reference's text, or the reference itself when it names no character. */
function codePointText(code: number, original: string): string {
  // Surrogates and values past U+10FFFF are not characters; String.fromCodePoint
  // would throw on the latter and one bad entity must not fail a whole page.
  if (!Number.isInteger(code) || code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
    return original;
  return String.fromCodePoint(code);
}

/**
 * Plain text from a fragment that may carry HTML: tags removed, entities
 * decoded in ONE pass (so `&amp;lt;` is the text `&lt;`, never `<`). Decimal,
 * hex and the common named entities are read; anything unreadable is kept as
 * written. Sources are never rendered as HTML (plan §3.2).
 */
export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:#(\d{1,8})|#x([0-9a-f]{1,8})|([a-z]+));/gi, (whole, dec, hex, name) => {
      if (dec !== undefined) return codePointText(Number(dec), whole);
      if (hex !== undefined) return codePointText(Number.parseInt(hex, 16), whole);
      return NAMED_ENTITIES[String(name).toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}
