'use client';

import { formatPaise } from '@equitywise/shared';
import { DownloadIcon } from 'lucide-react';
import * as React from 'react';
import { MetricHint } from '@/components/data-display/metric-card';
import { PriceChange } from '@/components/market/numeric';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PortfolioTaxDto, TaxRowDto } from '@/lib/portfolio-types';
import { cn } from '@/lib/utils';
import { longDate } from './portfolio-client';
import { TERM_LABEL } from './returns-view';

/**
 * The Tax tab: one financial year of shares removed, split into short and long
 * term, with this year's loss set-off, the long-term exemption, the 2018 rule and
 * an indicative figure. Not tax advice; every assumption is on the page.
 */

function Tile({
  label,
  hint,
  children,
  footer,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface p-3 shadow-subtle">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        <MetricHint>{hint}</MetricHint>
      </div>
      <div className="text-lg font-semibold tabular-nums">{children}</div>
      {footer !== undefined && <div className="text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}

const money = (p: number) => formatPaise(p, { decimals: 0 });

function CostCell({ row }: { row: TaxRowDto }) {
  return (
    <span className="flex flex-col items-end">
      <span>{money(row.costUsedPaise)}</span>
      {row.grandfathered && row.fmvPaise !== null && (
        <span className="text-xs text-muted-foreground">
          2018 rule: paid {money(row.actualCostPaise)}, 31 Jan 2018 value {money(row.fmvPaise)}
        </span>
      )}
      {row.bonus && <span className="text-xs text-muted-foreground">Bonus shares: cost nil</span>}
      {row.fmvMissing && (
        <span className="text-xs text-muted-foreground">
          No 31 Jan 2018 price found: 2018 rule not applied
        </span>
      )}
    </span>
  );
}

export function TaxTab({ tax }: { tax: PortfolioTaxDto }) {
  // Open on the newest year that has sales; the current year when none do.
  const [year, setYear] = React.useState(
    tax.years.find((fy) => (tax.byYear[fy]?.rows.length ?? 0) > 0) ?? tax.years[0] ?? '',
  );
  const y = tax.byYear[year];
  if (y === undefined) return null;
  const longTermBeforeExemption = y.netLongTermPaise;
  const carried = y.carryForward.reduce((a, l) => a + l.shortTermPaise + l.longTermPaise, 0);
  const broughtForward = y.broughtForwardShortTermPaise + y.broughtForwardLongTermPaise;
  const missingFmv = y.rows.filter((r) => r.fmvMissing).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <fieldset className="inline-flex flex-wrap gap-0.5 rounded-md border-0 bg-muted p-0.5">
          <legend className="sr-only">Financial year</legend>
          {tax.years.map((fy) => (
            <button
              key={fy}
              type="button"
              aria-pressed={fy === year}
              onClick={() => setYear(fy)}
              className={cn(
                'rounded-sm px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring',
                fy === year
                  ? 'bg-surface text-foreground shadow-subtle'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              FY {fy}
            </button>
          ))}
        </fieldset>
        {y.rows.length > 0 && (
          <Button asChild size="sm" variant="outline">
            <a href={`/api/portfolio/tax?year=${year}`} download>
              <DownloadIcon /> Export for my accountant (CSV)
            </a>
          </Button>
        )}
      </div>

      <p role="note" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
        Indicative, from the entries you made. Not tax advice and not a tax return: surcharge,
        transfer expenses, your other income and losses from shares not recorded here are not
        included. Check with a chartered accountant.
      </p>
      {!tax.fmvLoaded && (
        <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          31 Jan 2018 prices are not loaded yet, so the 2018 rule is not applied to shares acquired
          before February 2018.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Short-term gain"
          hint="Shares held 12 months or less. Taxed at 20% for sales from 23 Jul 2024, 15% before. After this year's losses."
          footer={
            y.shortTermLossesPaise > 0
              ? `After ${money(y.shortTermLossesPaise)} of short-term losses`
              : 'Held 12 months or less'
          }
        >
          <PriceChange paise={y.netShortTermPaise} />
        </Tile>
        <Tile
          label="Long-term gain"
          hint="Shares held more than 12 months. The first ₹1.25 lakh in a year is exempt (₹1 lakh before FY 2024-25); the rest is taxed at 12.5% (10% before 23 Jul 2024)."
          footer={`Exemption used ${money(y.exemptionUsedPaise)} of ${money(y.exemptionPaise)}`}
        >
          <PriceChange paise={longTermBeforeExemption} />
        </Tile>
        <Tile
          label="Indicative tax"
          hint="The rates above on what is left after set-off and the exemption, plus 4% health and education cess. No surcharge."
          footer={`Includes ${money(y.cessPaise)} cess`}
        >
          {money(y.totalTaxPaise)}
        </Tile>
        <Tile
          label="Intraday (same day)"
          hint="Added and removed on the same day. Usually business income, taxed at your slab rate, so it is shown apart and not counted above."
          footer="Not in the figures above"
        >
          <PriceChange paise={y.intradayPaise} />
        </Tile>
      </div>

      {missingFmv > 0 && tax.fmvLoaded && (
        <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {missingFmv === 1 ? 'One sale' : `${missingFmv} sales`} of shares acquired before February
          2018 had no 31 Jan 2018 price on record (the stock may not have traded on NSE that day, or
          has changed name), so the 2018 rule is not applied and the gain may be overstated.
        </p>
      )}

      {(broughtForward > 0 || carried > 0) && (
        <section className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-sm shadow-subtle">
          <h2 className="flex items-center gap-1 text-sm font-semibold">
            Losses from other years
            <MetricHint>
              A capital loss that a year cannot use is carried forward for up to 8 years, and must
              be set off against the next gains, even gains within the exemption. This assumes each
              return was filed on time and counts only the years recorded here.
            </MetricHint>
          </h2>
          {broughtForward > 0 && (
            <p className="tabular-nums">
              Brought into FY {year}: {money(broughtForward)} (short term{' '}
              {money(y.broughtForwardShortTermPaise)}, long term{' '}
              {money(y.broughtForwardLongTermPaise)}). Used this year:{' '}
              {money(y.broughtForwardUsedPaise)}.
            </p>
          )}
          {carried > 0 && (
            <p className="tabular-nums">
              Carried into the next year: {money(carried)}
              {y.carryForward.length > 0 &&
                ` (${y.carryForward
                  .map((l) => `FY ${l.year}: ${money(l.shortTermPaise + l.longTermPaise)}`)
                  .join(', ')})`}
              .
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-subtle">
        <h2 className="text-sm font-semibold">
          Shares removed in FY {year} ({y.rows.length})
        </h2>
        {y.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shares removed in this financial year.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Shares removed in FY {year}, matched to same-day additions first, then oldest
                  purchases
                </caption>
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-medium">
                      Stock
                    </th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">
                      Acquired
                    </th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">
                      Disposed
                    </th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                      Shares
                    </th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">
                      Term
                    </th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                      Cost used
                    </th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                      Proceeds
                    </th>
                    <th scope="col" className="py-1.5 text-right font-medium">
                      Gain
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {y.rows.map((r) => (
                    <tr
                      key={`${r.symbol}${r.acquiredOn}${r.removedOn}${r.shares}${r.proceedsPaise}`}
                      className="align-top"
                    >
                      <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                        {r.symbol}
                      </th>
                      <td className="py-1.5 pr-3">{longDate(r.acquiredOn)}</td>
                      <td className="py-1.5 pr-3">{longDate(r.removedOn)}</td>
                      <td className="py-1.5 pr-3 text-right">{r.shares.toLocaleString('en-IN')}</td>
                      <td className="py-1.5 pr-3">
                        <Badge variant={r.term === 'long' ? 'neutral' : 'outline'}>
                          {TERM_LABEL[r.term]}
                        </Badge>
                        <span className="block text-xs text-muted-foreground">
                          {r.daysHeld} days
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <CostCell row={r} />
                      </td>
                      <td className="py-1.5 pr-3 text-right">{money(r.proceedsPaise)}</td>
                      <td className="py-1.5 text-right">
                        <PriceChange paise={r.gainPaise} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col divide-y divide-border md:hidden">
              {y.rows.map((r) => (
                <li
                  key={`${r.symbol}${r.acquiredOn}${r.removedOn}${r.shares}${r.proceedsPaise}`}
                  className="py-2 text-sm"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{r.symbol}</span>
                    <PriceChange paise={r.gainPaise} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                    <span>
                      {longDate(r.acquiredOn)} → {longDate(r.removedOn)}
                    </span>
                    <span>
                      {r.shares} shares · {TERM_LABEL[r.term]}
                    </span>
                    <span>
                      Cost used {money(r.costUsedPaise)}
                      {r.grandfathered ? ' (2018 rule)' : ''}
                      {r.bonus ? ' (bonus)' : ''}
                      {r.fmvMissing ? ' (no 31 Jan 2018 price: 2018 rule not applied)' : ''}
                    </span>
                    <span>Proceeds {money(r.proceedsPaise)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-subtle">
          <h2 className="flex items-center gap-1 text-sm font-semibold">
            Passing 12 months soon
            <MetricHint>
              Purchases still held that become long term within 90 days. Shown for information only.
            </MetricHint>
          </h2>
          {tax.turningLongTerm.length === 0 ? (
            <p className="text-sm text-muted-foreground">None in the next 90 days.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {tax.turningLongTerm.map((l) => (
                <li
                  key={`${l.symbol}${l.acquiredOn}`}
                  className="flex items-baseline justify-between gap-3 py-1.5 tabular-nums"
                >
                  <span className="min-w-0 truncate">
                    {l.name} · {l.shares} shares acquired {longDate(l.acquiredOn)}
                  </span>
                  <span className="shrink-0">in {l.daysToLongTerm} days</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-subtle">
          <h2 className="flex items-center gap-1 text-sm font-semibold">
            Dividends in FY {year}
            <MetricHint>
              Dividends are added to your income and taxed at your slab rate. A company deducts 10%
              TDS only when it pays you more than ₹10,000 in the year.
            </MetricHint>
          </h2>
          <div className="text-lg font-semibold tabular-nums">{money(y.dividendsPaise)}</div>
          <p className="text-xs text-muted-foreground">
            From NSE dividend records and the shares you held before each ex-date.
          </p>
        </section>
      </div>

      <details className="rounded-lg border border-border bg-surface p-4 shadow-subtle">
        <summary className="cursor-pointer text-sm font-semibold">How this is worked out</summary>
        <ul className="mt-3 flex max-w-prose list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>
            Removed shares are matched first to shares added the same day (an intraday trade), then
            to your oldest purchases (FIFO). Long term means held more than 12 months.
          </li>
          <li>
            Rates by the date of sale: from 23 Jul 2024, 20% short term and 12.5% long term; before
            that, 15% and 10%. The long-term exemption is ₹1.25 lakh a year from FY 2024-25, ₹1 lakh
            before. 4% cess is added.
          </li>
          <li>
            Losses: a short-term loss reduces short-term gains first, then long-term gains; a
            long-term loss reduces only long-term gains. This year&apos;s losses are used first,
            then earlier years&apos; losses (up to 8 years old, oldest first), then the exemption.
            Earlier years count only from the entries recorded here, and assume each return was
            filed on time.
          </li>
          <li>
            Shares acquired before 1 Feb 2018 and disposed of as long term use the higher of what
            you paid and the lower of the 31 Jan 2018 value (that day&apos;s highest price) and the
            sale value.
          </li>
          <li>
            Bonus shares cost nothing and are held from the bonus date, including bonus shares
            inside an opening balance with an earlier acquired date. Splits change the count only.
          </li>
          <li>
            Same-day trades are shown apart: they are usually business income. Surcharge is not
            included.
          </li>
          <li>
            These are indicative figures from your entries, not tax advice. Check with a chartered
            accountant.
          </li>
        </ul>
      </details>
    </div>
  );
}
