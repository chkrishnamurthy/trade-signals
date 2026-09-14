/**
 * Pure transforms for the Institutional Flow page.
 *
 * No DB, no clock, no React — just data in, data out — so every branch is
 * unit-testable. Money stays in integer PAISE; the presentation layer converts
 * to ₹ crore at the boundary.
 */

import type { DealDto, FiiDiiDayDto } from '@/lib/disclosure-types';

export interface FlowPoint {
  /** `YYYY-MM-DD` IST trading date. */
  readonly date: string;
  /** Net value in paise (positive = net buying). */
  readonly value: number;
}

/**
 * A participant's daily net series, oldest → newest.
 *
 * `fiiDii` arrives newest-first (as the server returns it); a chart reads left
 * to right in time, so it is reversed here. Days where that participant has no
 * row are skipped rather than plotted as zero — absent is not flat.
 */
export function netSeries(
  fiiDii: readonly FiiDiiDayDto[],
  participant: 'fii' | 'dii',
): FlowPoint[] {
  const out: FlowPoint[] = [];
  for (let i = fiiDii.length - 1; i >= 0; i -= 1) {
    const day = fiiDii[i];
    if (day === undefined) continue;
    const side = participant === 'fii' ? day.fii : day.dii;
    if (side === null) continue;
    out.push({ date: day.tradingDate, value: side.net });
  }
  return out;
}

/** Running total of a net series, same dates. */
export function cumulativeSeries(series: readonly FlowPoint[]): FlowPoint[] {
  let running = 0;
  return series.map((point) => {
    running += point.value;
    return { date: point.date, value: running };
  });
}

export interface ClientFlow {
  readonly client: string;
  /** Net paise across the window (buy value − sell value). */
  readonly net: number;
  readonly buyValue: number;
  readonly sellValue: number;
  readonly deals: number;
}

/**
 * Aggregates deals by trading party, netting buys against sells.
 *
 * Party names are free text ("Morgan Stanley" vs "MORGAN STANLEY ASIA"), so
 * grouping is by a normalised key and is necessarily approximate — the first
 * spelling seen is used for display. Sorted by net, most net buying first.
 */
export function aggregateByClient(deals: readonly DealDto[]): ClientFlow[] {
  const byKey = new Map<string, { display: string; buy: number; sell: number; count: number }>();
  for (const deal of deals) {
    const key = deal.clientName.trim().replace(/\s+/g, ' ').toUpperCase();
    if (key === '') continue;
    const entry = byKey.get(key) ?? { display: deal.clientName.trim(), buy: 0, sell: 0, count: 0 };
    if (deal.side === 'buy') entry.buy += deal.value;
    else entry.sell += deal.value;
    entry.count += 1;
    byKey.set(key, entry);
  }

  return [...byKey.values()]
    .map((entry) => ({
      client: entry.display,
      net: entry.buy - entry.sell,
      buyValue: entry.buy,
      sellValue: entry.sell,
      deals: entry.count,
    }))
    .sort((a, b) => b.net - a.net || (a.client < b.client ? -1 : 1));
}

export type DealSideFilter = 'all' | 'buy' | 'sell';
export type DealTypeFilter = 'all' | 'bulk' | 'block';

export interface DealFilters {
  readonly side: DealSideFilter;
  readonly type: DealTypeFilter;
  /** Minimum deal value in paise. 0 = no minimum. */
  readonly minValue: number;
  /** Only deals on/after this `YYYY-MM-DD`, or null for any. */
  readonly since: string | null;
}

export const NO_DEAL_FILTERS: DealFilters = {
  side: 'all',
  type: 'all',
  minValue: 0,
  since: null,
};

/** Applies the deal filters. Pure; preserves input order. */
export function filterDeals(deals: readonly DealDto[], filters: DealFilters): DealDto[] {
  return deals.filter((deal) => {
    if (filters.side !== 'all' && deal.side !== filters.side) return false;
    if (filters.type !== 'all' && deal.dealType !== filters.type) return false;
    if (filters.minValue > 0 && deal.value < filters.minValue) return false;
    if (filters.since !== null && deal.tradingDate < filters.since) return false;
    return true;
  });
}
