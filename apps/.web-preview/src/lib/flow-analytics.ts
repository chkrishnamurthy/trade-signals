/**
 * Pure transforms for the Institutional Flow page.
 *
 * No DB, no clock, no React — just data in, data out — so every branch is
 * unit-testable. Money stays in integer PAISE; the presentation layer converts
 * to ₹ crore at the boundary.
 */

import type { DealDto, FiiDiiDayDto } from '@/lib/disclosure-types';

/** One participant's cash-market figures, paise. */
export interface FlowSide {
  readonly buy: number;
  readonly sell: number;
  readonly net: number;
}

/**
 * One bar pair on the FII/DII chart: a single session, or a calendar month
 * of sessions summed.
 *
 * A participant with no reported session in the bar is `null`, never zero —
 * absent is not flat.
 */
export interface FlowBar {
  /** `YYYY-MM-DD` for a session, `YYYY-MM` for a month. */
  readonly key: string;
  readonly firstDate: string;
  readonly lastDate: string;
  readonly sessions: number;
  readonly fii: FlowSide | null;
  readonly dii: FlowSide | null;
}

/**
 * The latest `limit` sessions as bars, oldest → newest.
 *
 * `fiiDii` arrives newest-first (as the server returns it); a chart reads left
 * to right in time, so it is reversed here.
 */
export function sessionBars(fiiDii: readonly FiiDiiDayDto[], limit: number): FlowBar[] {
  return fiiDii
    .slice(0, Math.max(0, limit))
    .reverse()
    .map((day) => ({
      key: day.tradingDate,
      firstDate: day.tradingDate,
      lastDate: day.tradingDate,
      sessions: 1,
      fii: day.fii,
      dii: day.dii,
    }));
}

/**
 * Sessions summed into calendar months, oldest → newest. Buy, sell and net
 * are each summed over the sessions the participant reported. The first and
 * last months can be partial — history starts, or the month is still running
 * — which is why each bar carries its session count.
 */
export function monthBars(fiiDii: readonly FiiDiiDayDto[]): FlowBar[] {
  const out: {
    key: string;
    first: string;
    last: string;
    n: number;
    fii: FlowSide | null;
    dii: FlowSide | null;
  }[] = [];
  for (let i = fiiDii.length - 1; i >= 0; i -= 1) {
    const day = fiiDii[i];
    if (day === undefined) continue;
    const key = day.tradingDate.slice(0, 7);
    let month = out.at(-1);
    if (month === undefined || month.key !== key) {
      month = { key, first: day.tradingDate, last: day.tradingDate, n: 0, fii: null, dii: null };
      out.push(month);
    }
    month.last = day.tradingDate;
    month.n += 1;
    month.fii = addSide(month.fii, day.fii);
    month.dii = addSide(month.dii, day.dii);
  }
  return out.map((m) => ({
    key: m.key,
    firstDate: m.first,
    lastDate: m.last,
    sessions: m.n,
    fii: m.fii,
    dii: m.dii,
  }));
}

function addSide(total: FlowSide | null, day: FlowSide | null): FlowSide | null {
  if (day === null) return total;
  if (total === null) return { buy: day.buy, sell: day.sell, net: day.net };
  return { buy: total.buy + day.buy, sell: total.sell + day.sell, net: total.net + day.net };
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
