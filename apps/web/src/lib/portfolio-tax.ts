import {
  benchmarkReplay,
  type DailyCloseInput,
  type DerivedPortfolio,
  type DividendRecordInput,
  dividendsReceived,
  financialYear,
  indexGrowth,
  type PortfolioEntry,
  periodReturns,
  type ShareChange,
  samplePoints,
  summariseReturns,
  summariseTaxYear,
  summariseTaxYears,
  type TaxRealisation,
  taxLots,
  taxYears,
  timeWeightedGrowth,
  unrealisedByTerm,
  valueOpenLots,
  valueSeries,
} from '@equitywise/core';
import { pastOfHoldings } from './portfolio-past';
import { priceLookup } from './portfolio-returns';
import type {
  BenchmarkIndexDto,
  GrowthPointDto,
  OpenLotDto,
  PortfolioBenchmarkDto,
  PortfolioHoldingDto,
  PortfolioTaxDto,
  TaxRowDto,
  TaxYearDto,
} from './portfolio-types';

/** The benchmark indices, in display order. Price indices: no dividends. */
export const BENCHMARKS = [
  { symbol: 'NIFTY50', name: 'Nifty 50', key: 'nifty50' },
  { symbol: 'NIFTY500', name: 'Nifty 500', key: 'nifty500' },
] as const;

export function composeBenchmark(input: {
  readonly entries: readonly PortfolioEntry[];
  readonly changes: readonly ShareChange[];
  readonly closes: ReadonlyMap<number, readonly DailyCloseInput[]>;
  /** Index symbol → its daily closes (paise). */
  readonly indexCloses: ReadonlyMap<string, readonly DailyCloseInput[]>;
  /** Today's value of what is held (as the Returns tab counts it). */
  readonly valuePaise: number;
  /** Today's holdings, for the past-prices comparison. */
  readonly holdings: readonly PortfolioHoldingDto[];
  readonly today: string;
}): PortfolioBenchmarkDto {
  const priceOn = priceLookup(input.closes);
  const daily = valueSeries({
    entries: input.entries,
    changes: input.changes,
    closes: input.closes,
    to: input.today,
    priceOn,
  });
  const yours = timeWeightedGrowth(daily);
  const from = yours[0]?.date ?? input.today;
  const indexSeries = new Map<string, ReturnType<typeof indexGrowth>>(
    BENCHMARKS.map((b) => [
      b.symbol,
      indexGrowth(input.indexCloses.get(b.symbol) ?? [], from, input.today),
    ]),
  );

  // Holdings value at the end of a day: the first session on or after it, which
  // includes that day's entries (a removal on a holiday shows on the next session).
  const valueAfter = (date: string) => daily.find((p) => p.date >= date)?.valuePaise ?? null;

  const indices: BenchmarkIndexDto[] = BENCHMARKS.map((b) => {
    const closes = input.indexCloses.get(b.symbol) ?? [];
    const lookup = priceLookup(new Map([[0, closes]]));
    const replay =
      closes.length === 0
        ? null
        : benchmarkReplay({
            entries: input.entries,
            priceOn,
            indexOn: (date) => lookup(0, date),
            indexFrom: closes[0]?.date ?? null,
            valueAfter,
            today: input.today,
          });
    return {
      symbol: b.symbol,
      name: b.name,
      replay:
        replay === null
          ? null
          : {
              investedPaise: replay.investedPaise,
              withdrawnPaise: replay.withdrawnPaise,
              valuePaise: replay.valuePaise,
              simpleReturn: replay.simpleReturn,
              xirr: replay.xirr,
              status: replay.status,
              indexFrom: replay.indexFrom,
            },
      periods: periodReturns(indexSeries.get(b.symbol) ?? [], input.today),
    };
  });

  // One row per portfolio session, each index carried forward to that date.
  const carried = (symbol: string) => {
    const series = indexSeries.get(symbol) ?? [];
    let i = 0;
    let last: number | null = null;
    return (date: string) => {
      while (i < series.length && (series[i]?.date ?? '') <= date) {
        last = series[i]?.value ?? last;
        i++;
      }
      return last;
    };
  };
  const n50 = carried('NIFTY50');
  const n500 = carried('NIFTY500');
  const growth: GrowthPointDto[] = yours.map((p) => ({
    date: p.date,
    yours: p.value,
    nifty50: n50(p.date),
    nifty500: n500(p.date),
  }));

  const past = pastOfHoldings({
    holdings: input.holdings,
    changes: input.changes,
    closes: input.closes,
    today: input.today,
  });
  const pastGrowth = timeWeightedGrowth(past.points);
  const pastFrom = pastGrowth[0]?.date ?? null;
  const pastIndex = new Map<string, ReturnType<typeof indexGrowth>>(
    BENCHMARKS.map((b) => [
      b.symbol,
      pastFrom === null
        ? []
        : indexGrowth(input.indexCloses.get(b.symbol) ?? [], pastFrom, input.today),
    ]),
  );
  const carriedPast = (symbol: string) => {
    const series = pastIndex.get(symbol) ?? [];
    let i = 0;
    let last: number | null = null;
    return (date: string) => {
      while (i < series.length && (series[i]?.date ?? '') <= date) {
        last = series[i]?.value ?? last;
        i++;
      }
      return last;
    };
  };
  const p50 = carriedPast('NIFTY50');
  const p500 = carriedPast('NIFTY500');
  const pastPrices =
    pastFrom === null
      ? null
      : {
          from: pastFrom,
          growth: samplePoints(
            pastGrowth.map((p) => ({
              date: p.date,
              yours: p.value,
              nifty50: p50(p.date),
              nifty500: p500(p.date),
            })),
            input.today,
          ),
          yours: periodReturns(pastGrowth, input.today),
          indices: BENCHMARKS.map((b) => ({
            symbol: b.symbol,
            name: b.name,
            periods: periodReturns(pastIndex.get(b.symbol) ?? [], input.today),
          })),
          leftOut: past.leftOut,
        };

  // Dividends left out, as a price index leaves them out.
  const priceOnly = summariseReturns({
    entries: input.entries,
    dividends: [],
    valuePaise: input.valuePaise,
    today: input.today,
    priceOn,
  });
  return {
    indices,
    yoursPriceOnly: {
      simpleReturn: priceOnly.simpleReturn,
      xirr: priceOnly.xirr,
      status: priceOnly.status,
    },
    from: priceOnly.trackingSince,
    periods: periodReturns(yours, input.today),
    growth: samplePoints(growth, input.today),
    available: indices.some((i) => i.replay !== null),
    pastPrices,
  };
}

const termKey = (r: TaxRealisation) => (r.intraday ? ('intraday' as const) : r.term);

export function composeTax(input: {
  readonly entries: readonly PortfolioEntry[];
  readonly changes: readonly ShareChange[];
  readonly derived: DerivedPortfolio;
  readonly names: ReadonlyMap<number, { readonly symbol: string; readonly name: string }>;
  readonly isins: ReadonlyMap<number, string>;
  readonly fmv2018: ReadonlyMap<number, number>;
  readonly fmvLoaded: boolean;
  readonly dividendRecords: readonly DividendRecordInput[];
  /** Today's holdings, to value the lots still held. */
  readonly holdings: readonly PortfolioHoldingDto[];
  readonly today: string;
}): PortfolioTaxDto {
  const { realisations, open } = taxLots(input.entries, input.changes, input.fmv2018);
  const current = financialYear(input.today);
  const years = [...new Set([current, ...taxYears(realisations)])].sort().reverse();
  const dividends = dividendsReceived(input.entries, input.changes, input.dividendRecords);
  const label = (id: number) => input.names.get(id) ?? { symbol: '', name: '' };

  const summaries = summariseTaxYears(realisations, current);
  const byYear: Record<string, TaxYearDto> = {};
  for (const year of years) {
    const summary = summaries.get(year) ?? summariseTaxYear([], year);
    const rows: TaxRowDto[] = realisations
      .filter((r) => r.financialYear === year)
      .map((r) => ({
        ...label(r.instrumentId),
        isin: input.isins.get(r.instrumentId) ?? null,
        acquiredOn: r.acquiredOn,
        removedOn: r.removedOn,
        shares: r.shares,
        actualCostPaise: r.actualCostPaise,
        costUsedPaise: r.costUsedPaise,
        fmvPaise: r.fmvPaise,
        proceedsPaise: r.proceedsPaise,
        gainPaise: r.gainPaise,
        daysHeld: r.daysHeld,
        term: termKey(r),
        bonus: r.bonus,
        grandfathered: r.grandfathered,
        fmvMissing: r.fmvMissing,
      }))
      .reverse();
    byYear[year] = {
      ...summary,
      carryForward: summary.carryForward.map((l) => ({ ...l })),
      dividendsPaise: dividends
        .filter((d) => financialYear(d.exDate) === year && d.amountPaise !== null)
        .reduce((a, d) => a + (d.amountPaise ?? 0), 0),
      rows,
    };
  }

  const valued = valueOpenLots(
    open,
    new Map(
      input.holdings.map((h) => [h.instrumentId, { valuePaise: h.valuePaise, shares: h.shares }]),
    ),
    input.today,
  );
  const openLots: OpenLotDto[] = valued
    .map((lot) => ({
      ...label(lot.instrumentId),
      isin: input.isins.get(lot.instrumentId) ?? null,
      acquiredOn: lot.acquiredOn,
      trackedFrom: lot.trackedFrom,
      shares: lot.shares,
      costPaise: lot.costPaise,
      fmvPaise: lot.fmvPaise,
      valuePaise: lot.valuePaise,
      costUsedPaise: lot.costUsedPaise,
      gainPaise: lot.gainPaise,
      daysHeld: lot.daysHeld,
      term: lot.term,
      daysToLongTerm: lot.daysToLongTerm,
      bonus: lot.bonus,
      grandfathered: lot.grandfathered,
      fmvMissing: lot.fmvMissing,
    }))
    .sort((a, b) =>
      a.symbol !== b.symbol ? (a.symbol < b.symbol ? -1 : 1) : a.acquiredOn < b.acquiredOn ? -1 : 1,
    );
  const totals = unrealisedByTerm(valued);
  // From the tax lots, so bonus shares count from their own date.
  const turningLongTerm = openLots
    .filter((lot) => lot.daysToLongTerm > 0 && lot.daysToLongTerm <= 90)
    .map((lot) => ({
      symbol: lot.symbol,
      name: lot.name,
      acquiredOn: lot.acquiredOn,
      shares: lot.shares,
      costPaise: lot.costPaise,
      daysToLongTerm: lot.daysToLongTerm,
    }))
    .sort((a, b) => a.daysToLongTerm - b.daysToLongTerm);

  return {
    years,
    byYear,
    fmvLoaded: input.fmvLoaded,
    turningLongTerm,
    openLots,
    unrealised: { short: { ...totals.short }, long: { ...totals.long }, unpriced: totals.unpriced },
  };
}

/** One financial year's sales as CSV, laid out like the long-term gains schedule (s.112A). */
export function taxCsv(year: TaxYearDto): string {
  const rupees = (p: number) => {
    const sign = p < 0 ? '-' : '';
    const abs = Math.abs(p);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  };
  const perShare = (total: number, shares: number) =>
    shares > 0 ? rupees(Math.round(total / shares)) : '';
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const term = { short: 'Short term', long: 'Long term', intraday: 'Intraday' } as const;
  const header = [
    'ISIN',
    'Stock',
    'Name',
    'Acquired',
    'Disposed',
    'Shares',
    'Sale price a share (Rs)',
    'Full value of consideration (Rs)',
    'Cost of acquisition (Rs)',
    'FMV a share on 31 Jan 2018 (Rs)',
    'Total FMV (Rs)',
    'Cost used (Rs)',
    'Gain (Rs)',
    'Days held',
    'Term',
    'Bonus shares',
    'Note',
  ];
  const lines = year.rows.map((r) =>
    [
      q(r.isin ?? ''),
      q(r.symbol),
      q(r.name),
      r.acquiredOn,
      r.removedOn,
      String(r.shares),
      perShare(r.proceedsPaise, r.shares),
      rupees(r.proceedsPaise),
      rupees(r.actualCostPaise),
      r.fmvPaise === null ? '' : perShare(r.fmvPaise, r.shares),
      r.fmvPaise === null ? '' : rupees(r.fmvPaise),
      rupees(r.costUsedPaise),
      rupees(r.gainPaise),
      String(r.daysHeld),
      term[r.term],
      r.bonus ? 'Yes' : 'No',
      q(r.fmvMissing ? '31 Jan 2018 price not found; 2018 rule not applied' : ''),
    ].join(','),
  );
  return [
    `"FY ${year.year}. Indicative, for your accountant. Not tax advice or a tax computation. Same-day additions first, then oldest purchase first; transfer expenses not included."`,
    header.join(','),
    ...lines,
    ...(year.broughtForwardUsedPaise > 0
      ? [
          `"Losses from earlier years set off this year (from the years recorded in EquityWise): Rs ${rupees(year.broughtForwardUsedPaise)}"`,
        ]
      : []),
  ].join('\n');
}

/** The day a lot becomes long term: the day after its first anniversary. */
function longTermFrom(acquiredOn: string): string {
  const a = new Date(`${acquiredOn}T00:00:00Z`);
  return new Date(Date.UTC(a.getUTCFullYear() + 1, a.getUTCMonth(), a.getUTCDate() + 1))
    .toISOString()
    .slice(0, 10);
}

/** Every lot still held as CSV, for the user's accountant. Indicative; not a tax computation. */
export function openLotsCsv(lots: readonly OpenLotDto[], today: string): string {
  const rupees = (p: number) => {
    const sign = p < 0 ? '-' : '';
    const abs = Math.abs(p);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  };
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = [
    'ISIN',
    'Stock',
    'Name',
    'Acquired',
    'Shares',
    'Cost of acquisition (Rs)',
    'FMV a share on 31 Jan 2018 (Rs)',
    'Total FMV (Rs)',
    'Value today (Rs)',
    'Cost used today (Rs)',
    'Unrealised gain (Rs)',
    'Days held',
    'Term today',
    'Long term from',
    'Bonus shares',
    'Note',
  ];
  const lines = lots.map((l) =>
    [
      q(l.isin ?? ''),
      q(l.symbol),
      q(l.name),
      l.acquiredOn,
      String(l.shares),
      rupees(l.costPaise),
      l.fmvPaise === null || l.shares <= 0 ? '' : rupees(Math.round(l.fmvPaise / l.shares)),
      l.fmvPaise === null ? '' : rupees(l.fmvPaise),
      l.valuePaise === null ? '' : rupees(l.valuePaise),
      rupees(l.costUsedPaise),
      l.gainPaise === null ? '' : rupees(l.gainPaise),
      String(l.daysHeld),
      l.term === 'long' ? 'Long term' : 'Short term',
      l.term === 'long' ? '' : longTermFrom(l.acquiredOn),
      l.bonus ? 'Yes' : 'No',
      q(
        [
          l.valuePaise === null ? 'No price today' : '',
          l.fmvMissing ? '31 Jan 2018 price not found; 2018 rule not applied' : '',
        ]
          .filter((x) => x !== '')
          .join('; '),
      ),
    ].join(','),
  );
  return [
    `"Shares still held on ${today}. Indicative, for your accountant. Not tax advice or a tax computation. Bonus shares are their own lots from the bonus date; transfer expenses not included."`,
    header.join(','),
    ...lines,
  ].join('\n');
}
