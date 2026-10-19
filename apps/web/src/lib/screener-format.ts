import type { FilterNode } from '@equitywise/core';
import { formatPaise } from '@equitywise/shared';
import * as fmt from '@/lib/format';
import type { MetricDto, ScreenerCellValue } from '@/lib/screener-types';
import type { Tone } from '@/lib/tone';

/**
 * Display formatting for screener values (client-safe). Every value arrives in
 * its stored unit; this is the one place a paise integer becomes ₹ text or a
 * ratio becomes "2.3×". Unknown is always "—", never 0.
 */

const DASH = '—';

/** Percent metrics that read as a move, so they carry a sign and a tone. */
const SIGNED_PERCENT = new Set([
  'changePct',
  'gapPct',
  'ret1w',
  'ret1m',
  'ret3m',
  'ret6m',
  'ret1y',
  'retYtd',
  'dist52wHigh',
  'dist52wLow',
  'distAth',
  'closeVsEma20',
  'closeVsEma50',
  'closeVsEma200',
  'closeVsSma50',
  'closeVsSma200',
  'roc20',
  'futOiChgPct',
]);

/** Paise metrics that are large sums (crore) rather than per-share prices. */
const LARGE_MONEY = new Set(['turnover', 'avgTurnover20']);

const POSITIVE_ENUMS = new Set(['bullish', 'up', 'long_buildup', 'short_covering']);
const NEGATIVE_ENUMS = new Set(['bearish', 'down', 'short_buildup', 'long_unwinding']);

export interface Formatted {
  readonly text: string;
  readonly tone: Tone | null;
  /** True for enum/boolean values that render best as a badge. */
  readonly badge: boolean;
}

function signed(value: number, decimals: number, suffix: string): string {
  if (value === 0) return `0${decimals > 0 ? `.${'0'.repeat(decimals)}` : ''}${suffix}`;
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(decimals)}${suffix}`;
}

function toneOfNumber(value: number): Tone {
  return value > 0 ? 'bullish' : value < 0 ? 'bearish' : 'neutral';
}

export function formatMetric(
  metric: MetricDto | undefined,
  value: ScreenerCellValue | undefined,
): Formatted {
  const none: Formatted = { text: DASH, tone: null, badge: false };
  if (metric === undefined || value === null || value === undefined) return none;
  const d = metric.decimals ?? 2;

  if (typeof value === 'boolean') {
    return { text: value ? 'Yes' : 'No', tone: value ? 'bullish' : 'neutral', badge: true };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return none;
    const labels = value.map((v) => metric.options?.find((o) => o.value === v)?.label ?? v);
    return { text: labels.join(', '), tone: null, badge: false };
  }
  if (typeof value === 'string') {
    const label = metric.options?.find((o) => o.value === value)?.label ?? value;
    const tone = POSITIVE_ENUMS.has(value)
      ? 'bullish'
      : NEGATIVE_ENUMS.has(value)
        ? 'bearish'
        : null;
    return { text: label, tone, badge: metric.unit === 'enum' };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return none;

  switch (metric.unit) {
    case 'paise':
      if (!Number.isInteger(value)) return none;
      if (LARGE_MONEY.has(metric.key))
        return { text: fmt.largeCurrency(value), tone: null, badge: false };
      return {
        text: formatPaise(value),
        tone: metric.key === 'macdHist' ? toneOfNumber(value) : null,
        badge: false,
      };
    case 'percent':
      return SIGNED_PERCENT.has(metric.key)
        ? { text: signed(value, d, '%'), tone: toneOfNumber(value), badge: false }
        : { text: `${value.toFixed(d)}%`, tone: null, badge: false };
    case 'pp':
      return { text: signed(value, d, ' pp'), tone: toneOfNumber(value), badge: false };
    case 'multiple':
      return { text: `${value.toFixed(d)}×`, tone: null, badge: false };
    case 'shares':
      return { text: fmt.volume(value), tone: null, badge: false };
    case 'sessions':
      return { text: value === 0 ? 'Today' : `${value} sess. ago`, tone: null, badge: false };
    case 'days':
      return { text: value === 0 ? 'Today' : `${value} d`, tone: null, badge: false };
    case 'count':
      return {
        text:
          metric.key === 'promoterStreak' ? signed(value, 0, ' q') : value.toLocaleString('en-IN'),
        tone: metric.key === 'promoterStreak' ? toneOfNumber(value) : null,
        badge: false,
      };
    default:
      return { text: value.toFixed(d), tone: null, badge: false };
  }
}

/** Short unit hint for column headers and inputs. */
export function unitHint(metric: MetricDto): string {
  switch (metric.unit) {
    case 'paise':
      return '₹';
    case 'percent':
      return '%';
    case 'pp':
      return 'pp';
    case 'multiple':
      return '×';
    case 'sessions':
      return 'sessions';
    case 'days':
      return 'days';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// URL state: a screen is shareable as a link
// ---------------------------------------------------------------------------

/** base64url(JSON) — what the server's `decodeFilterParam` reads back. */
export function encodeFilter(filter: FilterNode): string {
  const json = JSON.stringify(filter);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The canonical stock-page path for a symbol (lowercase, encoded). */
export function stockHref(symbol: string): string {
  return `/stocks/${encodeURIComponent(symbol.toLowerCase())}`;
}
