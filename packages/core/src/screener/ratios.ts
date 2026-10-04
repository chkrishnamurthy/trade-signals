/**
 * The stock page's ratio board (docs/planning/stock-header-redesign-plan.md §4,
 * §5.3): which tiles a viewer sees, in what order.
 *
 * A layout is a list of keys — catalogue metric keys plus two profile tiles
 * that are not screenable metrics (the 52-week range and face value). One
 * layout per user, shared by every stock.
 */

import { catalogueFor, isMetricKey } from './catalogue.js';

/** Tiles that read the snapshot or reference data but are not catalogue metrics. */
export const RATIO_EXTRAS = {
  range52w: {
    label: '52W high / low',
    description: 'Highest and lowest close of the last 252 sessions; the marker is today’s close.',
  },
  faceValue: {
    label: 'Face value',
    description: 'Face value per share, from NSE’s equity list.',
  },
} as const;
export type RatioExtraKey = keyof typeof RATIO_EXTRAS;

export function isRatioExtraKey(key: string): key is RatioExtraKey {
  return Object.hasOwn(RATIO_EXTRAS, key);
}

export const RATIO_LIMITS = { min: 3, max: 30 } as const;

export const DEFAULT_RATIO_KEYS: readonly string[] = [
  'close',
  'range52w',
  'faceValue',
  'dist52wHigh',
  'dist52wLow',
  'ret1y',
  'ret1m',
  'ret3m',
  'rsRank',
  'rsi14',
  'adx14',
  'dividendYield',
  'avgTurnover20',
  'relVolume',
  'deliveryPct',
  'atrPct',
  'promoterPct',
  'publicPct',
];

/** For an F&O stock with no saved layout, futures context replaces ATR %. */
export const DEFAULT_RATIO_KEYS_FNO: readonly string[] = DEFAULT_RATIO_KEYS.map((k) =>
  k === 'atrPct' ? 'oiBuildup' : k,
);

export function defaultRatioKeys(fnoEligible: boolean): readonly string[] {
  return fnoEligible ? DEFAULT_RATIO_KEYS_FNO : DEFAULT_RATIO_KEYS;
}

/**
 * A saved or submitted layout, made safe to render: unknown keys (a metric
 * later removed) and keys this viewer may not see are dropped, duplicates
 * keep their first place, and the list is capped. Returns null when fewer
 * than the minimum survive, so the caller falls back to the default.
 */
export function normaliseRatioKeys(keys: readonly unknown[], isAdmin: boolean): string[] | null {
  const visible = new Set(catalogueFor(isAdmin).map((d) => d.key as string));
  const out: string[] = [];
  for (const key of keys) {
    if (typeof key !== 'string' || out.includes(key)) continue;
    if (isRatioExtraKey(key) || (isMetricKey(key) && visible.has(key))) out.push(key);
    if (out.length === RATIO_LIMITS.max) break;
  }
  return out.length < RATIO_LIMITS.min ? null : out;
}
