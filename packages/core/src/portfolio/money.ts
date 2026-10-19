/**
 * Exact rupee-text to integer-paise conversion (CLAUDE.md hard rule 3).
 *
 * Works on the digits of the text, never on a float, so "54389.19" is exactly
 * 5438919 and "16.53" is exactly 1653. More than two decimals round half up.
 */
export function parseRupeesToPaise(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/^[₹]|^rs\.?\s*/i, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '');
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (match === null) return null;
  const [, sign = '', whole = '0', fraction = ''] = match;
  const padded = `${fraction}000`;
  let paise = Number(whole) * 100 + Number(padded.slice(0, 2));
  if (Number(padded.charAt(2)) >= 5) paise += 1;
  if (!Number.isSafeInteger(paise)) return null;
  return sign === '-' ? -paise : paise;
}

/** A whole number of shares. "280", "1,200" and "280.0" pass; "280.5" and "" do not. */
export function parseShareCount(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '');
  const match = /^(\d+)(?:\.0+)?$/.exec(cleaned);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}
