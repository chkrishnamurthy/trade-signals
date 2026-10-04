import type { OiBuildupDto } from '@/lib/disclosure-types';
import type { Tone } from '@/lib/tone';

/**
 * Vocabulary for the Institutional Flow page.
 *
 * Every label here describes price structure or positioning — never an
 * instruction. "Long build-up" says new long positions were added; it is not
 * a call to do anything (CLAUDE.md: BUY / SELL label a signal's direction and
 * nothing else).
 */

export const BUILDUP_LABEL: Readonly<Record<OiBuildupDto, string>> = {
  long_buildup: 'Long build-up',
  short_buildup: 'Short build-up',
  short_covering: 'Short covering',
  long_unwinding: 'Long unwinding',
};

export const BUILDUP_HINT: Readonly<Record<OiBuildupDto, string>> = {
  long_buildup: 'Price up with open interest up — new long positions were added.',
  short_buildup: 'Price down with open interest up — new short positions were added.',
  short_covering: 'Price up with open interest down — short positions were closed.',
  long_unwinding: 'Price down with open interest down — long positions were closed.',
};

export function buildupTone(buildup: OiBuildupDto): Tone {
  return buildup === 'long_buildup' || buildup === 'short_covering' ? 'bullish' : 'bearish';
}

export const PARTICIPANT_LABEL = {
  fii: 'FII',
  dii: 'DII',
  pro: 'Pro',
  client: 'Client',
} as const;

export const BUCKET_LABEL = {
  index_fut: 'Index futures',
  stock_fut: 'Stock futures',
  index_ce: 'Index calls',
  index_pe: 'Index puts',
  stock_ce: 'Stock calls',
  stock_pe: 'Stock puts',
} as const;

/** `2026-09-11` → `11 Sep`. */
export function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  const months = [
    '',
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const m = months[Number(month)] ?? '';
  return day === undefined ? dateKey : `${Number(day)} ${m}`;
}

/** Contract counts read in lakhs/crores like shares do. */
export function contracts(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)} L`;
  return `${sign}${abs.toLocaleString('en-IN')}`;
}

/** A signed contract count with an explicit + for gains. */
export function signedContracts(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value > 0 ? `+${contracts(value)}` : contracts(value);
}
