import {
  adjustedShares,
  type DailyCloseInput,
  type DerivedPortfolio,
  type DividendRecordInput,
  daysHeldBetween,
  dividendsReceived,
  dividendYieldOnCost,
  financialYear,
  type PortfolioEntry,
  type PriceLookup,
  type ShareChange,
  samplePoints,
  summariseRealised,
  summariseReturns,
  termOf,
  valueSeries,
} from '@equitywise/core';
import type {
  DividendRowDto,
  LotDto,
  PerHoldingReturnDto,
  PortfolioHoldingDto,
  PortfolioReturnsDto,
  PurchaseDto,
  RealisedRowDto,
  ReturnSummaryDto,
} from './portfolio-types';

/**
 * Phase 3 returns, assembled from the user's entries, the derived lots, stored
 * daily closes and dividend records. Pure: the server loads, this composes, so
 * every figure here is unit-tested without a database.
 */

export interface ReturnsInput {
  readonly entries: readonly PortfolioEntry[];
  readonly names: ReadonlyMap<number, { readonly symbol: string; readonly name: string }>;
  readonly changes: readonly ShareChange[];
  readonly derived: DerivedPortfolio;
  /** The overview's valued holdings (today's value, unrealised gain). */
  readonly holdings: readonly PortfolioHoldingDto[];
  readonly closes: ReadonlyMap<number, readonly DailyCloseInput[]>;
  readonly dividendRecords: readonly DividendRecordInput[];
  readonly today: string;
  readonly historyFrom: string | null;
}

/** The last close on or before a date, from the loaded closes. */
export function priceLookup(closes: ReadonlyMap<number, readonly DailyCloseInput[]>): PriceLookup {
  return (instrumentId, date) => {
    const list = closes.get(instrumentId);
    if (list === undefined) return null;
    let found: number | null = null;
    for (const c of list) {
      if (c.date > date) break;
      found = c.closePaise;
    }
    return found;
  };
}

const quarterOf = (date: string) => {
  const month = Number(date.slice(5, 7));
  return `${date.slice(0, 4)} Q${Math.floor((month - 1) / 3) + 1}`;
};

/** Every quarter from the first to the last with a dividend, empty ones as zero, so bars keep time. */
export function fillQuarters(
  byQuarter: ReadonlyMap<string, number>,
): { label: string; amountPaise: number }[] {
  const keys = [...byQuarter.keys()].sort();
  const first = keys[0];
  const last = keys.at(-1);
  if (first === undefined || last === undefined) return [];
  const out: { label: string; amountPaise: number }[] = [];
  let year = Number(first.slice(0, 4));
  let quarter = Number(first.slice(-1));
  for (;;) {
    const label = `${year} Q${quarter}`;
    out.push({ label, amountPaise: byQuarter.get(label) ?? 0 });
    if (label === last) break;
    quarter += 1;
    if (quarter > 4) {
      quarter = 1;
      year += 1;
    }
  }
  return out;
}

/** Today's value for returns: priced holdings at their price, unpriced ones at what was paid. */
export function valueForReturns(holdings: readonly PortfolioHoldingDto[]): {
  valuePaise: number;
  unpriced: number;
} {
  let value = 0;
  let unpriced = 0;
  for (const h of holdings) {
    if (h.valuePaise === null) {
      value += h.costPaise;
      unpriced += 1;
    } else value += h.valuePaise;
  }
  return { valuePaise: value, unpriced };
}

export function headlineReturn(
  input: Omit<ReturnsInput, 'derived' | 'names' | 'historyFrom'>,
): ReturnSummaryDto {
  const dividends = dividendsReceived(input.entries, input.changes, input.dividendRecords);
  const { valuePaise } = valueForReturns(input.holdings);
  return summariseReturns({
    entries: input.entries,
    dividends,
    valuePaise,
    today: input.today,
    priceOn: priceLookup(input.closes),
  });
}

export function composeReturns(input: ReturnsInput): PortfolioReturnsDto {
  const label = (id: number) => input.names.get(id) ?? { symbol: '', name: '' };
  const priceOn = priceLookup(input.closes);
  const dividends = dividendsReceived(input.entries, input.changes, input.dividendRecords);
  const { valuePaise, unpriced } = valueForReturns(input.holdings);
  const summary = summariseReturns({
    entries: input.entries,
    dividends,
    valuePaise,
    today: input.today,
    priceOn,
  });

  const realised = summariseRealised(input.derived.realisations);
  const realisedRows: RealisedRowDto[] = input.derived.realisations
    .map((r) => ({
      ...label(r.instrumentId),
      acquiredOn: r.acquiredOn,
      removedOn: r.removedOn,
      shares: r.shares,
      costPaise: r.costPaise,
      proceedsPaise: r.proceedsPaise,
      gainPaise: r.gainPaise,
      daysHeld: r.daysHeld,
      term: r.intraday ? ('intraday' as const) : r.term,
      financialYear: financialYear(r.removedOn),
    }))
    .sort((a, b) => (a.removedOn < b.removedOn ? 1 : a.removedOn > b.removedOn ? -1 : 0));

  const byQuarter = new Map<string, number>();
  for (const d of dividends) {
    if (d.amountPaise === null) continue;
    const q = quarterOf(d.exDate);
    byQuarter.set(q, (byQuarter.get(q) ?? 0) + d.amountPaise);
  }
  const dividendRows: DividendRowDto[] = [...dividends].reverse().map((d) => ({
    ...label(d.instrumentId),
    exDate: d.exDate,
    perSharePaise: d.perSharePaise,
    shares: d.shares,
    amountPaise: d.amountPaise,
  }));

  const instruments = [...new Set(input.entries.map((e) => e.instrumentId))];
  const perHolding: PerHoldingReturnDto[] = instruments
    .map((id) => {
      const held = input.holdings.find((h) => h.instrumentId === id);
      const realisedPaise = realised.byInstrument.get(id)?.totalPaise ?? 0;
      const dividendsPaise = dividends
        .filter((d) => d.instrumentId === id && d.amountPaise !== null)
        .reduce((a, d) => a + (d.amountPaise ?? 0), 0);
      const unrealisedPaise = held?.gainPaise ?? null;
      return {
        ...label(id),
        held: held !== undefined,
        unrealisedPaise,
        realisedPaise,
        dividendsPaise,
        totalPaise: (unrealisedPaise ?? 0) + realisedPaise + dividendsPaise,
        yieldOnCost:
          held === undefined
            ? null
            : dividendYieldOnCost(dividends, id, held.costPaise, input.today),
      };
    })
    .sort((a, b) => b.totalPaise - a.totalPaise);

  const series = samplePoints(
    valueSeries({
      entries: input.entries,
      changes: input.changes,
      closes: input.closes,
      to: input.today,
      priceOn,
    }),
    input.today,
  );

  return {
    summary,
    realised: {
      shortTermPaise: realised.shortTermPaise,
      longTermPaise: realised.longTermPaise,
      intradayPaise: realised.intradayPaise,
      totalPaise: realised.totalPaise,
      count: realised.count,
      byYear: realised.byYear.map((y) => ({
        year: y.year,
        shortTermPaise: y.shortTermPaise,
        longTermPaise: y.longTermPaise,
        intradayPaise: y.intradayPaise,
        totalPaise: y.totalPaise,
        count: y.count,
      })),
    },
    realisedRows,
    dividends: {
      totalPaise: dividends.reduce((a, d) => a + (d.amountPaise ?? 0), 0),
      unknownCount: dividends.filter((d) => d.amountPaise === null).length,
      byQuarter: [...byQuarter]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([q, amountPaise]) => ({ label: q, amountPaise })),
      rows: dividendRows,
    },
    series,
    perHolding,
    historyFrom: input.historyFrom,
    unpricedAtCost: unpriced,
  };
}

/** One holding's purchases still held, with how long each has been held. */
export function lotsFor(derived: DerivedPortfolio, instrumentId: number, today: string): LotDto[] {
  const holding = derived.holdings.find((h) => h.instrumentId === instrumentId);
  return (holding?.lots ?? []).map((lot) => {
    const daysHeld = daysHeldBetween(lot.acquiredOn, today);
    let daysToLongTerm = 0;
    if (termOf(lot.acquiredOn, today) === 'short') {
      const a = new Date(`${lot.acquiredOn}T00:00:00Z`);
      const anniversary = new Date(
        Date.UTC(a.getUTCFullYear() + 1, a.getUTCMonth(), a.getUTCDate()),
      );
      daysToLongTerm = daysHeldBetween(today, anniversary.toISOString().slice(0, 10)) + 1;
    }
    return {
      acquiredOn: lot.acquiredOn,
      trackedFrom: lot.trackedFrom,
      shares: lot.shares,
      costPaise: lot.costPaise,
      daysHeld,
      daysToLongTerm,
    };
  });
}

/** Realised rows as CSV for the user's records. Integer paise written as rupees with two decimals. */
export function realisedCsv(rows: readonly RealisedRowDto[]): string {
  const rupees = (p: number) => {
    const sign = p < 0 ? '-' : '';
    const abs = Math.abs(p);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  };
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const term = { short: 'Short term', long: 'Long term', intraday: 'Intraday' } as const;
  const header = [
    'Stock',
    'Name',
    'Acquired',
    'Removed',
    'Shares',
    'Cost (Rs)',
    'Proceeds (Rs)',
    'Gain (Rs)',
    'Days held',
    'Term',
    'Financial year',
  ];
  const lines = rows.map((r) =>
    [
      q(r.symbol),
      q(r.name),
      r.acquiredOn,
      r.removedOn,
      String(r.shares),
      rupees(r.costPaise),
      rupees(r.proceedsPaise),
      rupees(r.gainPaise),
      String(r.daysHeld),
      term[r.term],
      `FY ${r.financialYear}`,
    ].join(','),
  );
  return [
    '"For your records. Not a tax computation. Matched oldest purchase first (FIFO)."',
    header.join(','),
    ...lines,
  ].join('\n');
}

/**
 * Each purchase of one stock, oldest acquisition first, with what was later
 * removed from it (same-day additions first, then FIFO) and what is left.
 * Shares are on today's basis.
 */
export function purchaseHistory(
  entries: readonly PortfolioEntry[],
  changes: readonly ShareChange[],
  derived: DerivedPortfolio,
  instrumentId: number,
): PurchaseDto[] {
  const mine = changes.filter((c) => c.instrumentId === instrumentId);
  const lots = derived.holdings.find((h) => h.instrumentId === instrumentId)?.lots ?? [];
  return entries
    .filter((e) => e.instrumentId === instrumentId && e.kind !== 'remove')
    .map((e) => ({
      acquiredOn: e.acquiredOn ?? e.tradeDate,
      trackedFrom: e.tradeDate,
      shares: adjustedShares(e.shares, e.tradeDate, mine),
      costPaise: e.amountPaise,
      removed: derived.realisations
        .filter((r) => r.lotEntryId === e.id)
        .map((r) => ({
          removedOn: r.removedOn,
          shares: r.shares,
          proceedsPaise: r.proceedsPaise,
          gainPaise: r.gainPaise,
          term: r.intraday ? ('intraday' as const) : r.term,
        })),
      leftShares: lots.find((l) => l.entryId === e.id)?.shares ?? 0,
    }))
    .sort((a, b) =>
      a.acquiredOn !== b.acquiredOn
        ? a.acquiredOn < b.acquiredOn
          ? -1
          : 1
        : a.trackedFrom < b.trackedFrom
          ? -1
          : a.trackedFrom > b.trackedFrom
            ? 1
            : 0,
    );
}

/**
 * Set when shares were entered on a date before the corporate-action record
 * begins: a split or bonus between that date and the record's start is missing,
 * so the share count may be off. The date that matters is the one the user's
 * count is true on (the entry date), not the date the shares were first
 * acquired: an opening balance typed today for shares bought in 2016 is already
 * on today's basis, with nothing missing.
 */
export function historyGapBefore(
  lots: readonly { readonly trackedFrom: string }[],
  historyFrom: string | null,
): string | null {
  return historyFrom !== null && lots.some((lot) => lot.trackedFrom < historyFrom)
    ? historyFrom
    : null;
}
