import { formatPaise, istParts } from '@equitywise/shared';

/**
 * Display formatting — the ONLY place the app turns wire values into text.
 * Prices go through `formatPaise` (integer paise in, rupee string out; CLAUDE.md
 * rule 3). Instants are rendered in IST whatever the phone's own timezone.
 * Pure: no React Native imports, unit-tested.
 */

export const DASH = '—';

/** ₹1,245.50 — or a dash when the value was not supplied. */
export function price(paise: number | null | undefined): string {
  return paise === null || paise === undefined ? DASH : formatPaise(paise);
}

/** +₹12.40 / -₹3.05 — a signed absolute change. */
export function signedPrice(paise: number | null | undefined): string {
  return paise === null || paise === undefined
    ? DASH
    : formatPaise(paise, { signDisplay: 'exceptZero' });
}

/** An index level: same paise convention, no rupee sign. */
export function level(paise: number | null | undefined): string {
  return paise === null || paise === undefined ? DASH : formatPaise(paise, { withSymbol: false });
}

/** +1.24% / -0.50% / 0.00% */
export function percent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  const fixed = Math.abs(value).toFixed(digits);
  if (Number(fixed) === 0) return `${(0).toFixed(digits)}%`;
  return `${value > 0 ? '+' : '-'}${fixed}%`;
}

/** Percentage move from `from` to `to`, both paise. Null when undefined. */
export function percentChange(from: number | null | undefined, to: number | null | undefined) {
  if (from === null || from === undefined || to === null || to === undefined || from === 0) {
    return null;
  }
  return ((to - from) / Math.abs(from)) * 100;
}

/** 12.3 Cr / 45.6 L / 12,345 — Indian compact units for share volume. */
export function volume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${(value / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(value / 1e5).toFixed(2)} L`;
  return Math.round(value).toLocaleString('en-IN');
}

export function ratio(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? DASH
    : value.toFixed(digits);
}

export type Tone = 'positive' | 'negative' | 'neutral';

/** Which colour a signed number takes. Zero and unknown are neutral. */
export function tone(value: number | null | undefined): Tone {
  if (value === null || value === undefined || value === 0 || !Number.isFinite(value)) {
    return 'neutral';
  }
  return value > 0 ? 'positive' : 'negative';
}

/** Arrow glyph so direction never relies on colour alone (accessibility). */
export function arrow(value: number | null | undefined): string {
  const t = tone(value);
  return t === 'positive' ? '▲' : t === 'negative' ? '▼' : '•';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 14:05 IST */
export function istTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  const date = toDate(value);
  if (date === null) return DASH;
  const p = istParts(date);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')} IST`;
}

/** 24 Sep 2026 */
export function istDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  // A bare `YYYY-MM-DD` is already an IST trading date — do not shift it.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
  }
  const date = toDate(value);
  if (date === null) return DASH;
  const p = istParts(date);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** 24 Sep, 14:05 IST */
export function istDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  const date = toDate(value);
  if (date === null) return DASH;
  const p = istParts(date);
  return `${p.day} ${MONTHS[p.month - 1]}, ${istTime(date)}`;
}

/** Market phase in words. `unknown` must never read as "closed". */
export function marketPhaseLabel(phase: string): string {
  switch (phase) {
    case 'open':
      return 'Market open';
    case 'pre_open':
      return 'Pre-open';
    case 'closing_auction':
      return 'Closing auction';
    case 'post_close':
      return 'Post-close';
    case 'closed':
      return 'Market closed';
    default:
      return 'Market status unknown';
  }
}
