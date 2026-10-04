import { formatPaise } from '@equitywise/shared';
import { type Formatted, formatMetric } from '@/lib/screener-format';
import type { MetricDto, ScreenerCellValue } from '@/lib/screener-types';

/**
 * The stock page's ratio board, as data (client-safe, no React): each tile's
 * label, formatted value, a visual cue and one line of context. The board
 * renders these; the CSV export writes the same text, so the file always
 * says what the screen says.
 *
 * Cues are drawn only from stored values — a meter for bounded readings, a
 * centre-zero bar for signed moves, a ribbon for the 52-week range. No cue is
 * a judgement; colours follow the value's sign, never an opinion.
 */

type Values = Readonly<Record<string, ScreenerCellValue>>;

export type Cue =
  | {
      readonly kind: 'meter';
      readonly value: number;
      readonly min: number;
      readonly max: number;
      /** Reference ticks, e.g. RSI 30/70 or 1× on relative volume. */
      readonly ticks: readonly number[];
      /** A second marker to compare against, e.g. the 20-session average. */
      readonly compare: number | null;
    }
  | { readonly kind: 'diverge'; readonly value: number; readonly scale: number }
  | { readonly kind: 'range'; readonly low: number; readonly high: number; readonly value: number };

export interface RatioTile {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly value: Formatted;
  readonly cue: Cue | null;
  readonly context: string | null;
}

/** Bounded readings drawn as a 0–max meter, with their reference ticks. */
const METERS: Readonly<Record<string, { max: number; ticks: readonly number[] }>> = {
  rsRank: { max: 100, ticks: [50] },
  rsi14: { max: 100, ticks: [30, 70] },
  stochK: { max: 100, ticks: [20, 80] },
  stochD: { max: 100, ticks: [20, 80] },
  adx14: { max: 60, ticks: [25] },
  plusDi: { max: 60, ticks: [] },
  minusDi: { max: 60, ticks: [] },
  deliveryPct: { max: 100, ticks: [] },
  avgDelivery20: { max: 100, ticks: [] },
  promoterPct: { max: 100, ticks: [50] },
  publicPct: { max: 100, ticks: [50] },
  rangePosDay: { max: 100, ticks: [50] },
  relVolume: { max: 4, ticks: [1] },
  deliveryRatio: { max: 3, ticks: [1] },
};

/** Signed moves drawn from a centre line; the scale is the move that fills half the bar. */
const DIVERGE_SCALE: Readonly<Record<string, number>> = {
  changePct: 5,
  gapPct: 5,
  ret1w: 10,
  ret1m: 20,
  ret3m: 30,
  ret6m: 50,
  ret1y: 80,
  retYtd: 60,
  dist52wHigh: 60,
  dist52wLow: 100,
  distAth: 80,
  closeVsEma20: 10,
  closeVsEma50: 20,
  closeVsSma50: 20,
  closeVsEma200: 40,
  closeVsSma200: 40,
  roc20: 20,
  rs1m: 15,
  rs3m: 25,
  rs6m: 40,
  futOiChgPct: 20,
  deliveryVsAvg: 30,
};

function num(values: Values | null, key: string): number | null {
  const v = values?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function buildTile(
  key: string,
  metrics: ReadonlyMap<string, MetricDto>,
  values: Values | null,
  extras: ReadonlyMap<string, { label: string; description: string }>,
  faceValuePaise: number | null,
): RatioTile | null {
  const f = (k: string) => formatMetric(metrics.get(k), values?.[k] ?? null);

  if (key === 'range52w') {
    const extra = extras.get(key);
    const low = num(values, 'low52w');
    const high = num(values, 'high52w');
    const close = num(values, 'close');
    const known = low !== null && high !== null;
    const position =
      known && close !== null && high > low ? ((close - low) / (high - low)) * 100 : null;
    return {
      key,
      label: extra?.label ?? '52W high / low',
      description: extra?.description ?? '',
      value: {
        text: known
          ? `${formatPaise(high, { decimals: 0 })} / ${formatPaise(low, { decimals: 0 })}`
          : '—',
        tone: null,
        badge: false,
      },
      cue:
        known && close !== null && high > low ? { kind: 'range', low, high, value: close } : null,
      context: position === null ? null : `Close at ${position.toFixed(0)}% of the range`,
    };
  }
  if (key === 'faceValue') {
    const extra = extras.get(key);
    return {
      key,
      label: extra?.label ?? 'Face value',
      description: extra?.description ?? '',
      value: {
        text: faceValuePaise === null ? '—' : formatPaise(faceValuePaise),
        tone: null,
        badge: false,
      },
      cue: null,
      context: 'Per share, NSE equity list',
    };
  }

  const metric = metrics.get(key);
  if (metric === undefined) return null;
  const value = f(key);
  const v = num(values, key);

  let cue: Cue | null = null;
  const meter = METERS[key];
  const scale = DIVERGE_SCALE[key];
  if (v !== null && meter !== undefined) {
    cue = {
      kind: 'meter',
      value: v,
      min: 0,
      max: meter.max,
      ticks: meter.ticks,
      compare: key === 'deliveryPct' ? num(values, 'avgDelivery20') : null,
    };
  } else if (v !== null && scale !== undefined) {
    cue = { kind: 'diverge', value: v, scale };
  }

  return {
    key,
    label: metric.label,
    description: metric.description,
    value,
    cue,
    context: contextFor(key, values, f),
  };
}

/** One quiet line under a tile: the companion figure that makes the value readable. */
function contextFor(
  key: string,
  values: Values | null,
  f: (k: string) => Formatted,
): string | null {
  const has = (k: string) => values?.[k] !== null && values?.[k] !== undefined;
  switch (key) {
    case 'close':
      return has('changePct') ? `${f('changePct').text} on the session` : null;
    case 'dist52wHigh':
      return has('high52w')
        ? `High ${formatPaise(num(values, 'high52w') ?? 0, { decimals: 0 })}`
        : null;
    case 'dist52wLow':
      return has('low52w')
        ? `Low ${formatPaise(num(values, 'low52w') ?? 0, { decimals: 0 })}`
        : null;
    case 'deliveryPct':
      return has('avgDelivery20') ? `20-session avg ${f('avgDelivery20').text}` : null;
    case 'relVolume':
      return has('avgVolume20') ? `Avg ${f('avgVolume20').text} shares` : null;
    case 'avgTurnover20':
      return has('turnover') ? `Today ${f('turnover').text}` : null;
    case 'rsRank':
      return has('rs3m') ? `vs Nifty 50 ${f('rs3m').text} (3M)` : null;
    case 'adx14':
      return has('plusDi') ? `+DI ${f('plusDi').text} · −DI ${f('minusDi').text}` : null;
    case 'atrPct':
      return has('atr14') ? `ATR ${f('atr14').text}` : null;
    case 'promoterPct':
      return has('promoterChgQoq') ? `${f('promoterChgQoq').text} QoQ` : null;
    case 'publicPct':
      return has('publicChgQoq') ? `${f('publicChgQoq').text} QoQ` : null;
    case 'oiBuildup':
      return has('oiBuildupStreak')
        ? `${f('oiBuildupStreak').text} session streak · OI ${f('futOiChgPct').text}`
        : null;
    case 'dividendYield':
      return has('dividendTtm') ? `${f('dividendTtm').text} a share, 12 months` : null;
    case 'dividendTtm':
      return has('dividendYield') ? `Yield ${f('dividendYield').text}` : null;
    case 'rsi14':
      return 'Wilder, 14 sessions';
    default:
      return null;
  }
}

/** Where a meter or ribbon marker sits, 0–100, clamped. */
export function cuePosition(value: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

// ---------------------------------------------------------------------------
// CSV export (stock-header plan §5.4) — the visible board and profile only;
// no price history.
// ---------------------------------------------------------------------------

function csvCell(text: string): string {
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function ratiosCsv(input: {
  readonly symbol: string;
  readonly session: string | null;
  readonly tiles: readonly RatioTile[];
  readonly profile: readonly (readonly [string, string])[];
}): string {
  const session = input.session ?? '';
  const lines = [['Section', 'Item', 'Value', 'Context', 'Session']];
  for (const t of input.tiles)
    lines.push(['Ratio', t.label, t.value.text, t.context ?? '', session]);
  for (const [label, value] of input.profile) lines.push(['Profile', label, value, '', session]);
  // A BOM so Excel reads the ₹ sign as UTF-8.
  return `﻿${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
