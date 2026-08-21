import { formatPaise } from '@signal/shared';
import type { SignalDirection } from './dashboard-types';

/** Formatting and visual-tone helpers shared across the dashboard. */

/** Index levels are quoted as plain numbers, not currency. */
export function level(paise: number | null): string {
  return paise === null ? '—' : formatPaise(paise, { withSymbol: false });
}

/** Turnover in paise → "₹1.24 Cr". Large money needs a scale, not 12 digits. */
export function turnover(paise: number | null): string {
  if (paise === null) return '—';
  const rupees = paise / 100;
  if (Math.abs(rupees) >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
  if (Math.abs(rupees) >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`;
  return formatPaise(paise, { decimals: 0 });
}

export function ratio(value: number | null, suffix = '×'): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}${suffix}`;
}

export function percentPoint(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`;
}

/**
 * Direction tone.
 *
 * Colour is paired with a glyph everywhere it is used, so the information
 * survives for anyone who cannot distinguish red from green.
 */
export const DIRECTION_META: Record<
  SignalDirection,
  { label: string; glyph: string; text: string; bg: string; ring: string }
> = {
  strong_bullish: {
    label: 'Strong bullish',
    glyph: '▲▲',
    text: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/60',
    ring: 'ring-emerald-600/20 dark:ring-emerald-400/30',
  },
  bullish: {
    label: 'Bullish',
    glyph: '▲',
    text: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    ring: 'ring-emerald-600/20 dark:ring-emerald-400/20',
  },
  neutral: {
    label: 'Neutral',
    glyph: '→',
    text: 'text-slate-600 dark:text-slate-300',
    bg: 'bg-slate-100 dark:bg-slate-800',
    ring: 'ring-slate-500/20 dark:ring-slate-400/20',
  },
  bearish: {
    label: 'Bearish',
    glyph: '▼',
    text: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    ring: 'ring-rose-600/20 dark:ring-rose-400/20',
  },
  strong_bearish: {
    label: 'Strong bearish',
    glyph: '▼▼',
    text: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-50 dark:bg-rose-950/60',
    ring: 'ring-rose-600/20 dark:ring-rose-400/30',
  },
};

/** Glyph paired with every signed number, so colour is never the only cue. */
export function trendGlyph(value: number | null): string {
  if (value === null || value === 0) return '→';
  return value > 0 ? '▲' : '▼';
}
