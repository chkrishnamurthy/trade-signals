import { formatPaise } from '@signal/shared';

/**
 * Display formatting for the market UI.
 *
 * The only place paise become strings. Nothing here does arithmetic on money
 * beyond what `formatPaise` already handles.
 */

/** Price with the rupee sign and Indian grouping: 124550 -> "₹1,245.50". */
export function price(paise: number | null): string {
  return paise === null ? '—' : formatPaise(paise);
}

/** Price without the symbol, for dense table columns. */
export function priceCompact(paise: number | null): string {
  return paise === null ? '—' : formatPaise(paise, { withSymbol: false });
}

/** Signed change: always carries an explicit + or −. */
export function signedPrice(paise: number | null): string {
  if (paise === null) return '—';
  const formatted = formatPaise(Math.abs(paise), { withSymbol: false });
  if (paise === 0) return formatted;
  return `${paise > 0 ? '+' : '−'}${formatted}`;
}

/** Signed percentage, two decimals. A ratio, not money — plain float maths. */
export function signedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

/**
 * Volume in Indian market shorthand: 1,25,00,000 -> "1.25 Cr".
 *
 * Crore and lakh rather than M/B, because that is how NSE volumes are read.
 */
export function volume(shares: number | null): string {
  if (shares === null || !Number.isFinite(shares)) return '—';
  const abs = Math.abs(shares);
  if (abs >= 10_000_000) return `${(shares / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `${(shares / 100_000).toFixed(2)} L`;
  if (abs >= 1_000) return `${(shares / 1_000).toFixed(1)} K`;
  return shares.toLocaleString('en-IN');
}

/** Index levels are quoted as plain numbers, not currency. */
export function indexLevel(paise: number | null): string {
  return paise === null ? '—' : formatPaise(paise, { withSymbol: false });
}

/** `HH:MM:SS` in IST, for the "last updated" line. */
export function istTime(iso: string | null): string {
  if (iso === null) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

/** Tailwind classes for a signed value. Neutral at exactly zero. */
export function toneFor(value: number | null): string {
  if (value === null || value === 0) return 'text-slate-500 dark:text-slate-400';
  return value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
}
