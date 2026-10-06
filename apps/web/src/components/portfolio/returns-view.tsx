'use client';

import { formatPaise } from '@equitywise/shared';
import { DownloadIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import * as React from 'react';
import { MetricHint } from '@/components/data-display/metric-card';
import { PercentChange, PriceChange } from '@/components/market/numeric';
import { Button } from '@/components/ui/button';
import type { PortfolioBenchmarkDto, PortfolioReturnsDto, TermKey } from '@/lib/portfolio-types';
import { cn } from '@/lib/utils';
import { BenchmarkSection } from './benchmark-view';
import { longDate } from './portfolio-client';
import { filterRange, QuarterBars, type Range, ValueChart } from './returns-charts';

/** A stock's name as a link to its own page, whether or not shares are still held. */
function StockLink({ symbol }: { symbol: string }) {
  return (
    <Link
      href={`/portfolio/${encodeURIComponent(symbol)}` as Route}
      className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {symbol}
    </Link>
  );
}

/**
 * The Returns tab: what you have made, how (realised, unrealised, dividends),
 * the yearly rate, and value over time. Every figure describes your own entries;
 * none is a forecast or a suggestion.
 */

export const TERM_LABEL: Record<TermKey, string> = {
  short: 'Short term',
  long: 'Long term',
  intraday: 'Intraday',
};

const pct = (r: number | null) => (r === null ? '—' : `${(r * 100).toFixed(1)}%`);

function Card({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-subtle',
        className,
      )}
    >
      <h2 className="flex items-center gap-1 text-sm font-semibold">
        {title}
        {hint !== undefined && <MetricHint>{hint}</MetricHint>}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', strong && 'font-semibold')}>{children}</dd>
    </div>
  );
}

export function ReturnsTab({
  returns,
  benchmark = null,
}: {
  returns: PortfolioReturnsDto;
  benchmark?: PortfolioBenchmarkDto | null;
}) {
  const { summary } = returns;
  const today = returns.series.at(-1)?.date ?? summary.trackingSince ?? '';
  const [range, setRange] = React.useState<Range>('All');
  const [allDividends, setAllDividends] = React.useState(false);
  const unrealised = returns.perHolding.reduce((a, p) => a + (p.unrealisedPaise ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Yearly return (XIRR)"
          hint="The steady yearly rate that turns every amount you put in and took out, on its own date, plus dividends, into today's value. It handles money added at different times fairly."
        >
          {summary.status === 'ok' && summary.xirr !== null ? (
            <>
              <div className="text-2xl font-semibold">
                <PercentChange value={summary.xirr * 100} />
                <span className="ml-1 text-sm font-normal text-muted-foreground">a year</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Since {summary.trackingSince === null ? '—' : longDate(summary.trackingSince)} (
                {summary.years.toFixed(1)} years)
              </p>
            </>
          ) : summary.status === 'too_short' ? (
            <p className="text-sm text-muted-foreground">
              Needs 12 months of history; yours starts{' '}
              {summary.trackingSince === null ? 'today' : longDate(summary.trackingSince)}. A yearly
              figure over a shorter time can swing wildly, so the simple return is shown instead.
            </p>
          ) : summary.status === 'no_solution' ? (
            <p className="text-sm text-muted-foreground">
              Cannot be worked out for these entries: no single yearly rate fits them.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Add your shares to see a return.</p>
          )}
        </Card>
        <Card
          title="Simple return"
          hint="Everything gained (today's value, money taken out and dividends, minus money put in) divided by money put in. It ignores how long the money was invested."
        >
          <div className="text-2xl font-semibold">
            <PercentChange
              value={summary.simpleReturn === null ? null : summary.simpleReturn * 100}
            />
          </div>
          <PriceChange paise={summary.gainPaise} className="text-sm" />
        </Card>
        <Card title="The numbers behind it">
          <dl className="text-sm">
            <Row label="Money put in">{formatPaise(summary.investedPaise, { decimals: 0 })}</Row>
            <Row label="Money taken out">
              {formatPaise(summary.withdrawnPaise, { decimals: 0 })}
            </Row>
            <Row label="Dividends received">
              {formatPaise(summary.dividendsPaise, { decimals: 0 })}
            </Row>
            <Row label="Value today" strong>
              {formatPaise(summary.valuePaise, { decimals: 0 })}
            </Row>
          </dl>
          {returns.unpricedAtCost > 0 && (
            <p className="text-xs text-muted-foreground">
              {returns.unpricedAtCost}{' '}
              {returns.unpricedAtCost === 1 ? 'holding has' : 'holdings have'} no price yet and{' '}
              {returns.unpricedAtCost === 1 ? 'is' : 'are'} counted at what you paid.
            </p>
          )}
          {summary.openingsAtCost > 0 && (
            <p className="text-xs text-muted-foreground">
              {summary.openingsAtCost}{' '}
              {summary.openingsAtCost === 1 ? 'opening balance has' : 'opening balances have'} no
              stored price on {summary.openingsAtCost === 1 ? 'its' : 'their'} date, so{' '}
              {summary.openingsAtCost === 1 ? 'it is' : 'they are'} counted at what you paid, not
              that day&apos;s market value. The yearly return can differ slightly.
            </p>
          )}
        </Card>
      </div>

      <BenchmarkSection benchmark={benchmark} summary={summary} />

      <Card
        title="Value over time"
        hint="What your holdings were worth each day (each week before the last year) against the money you had put in, less money taken out."
      >
        <div className="flex justify-end">
          <fieldset className="inline-flex gap-0.5 rounded-md border-0 bg-muted p-0.5">
            <legend className="sr-only">Range</legend>
            {(['1Y', '3Y', 'All'] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={cn(
                  'rounded-sm px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring',
                  range === r
                    ? 'bg-surface text-foreground shadow-subtle'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r}
              </button>
            ))}
          </fieldset>
        </div>
        <ValueChart points={filterRange(returns.series, range, today)} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Realised and unrealised"
          hint="Realised: gains or losses on shares you removed, matched to your oldest purchases first. Unrealised: today's value of shares still held minus what you paid for them."
        >
          <dl className="text-sm">
            <Row label="Unrealised (still held)">
              <PriceChange paise={unrealised} />
            </Row>
            <Row label="Realised, long term">
              <PriceChange paise={returns.realised.longTermPaise} />
            </Row>
            <Row label="Realised, short term">
              <PriceChange paise={returns.realised.shortTermPaise} />
            </Row>
            {returns.realised.intradayPaise !== 0 && (
              <Row label="Intraday (same day)">
                <PriceChange paise={returns.realised.intradayPaise} />
              </Row>
            )}
          </dl>
          {returns.realised.byYear.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Realised gains by financial year</caption>
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-medium">
                      Year
                    </th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                      Long term
                    </th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                      Short term
                    </th>
                    <th scope="col" className="py-1.5 text-right font-medium">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {returns.realised.byYear.map((y) => (
                    <tr key={y.year}>
                      <th
                        scope="row"
                        className="whitespace-nowrap py-1.5 pr-3 text-left font-medium"
                      >
                        FY {y.year}
                      </th>
                      <td className="py-1.5 pr-3 text-right">
                        <PriceChange paise={y.longTermPaise} showGlyph={false} />
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <PriceChange paise={y.shortTermPaise} showGlyph={false} />
                      </td>
                      <td className="py-1.5 text-right">
                        <PriceChange paise={y.totalPaise} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {returns.realised.count === 0
                ? 'Nothing removed yet.'
                : `${returns.realised.count} matched ${returns.realised.count === 1 ? 'removal' : 'removals'}. For your records; not a tax computation.`}
            </p>
            {returns.realised.count > 0 && (
              <Button asChild size="sm" variant="outline">
                <a href="/api/portfolio/realised" download>
                  <DownloadIcon /> Export realised gains (CSV)
                </a>
              </Button>
            )}
          </div>
        </Card>

        <Card
          title="Dividends received"
          hint="NSE dividend records times the shares you held at the close before each ex-date. Shares added on the ex-date do not get that dividend."
        >
          <div className="text-2xl font-semibold tabular-nums">
            {formatPaise(returns.dividends.totalPaise, { decimals: 0 })}
          </div>
          <QuarterBars quarters={returns.dividends.byQuarter} />
          {returns.dividends.unknownCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {returns.dividends.unknownCount}{' '}
              {returns.dividends.unknownCount === 1 ? 'dividend has' : 'dividends have'} no amount
              on record and {returns.dividends.unknownCount === 1 ? 'is' : 'are'} not counted.
            </p>
          )}
          {returns.dividends.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No dividends on record for your holdings since you started tracking.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border text-sm">
                {(allDividends ? returns.dividends.rows : returns.dividends.rows.slice(0, 6)).map(
                  (d) => (
                    <li
                      key={`${d.symbol}${d.exDate}`}
                      className="flex items-baseline justify-between gap-3 py-1.5"
                    >
                      <span className="min-w-0 truncate">
                        {longDate(d.exDate)} · {d.name}
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        {d.amountPaise === null ? (
                          <span className="text-muted-foreground">amount not on record</span>
                        ) : (
                          <>
                            {formatPaise(d.amountPaise, { decimals: 0 })}
                            <span className="ml-1 text-xs text-muted-foreground">
                              {d.shares} ×{' '}
                              {d.perSharePaise === null ? '—' : formatPaise(d.perSharePaise)}
                            </span>
                          </>
                        )}
                      </span>
                    </li>
                  ),
                )}
              </ul>
              {returns.dividends.rows.length > 6 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  onClick={() => setAllDividends((v) => !v)}
                >
                  {allDividends ? 'Show fewer' : `Show all ${returns.dividends.rows.length}`}
                </Button>
              )}
            </>
          )}
        </Card>
      </div>

      <Card
        title="Return by stock"
        hint="Unrealised gain on shares still held, gains on shares removed, and dividends, added up per stock. Dividend yield is the last 12 months of dividends divided by what you paid for the shares held now."
      >
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <caption className="sr-only">Return by stock</caption>
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Stock
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Unrealised
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Realised
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Dividends
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Total
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Dividend yield
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {returns.perHolding.map((p) => (
                <tr key={p.symbol}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                    <StockLink symbol={p.symbol} />
                    <span className="block text-xs font-normal text-muted-foreground">
                      {p.held ? p.name : `${p.name} · no longer held`}
                    </span>
                  </th>
                  <td className="py-1.5 pr-3 text-right">
                    {p.unrealisedPaise === null ? (
                      '—'
                    ) : (
                      <PriceChange paise={p.unrealisedPaise} showGlyph={false} />
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <PriceChange paise={p.realisedPaise} showGlyph={false} />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {formatPaise(p.dividendsPaise, { decimals: 0 })}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <PriceChange paise={p.totalPaise} />
                  </td>
                  <td className="py-1.5 text-right">{pct(p.yieldOnCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="flex flex-col divide-y divide-border md:hidden">
          {returns.perHolding.map((p) => (
            <li key={p.symbol} className="py-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  <StockLink symbol={p.symbol} />
                  {p.held ? '' : ' · no longer held'}
                </span>
                <PriceChange paise={p.totalPaise} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                <span>
                  Unrealised{' '}
                  {p.unrealisedPaise === null
                    ? '—'
                    : formatPaise(p.unrealisedPaise, { decimals: 0, signDisplay: 'exceptZero' })}
                </span>
                <span>
                  Realised{' '}
                  {formatPaise(p.realisedPaise, { decimals: 0, signDisplay: 'exceptZero' })}
                </span>
                <span>Dividends {formatPaise(p.dividendsPaise, { decimals: 0 })}</span>
                <span>Yield {pct(p.yieldOnCost)}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <details className="rounded-lg border border-border bg-surface p-4 shadow-subtle">
        <summary className="cursor-pointer text-sm font-semibold">How this is worked out</summary>
        <ul className="mt-3 flex max-w-prose list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Oldest purchase first (FIFO).</strong> When you
            remove shares, they are matched to your earliest purchases, which is how Indian tax
            rules match sales. Your average cost is worked out the same way, so after a removal it
            can differ slightly from a broker screen that keeps a running average.
          </li>
          <li>
            <strong className="text-foreground">Yearly return (XIRR)</strong> uses the date and
            amount of every purchase and removal, each dividend on its ex-date, and today&apos;s
            value. It is shown only once you have 12 months of history.
          </li>
          <li>
            <strong className="text-foreground">
              Shares you entered as &quot;Shares I own now&quot;
            </strong>{' '}
            count from the day you entered them, at that day&apos;s closing price, so the return
            reads &quot;since you started tracking&quot;. An acquisition date you give changes only
            how long you have held them.
          </li>
          <li>
            <strong className="text-foreground">Long term</strong> means held more than 12 months.
            Intraday trades (added and removed on the same day) are shown apart.
          </li>
          <li>
            <strong className="text-foreground">Data window.</strong>{' '}
            {returns.historyFrom === null
              ? 'Splits, bonuses and dividends are applied from the exchange record we hold.'
              : `Splits, bonuses and dividends are on record from ${longDate(returns.historyFrom)}. Anything earlier is not applied.`}{' '}
            Prices are daily closes; a day without a close uses the last one, and long gaps are
            marked partial.
          </li>
          <li>
            These figures describe your own entries. They are not tax advice or a recommendation.
          </li>
        </ul>
      </details>
    </div>
  );
}
