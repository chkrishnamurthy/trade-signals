'use client';

import { formatPaise } from '@equitywise/shared';
import { MetricHint } from '@/components/data-display/metric-card';
import { PercentChange } from '@/components/market/numeric';
import type { PeriodKeyDto, PortfolioBenchmarkDto, ReturnSummaryDto } from '@/lib/portfolio-types';
import { longDate } from './portfolio-client';
import { LinesChart } from './returns-charts';

const PERIODS: { key: PeriodKeyDto; label: string }[] = [
  { key: '1M', label: '1 month' },
  { key: '3M', label: '3 months' },
  { key: '6M', label: '6 months' },
  { key: '1Y', label: '1 year' },
  { key: 'all', label: 'Since you started' },
];

function Pct({ value }: { value: number | null }) {
  return value === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <PercentChange value={value * 100} />
  );
}

function yearly(status: string, xirr: number | null, simple: number | null) {
  if (status === 'ok' && xirr !== null) return { value: xirr, label: 'a year (XIRR)' };
  return { value: simple, label: 'simple return' };
}

/**
 * The user's return beside the same money in Nifty 50 and Nifty 500. Both
 * indices are price indices (no dividends); the period table and chart use the
 * time-weighted return, which also leaves dividends out, so they compare like
 * for like. A comparison, not a judgement.
 */
export function BenchmarkSection({
  benchmark,
  summary,
}: {
  benchmark: PortfolioBenchmarkDto | null;
  summary: ReturnSummaryDto;
}) {
  if (benchmark === null || !benchmark.available) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted-foreground">
        Nifty 50 and Nifty 500 history is not loaded yet, so there is nothing to compare with. It
        fills from the exchange&apos;s daily index file.
      </section>
    );
  }
  // Like for like: a price index pays no dividends, so yours are left out here too.
  const yours = yearly(
    benchmark.yoursPriceOnly.status,
    benchmark.yoursPriceOnly.xirr,
    benchmark.yoursPriceOnly.simpleReturn,
  );
  const withDividends = yearly(summary.status, summary.xirr, summary.simpleReturn);
  const n50 = benchmark.indices.find((i) => i.symbol === 'NIFTY50');
  const n500 = benchmark.indices.find((i) => i.symbol === 'NIFTY500');
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-subtle">
      <h2 className="flex items-center gap-1 text-sm font-semibold">
        Compared with the market
        <MetricHint>
          &quot;Same money&quot; puts every amount you added into the index on the same day, and
          each time you took money out, takes out the same share of the index as you took of your
          holdings. Nifty 50 and Nifty 500 here are price indices, without dividends.
        </MetricHint>
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md bg-surface-sunken p-3">
          <div className="text-xs text-muted-foreground">Your holdings</div>
          <div className="text-xl font-semibold">
            <Pct value={yours.value} />
          </div>
          <div className="text-xs text-muted-foreground">
            {yours.label}, without dividends
            {withDividends.value !== null && (
              <>
                {' · '}
                <span className="tabular-nums">
                  {(withDividends.value * 100).toFixed(2)}% with them
                </span>
              </>
            )}
          </div>
        </div>
        {[n50, n500].map((idx) =>
          idx === undefined ? null : (
            <div key={idx.symbol} className="rounded-md bg-surface-sunken p-3">
              <div className="text-xs text-muted-foreground">Same money in {idx.name}</div>
              {idx.replay === null ? (
                <div className="text-sm text-muted-foreground">History not loaded</div>
              ) : idx.replay.status === 'no_history' ? (
                <div className="text-sm text-muted-foreground">
                  {idx.replay.indexFrom === null || benchmark.from === null
                    ? 'History not loaded'
                    : `History here starts ${longDate(idx.replay.indexFrom)}, after your first entry on ${longDate(benchmark.from)}. No comparison until it is loaded.`}
                </div>
              ) : (
                <>
                  <div className="text-xl font-semibold">
                    <Pct
                      value={
                        yearly(idx.replay.status, idx.replay.xirr, idx.replay.simpleReturn).value
                      }
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {yearly(idx.replay.status, idx.replay.xirr, idx.replay.simpleReturn).label} ·
                    worth {formatPaise(idx.replay.valuePaise, { decimals: 0 })} today
                  </div>
                </>
              )}
            </div>
          ),
        )}
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Growth of 100
          <MetricHint>
            How 100 would have grown in your holdings, ignoring when you added or took out money (a
            time-weighted return), next to the indices from the same start. Dividends are left out
            on both sides.
          </MetricHint>
        </h3>
        <LinesChart
          ariaLabel="Growth of 100 in your holdings, Nifty 50 and Nifty 500"
          dates={benchmark.growth.map((g) => g.date)}
          format={(v) => v.toFixed(0)}
          series={[
            {
              key: 'yours',
              label: 'Your holdings',
              colour: 'var(--chart-1)',
              values: benchmark.growth.map((g) => g.yours),
            },
            {
              key: 'n50',
              label: 'Nifty 50',
              colour: 'var(--chart-2)',
              dash: '6 4',
              values: benchmark.growth.map((g) => g.nifty50),
            },
            {
              key: 'n500',
              label: 'Nifty 500',
              colour: 'var(--chart-3)',
              dash: '2 3',
              values: benchmark.growth.map((g) => g.nifty500),
            },
          ]}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Returns over periods: your holdings, Nifty 50 and Nifty 500
          </caption>
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Period
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                Your holdings
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                Nifty 50
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Nifty 500
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {PERIODS.map((p) => (
              <tr key={p.key}>
                <th scope="row" className="whitespace-nowrap py-1.5 pr-3 text-left font-medium">
                  {p.label}
                </th>
                <td className="py-1.5 pr-3 text-right">
                  <Pct value={benchmark.periods[p.key]} />
                </td>
                <td className="py-1.5 pr-3 text-right">
                  <Pct value={n50?.periods[p.key] ?? null} />
                </td>
                <td className="py-1.5 text-right">
                  <Pct value={n500?.periods[p.key] ?? null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Time-weighted, not annualised, without dividends on either side. A comparison of your own
        numbers, not a recommendation.
      </p>
    </section>
  );
}
