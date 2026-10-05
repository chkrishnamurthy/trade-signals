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
  summariseTaxYear,
  type TaxRealisation,
  taxRealisations,
  taxYears,
  timeWeightedGrowth,
  valueSeries,
} from '@equitywise/core';
import { lotsFor, priceLookup } from './portfolio-returns';
import type {
  BenchmarkIndexDto,
  GrowthPointDto,
  PortfolioBenchmarkDto,
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

  return {
    indices,
    periods: periodReturns(yours, input.today),
    growth: samplePoints(growth, input.today),
    available: indices.some((i) => i.replay !== null),
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
  readonly today: string;
}): PortfolioTaxDto {
  const realisations = taxRealisations(input.entries, input.changes, input.fmv2018);
  const current = financialYear(input.today);
  const years = [...new Set([current, ...taxYears(realisations)])].sort().reverse();
  const dividends = dividendsReceived(input.entries, input.changes, input.dividendRecords);
  const label = (id: number) => input.names.get(id) ?? { symbol: '', name: '' };

  const byYear: Record<string, TaxYearDto> = {};
  for (const year of years) {
    const summary = summariseTaxYear(realisations, year);
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
      }))
      .reverse();
    byYear[year] = {
      ...summary,
      dividendsPaise: dividends
        .filter((d) => financialYear(d.exDate) === year && d.amountPaise !== null)
        .reduce((a, d) => a + (d.amountPaise ?? 0), 0),
      rows,
    };
  }

  const turningLongTerm = input.derived.holdings
    .flatMap((h) =>
      lotsFor(input.derived, h.instrumentId, input.today)
        .filter((lot) => lot.daysToLongTerm > 0 && lot.daysToLongTerm <= 90)
        .map((lot) => ({
          ...label(h.instrumentId),
          acquiredOn: lot.acquiredOn,
          shares: lot.shares,
          costPaise: lot.costPaise,
          daysToLongTerm: lot.daysToLongTerm,
        })),
    )
    .sort((a, b) => a.daysToLongTerm - b.daysToLongTerm);

  return { years, byYear, fmvLoaded: input.fmvLoaded, turningLongTerm };
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
    ].join(','),
  );
  return [
    `"FY ${year.year}. Indicative, for your accountant. Not tax advice or a tax computation. Oldest purchase first; transfer expenses not included."`,
    header.join(','),
    ...lines,
  ].join('\n');
}
