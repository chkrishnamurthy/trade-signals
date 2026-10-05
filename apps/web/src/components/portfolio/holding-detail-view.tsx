'use client';

import { formatPaise } from '@equitywise/shared';
import { ArrowLeftIcon, ExternalLinkIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { MetricCard } from '@/components/data-display/metric-card';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageActions,
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
  Section,
} from '@/components/layout/page';
import { PercentChange, Price, PriceChange } from '@/components/market/numeric';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { HoldingDetailDto } from '@/lib/portfolio-types';
import { EntryRows } from './entry-edit';
import { longDate, pctText } from './portfolio-client';
import { TERM_LABEL } from './returns-view';

/**
 * One holding in full: the user's own numbers for a single stock, each entry behind
 * them, and a way back to the stock page. Describes; never suggests.
 */
export function HoldingDetailView({ detail }: { detail: HoldingDetailDto }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const { holding: h } = detail;
  const refresh = React.useCallback(() => router.refresh(), [router]);

  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <Link
              href={'/portfolio' as Route}
              className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" /> My portfolio
            </Link>
            <PageTitle>{h.name}</PageTitle>
            <PageDescription>
              {h.symbol} · NSE · {h.shares.toLocaleString('en-IN')} shares you hold
            </PageDescription>
          </PageHeading>
          <PageActions>
            <Button asChild size="sm" variant="outline">
              <Link href={`/stocks/${h.symbol}` as Route}>
                <ExternalLinkIcon /> Open the stock page
              </Link>
            </Button>
          </PageActions>
        </PageHeader>

        <PageContent>
          {detail.pricesStale && (
            <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
              This price is not from today, so values may be out of date.
            </p>
          )}
          <Section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Value"
              hint="Shares you hold times the latest price we have."
              value={
                <span className="text-2xl font-semibold tabular-nums">
                  {h.valuePaise === null ? '—' : formatPaise(h.valuePaise, { decimals: 0 })}
                </span>
              }
              footer={
                h.ltpPaise === null
                  ? 'No price yet'
                  : `${formatPaise(h.ltpPaise)} a share${h.priceSource === 'close' && h.priceAsOf !== null ? `, close of ${longDate(h.priceAsOf.slice(0, 10))}` : ''}`
              }
            />
            <MetricCard
              label="Today"
              hint="How much this holding moved since yesterday's close."
              value={
                h.dayChangePaise === null ? (
                  <span className="text-2xl">—</span>
                ) : (
                  <PriceChange
                    paise={h.dayChangePaise}
                    percent={h.dayChangeRatio === null ? null : h.dayChangeRatio * 100}
                    size="lg"
                  />
                )
              }
            />
            <MetricCard
              label="Total gain"
              hint="What these shares are worth now minus what you paid. It leaves out shares you removed and dividends."
              value={
                h.gainPaise === null ? (
                  <span className="text-2xl">—</span>
                ) : (
                  <PriceChange
                    paise={h.gainPaise}
                    percent={h.gainRatio === null ? null : h.gainRatio * 100}
                    size="lg"
                  />
                )
              }
            />
            <MetricCard
              label="You paid"
              hint="The total spent on the shares you still hold, with any charges you entered."
              value={
                <span className="text-2xl font-semibold tabular-nums">
                  {formatPaise(h.costPaise, { decimals: 0 })}
                </span>
              }
              footer={`Average ${formatPaise(h.avgCostPaise)} a share`}
            />
          </Section>

          <Section
            aria-labelledby="facts-h"
            className="rounded-lg border border-border bg-surface p-4 shadow-subtle"
          >
            <h2 id="facts-h" className="mb-3 text-sm font-semibold">
              Facts about this holding
            </h2>
            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <Fact label="Number of shares">{h.shares.toLocaleString('en-IN')}</Fact>
              <Fact label="Average cost">{formatPaise(h.avgCostPaise)}</Fact>
              <Fact label="Last price">
                {h.ltpPaise === null ? 'No price yet' : <Price paise={h.ltpPaise} />}
              </Fact>
              <Fact label="Share of your portfolio">
                {detail.portfolioWeight === null ? '—' : pctText(detail.portfolioWeight)}
              </Fact>
              <Fact label="52-week range">
                {detail.low52wPaise === null || detail.high52wPaise === null
                  ? '—'
                  : `${formatPaise(detail.low52wPaise)} to ${formatPaise(detail.high52wPaise)}`}
              </Fact>
              <Fact label="Today">
                {h.dayChangeRatio === null ? '—' : <PercentChange value={h.dayChangeRatio * 100} />}
              </Fact>
            </dl>
            {h.historyGapBefore !== null && (
              <p className="mt-3 text-xs text-muted-foreground">
                Splits and bonuses before {longDate(h.historyGapBefore)} are not on record. If this
                stock had one before then, the share count here may be off: edit the entry to match
                your broker.
              </p>
            )}
            {h.adjustments.map((a) => (
              <p key={`${a.kind}${a.exDate}`} className="mt-3 text-xs text-muted-foreground">
                Share count adjusted for a {a.kind} with ex-date {longDate(a.exDate)}, from the
                exchange record.
              </p>
            ))}
          </Section>

          <Section
            aria-labelledby="lots-h"
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-subtle"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="lots-h" className="text-sm font-semibold">
                Purchases still held ({detail.lots.length})
              </h2>
              {detail.totalReturnPaise !== null && (
                <span className="text-sm">
                  Return on this stock, all in: <PriceChange paise={detail.totalReturnPaise} />
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Purchases of {h.name} still held, oldest first
                </caption>
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-medium">
                      Acquired
                    </th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                      Shares
                    </th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                      Cost
                    </th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                      Days held
                    </th>
                    <th scope="col" className="py-1.5 font-medium">
                      Term
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {detail.lots.map((lot) => (
                    <tr key={`${lot.acquiredOn}${lot.trackedFrom}${lot.shares}${lot.costPaise}`}>
                      <td className="py-1.5 pr-3">
                        {longDate(lot.acquiredOn)}
                        {lot.trackedFrom !== lot.acquiredOn && (
                          <span className="block text-xs text-muted-foreground">
                            entered {longDate(lot.trackedFrom)}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        {lot.shares.toLocaleString('en-IN')}
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        {formatPaise(lot.costPaise, { decimals: 0 })}
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        {lot.daysHeld.toLocaleString('en-IN')}
                      </td>
                      <td className="py-1.5">
                        {lot.daysToLongTerm === 0 ? (
                          <Badge variant="neutral">Long term</Badge>
                        ) : (
                          <Badge variant="outline">
                            Short term · long term in {lot.daysToLongTerm} days
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Removed shares are taken from the oldest purchase first. Long term means held more
              than 12 months.
            </p>
          </Section>

          {detail.realised.length > 0 && (
            <Section
              aria-labelledby="realised-h"
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-subtle"
            >
              <h2 id="realised-h" className="text-sm font-semibold">
                Shares removed ({detail.realised.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Shares of {h.name} removed, matched to purchases
                  </caption>
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-1.5 pr-3 font-medium">
                        Removed
                      </th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">
                        Acquired
                      </th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                        Shares
                      </th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                        Proceeds
                      </th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                        Gain
                      </th>
                      <th scope="col" className="py-1.5 font-medium">
                        Term
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border tabular-nums">
                    {detail.realised.map((r) => (
                      <tr key={`${r.removedOn}${r.acquiredOn}${r.shares}${r.proceedsPaise}`}>
                        <td className="py-1.5 pr-3">{longDate(r.removedOn)}</td>
                        <td className="py-1.5 pr-3">{longDate(r.acquiredOn)}</td>
                        <td className="py-1.5 pr-3 text-right">
                          {r.shares.toLocaleString('en-IN')}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          {formatPaise(r.proceedsPaise, { decimals: 0 })}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          <PriceChange paise={r.gainPaise} />
                        </td>
                        <td className="py-1.5">{TERM_LABEL[r.term]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {detail.dividends.length > 0 && (
            <Section
              aria-labelledby="dividends-h"
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-subtle"
            >
              <h2 id="dividends-h" className="text-sm font-semibold">
                Dividends received:{' '}
                {formatPaise(
                  detail.dividends.reduce((a, d) => a + (d.amountPaise ?? 0), 0),
                  { decimals: 0 },
                )}
              </h2>
              <ul className="divide-y divide-border text-sm">
                {detail.dividends.map((d) => (
                  <li
                    key={d.exDate}
                    className="flex items-baseline justify-between gap-3 py-1.5 tabular-nums"
                  >
                    <span>{longDate(d.exDate)}</span>
                    <span>
                      {d.amountPaise === null
                        ? 'amount not on record'
                        : `${formatPaise(d.amountPaise, { decimals: 0 })} (${d.shares} × ${d.perSharePaise === null ? '—' : formatPaise(d.perSharePaise)})`}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section aria-labelledby="entries-h" className="flex flex-col gap-2">
            <h2 id="entries-h" className="text-sm font-semibold">
              Your entries for {h.symbol} ({detail.entries.length})
            </h2>
            {error !== null && (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <EntryRows
              entries={detail.entries}
              onChanged={refresh}
              onError={setError}
              className="divide-y divide-border overflow-auto rounded-lg border border-border bg-surface text-sm shadow-subtle"
            />
            <p className="text-xs text-muted-foreground">
              Your holding is worked out from these entries. Fix a number here and everything above
              updates.
            </p>
          </Section>

          <p className="text-xs text-muted-foreground">
            This page describes the numbers you entered. It is not a recommendation, and EquityWise
            is not a SEBI-registered adviser.
          </p>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}
