import { formatPaise } from '@signal/shared';

/**
 * Display formatting for the market UI.
 *
 * The only place paise become strings, and the only place a number acquires a
 * unit. Nothing here does arithmetic on money beyond what `formatPaise`
 * already handles, and nothing here returns a CSS class — colour is `lib/tone`.
 *
 * Every function takes `null` to mean "the exchange did not supply this" and
 * renders an em dash for it. Zero is a real value and never renders as a dash.
 */

const DASH = '—';

/** Price with the rupee sign and Indian grouping: 124550 -> "₹1,245.50". */
export function price(paise: number | null): string {
  return paise === null ? DASH : formatPaise(paise);
}

/** Price without the symbol, for dense table columns. */
export function priceCompact(paise: number | null): string {
  return paise === null ? DASH : formatPaise(paise, { withSymbol: false });
}

/** Signed change: always carries an explicit + or −. */
export function signedPrice(paise: number | null): string {
  if (paise === null) return DASH;
  const formatted = formatPaise(Math.abs(paise), { withSymbol: false });
  if (paise === 0) return formatted;
  return `${paise > 0 ? '+' : '−'}${formatted}`;
}

/** Signed percentage, two decimals. A ratio, not money — plain float maths. */
export function signedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

/** Unsigned percentage — participation rates, percent-of-total. */
export function percentPoint(value: number | null, decimals = 1): string {
  return value === null || !Number.isFinite(value) ? DASH : `${value.toFixed(decimals)}%`;
}

/**
 * Volume in Indian market shorthand: 1,25,00,000 -> "1.25 Cr".
 *
 * Crore and lakh rather than M/B, because that is how NSE volumes are read.
 */
export function volume(shares: number | null): string {
  if (shares === null || !Number.isFinite(shares)) return DASH;
  const abs = Math.abs(shares);
  if (abs >= 10_000_000) return `${(shares / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `${(shares / 100_000).toFixed(2)} L`;
  if (abs >= 1_000) return `${(shares / 1_000).toFixed(1)} K`;
  return shares.toLocaleString('en-IN');
}

/** Share counts and lot sizes — exact, Indian grouping, never abbreviated. */
export function quantity(units: number | null): string {
  return units === null || !Number.isFinite(units) ? DASH : units.toLocaleString('en-IN');
}

/**
 * Large money in paise -> "₹1.24 Cr".
 *
 * Turnover and market capitalisation both run to twelve digits; a scale suffix
 * is the only readable form in a table cell.
 */
export function largeCurrency(paise: number | null): string {
  if (paise === null || !Number.isFinite(paise)) return DASH;
  const rupees = paise / 100;
  if (Math.abs(rupees) >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
  if (Math.abs(rupees) >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`;
  return formatPaise(paise, { decimals: 0 });
}

/** Traded value for the session. */
export const turnover = largeCurrency;
/** Shares outstanding × price. Same scale rules as turnover. */
export const marketCap = largeCurrency;

/** Index levels are quoted as plain numbers, not currency. */
export function indexLevel(paise: number | null): string {
  return paise === null ? DASH : formatPaise(paise, { withSymbol: false });
}

/** Multiples: relative volume, P/E, beta. */
export function ratio(value: number | null, suffix = '×'): string {
  return value === null || !Number.isFinite(value) ? DASH : `${value.toFixed(2)}${suffix}`;
}

/** A bare indicator reading — RSI, ADX, a stochastic. */
export function indicator(value: number | null, decimals = 1): string {
  return value === null || !Number.isFinite(value) ? DASH : value.toFixed(decimals);
}

/** `HH:MM:SS` in IST, for the "last updated" line. */
export function istTime(iso: string | null): string {
  if (iso === null) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

/** `DD MMM, HH:MM` in IST — for anything that may not be from today. */
export function istDateTime(iso: string | null): string {
  if (iso === null) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

/**
 * "12s ago" / "4m ago" / "2h ago", for data-freshness labels.
 *
 * `now` is a parameter rather than a `Date.now()` call so the caller controls
 * the clock — a component re-rendering on a timer passes its own tick, and a
 * test passes a fixed instant.
 */
export function agoLabel(iso: string | null, now: number): string {
  if (iso === null) return DASH;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return DASH;
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
