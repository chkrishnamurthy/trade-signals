'use client';

import { formatPaise } from '@equitywise/shared';
import { FileUpIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import * as React from 'react';
import { MetricHint } from '@/components/data-display/metric-card';
import { EmptyState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dividendEstimatePaise, eventLabel, shortDate } from '@/lib/portfolio-facts';
import type {
  PortfolioAnalysisDto,
  PortfolioBenchmarkDto,
  PortfolioReturnsDto,
  PortfolioRiskDto,
  PortfolioTaxDto,
  UpcomingEventDto,
} from '@/lib/portfolio-types';
import { DonutWithLegend, GainBars, ShareBar, Treemap } from './portfolio-charts';
import { longDate } from './portfolio-client';
import { PortfolioNav } from './portfolio-nav';
import { ReturnsTab } from './returns-view';
import { RiskTab } from './risk-view';
import { SummaryStrip } from './summary-strip';
import { TaxTab } from './tax-view';
import { useHashTab } from './use-hash-tab';

/**
 * Portfolio analysis — one page, four tabs (Allocation, Returns, Risk, Tax), the
 * summary pinned on top. A tab without the data it needs says what it will show
 * and what it needs. Describes the user's own numbers; never suggests what to do.
 */
const TABS = ['allocation', 'returns', 'risk', 'tax'] as const;

export function AnalysisView({
  analysis,
  returns,
  benchmark,
  tax,
  risk = null,
}: {
  analysis: PortfolioAnalysisDto;
  returns: PortfolioReturnsDto | null;
  benchmark: PortfolioBenchmarkDto | null;
  tax: PortfolioTaxDto | null;
  risk?: PortfolioRiskDto | null;
}) {
  const empty = analysis.holdingCount === 0;
  const { tab, ready, select: selectTab } = useHashTab(TABS, 'allocation');
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Portfolio analysis</PageTitle>
            <PageDescription>
              Where your money sits and what is coming up for the stocks you hold. Facts about your
              own numbers, not suggestions.
            </PageDescription>
          </PageHeading>
        </PageHeader>
        <PageContent>
          <PortfolioNav current="analysis" />
          {empty ? (
            <div className="rounded-lg border border-border bg-surface shadow-subtle">
              <EmptyState
                icon={<FileUpIcon />}
                title="Nothing to analyse yet"
                description="Add the shares you hold, by hand or from your broker's file, and this page shows how the money is spread."
                action={
                  <Button asChild>
                    <Link href={'/portfolio' as Route}>Go to Portfolio</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <SummaryStrip totals={analysis.totals} holdings={analysis.holdingCount} />
              {analysis.pricesStale && (
                <p
                  role="status"
                  className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
                >
                  These prices are not from today, so the figures may be out of date.
                </p>
              )}
              {analysis.unpriced.count > 0 && analysis.holdings.length > 0 && (
                <p
                  role="status"
                  className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
                >
                  {analysis.unpriced.count} {analysis.unpriced.count === 1 ? 'holding' : 'holdings'}{' '}
                  ({formatPaise(analysis.unpriced.costPaise, { decimals: 0 })} paid){' '}
                  {analysis.unpriced.count === 1 ? 'has' : 'have'} no price yet and{' '}
                  {analysis.unpriced.count === 1 ? 'is' : 'are'} left out of this page.
                </p>
              )}
              {/* Until the page has read the address's #fragment no tab is open, so a linked tab never shows the wrong one first. */}
              <Tabs value={ready ? tab : ''} onValueChange={selectTab}>
                <TabsList>
                  <TabsTrigger value="allocation">Allocation</TabsTrigger>
                  <TabsTrigger value="returns">Returns</TabsTrigger>
                  <TabsTrigger value="risk">Risk</TabsTrigger>
                  <TabsTrigger value="tax">Tax</TabsTrigger>
                </TabsList>
                {!ready && (
                  <div aria-hidden className="h-64 animate-pulse rounded-lg bg-surface-sunken" />
                )}
                <TabsContent value="allocation">
                  {analysis.holdings.length === 0 ? (
                    <section className="rounded-lg border border-border bg-surface p-6">
                      <h2 className="text-sm font-semibold">No prices yet</h2>
                      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                        None of your holdings has a price yet, so there is nothing to divide up.
                        Prices arrive with the next refresh during market hours, or from the last
                        stored close. Your entries are saved.
                      </p>
                    </section>
                  ) : (
                    <Allocation analysis={analysis} />
                  )}
                </TabsContent>
                <TabsContent value="returns">
                  {returns === null ? (
                    <Later
                      title="Returns"
                      shows="Your yearly return, realised and unrealised gains, dividends received and value over time."
                      needs="Add your shares first."
                    />
                  ) : (
                    <ReturnsTab returns={returns} benchmark={benchmark} />
                  )}
                </TabsContent>
                <TabsContent value="risk">
                  {risk === null ? (
                    <Later
                      title="Risk"
                      shows="How much your value moves (volatility), how closely it follows Nifty 50 (beta), the deepest fall from a high, and how your stocks move together."
                      needs="Add your shares first. Figures appear after about six months of history."
                    />
                  ) : (
                    <RiskTab risk={risk} />
                  )}
                </TabsContent>
                <TabsContent value="tax">
                  {tax === null ? (
                    <Later
                      title="Tax"
                      shows="Shares removed by financial year, short and long term, with an indicative figure."
                      needs="Add your shares first."
                    />
                  ) : (
                    <TaxTab tax={tax} />
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            This page describes the numbers you entered. It is not a recommendation, and EquityWise
            is not a SEBI-registered adviser.
          </p>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}

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
      className={`flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-subtle ${className ?? ''}`}
    >
      <h2 className="flex items-center gap-1 text-sm font-semibold">
        {title}
        {hint !== undefined && <MetricHint>{hint}</MetricHint>}
      </h2>
      {children}
    </section>
  );
}

/** Where the size groups come from, in words. */
function sizeHint(basis: PortfolioAnalysisDto['sizeBasis']): string {
  if (basis.amfiPeriod === null)
    return "AMFI's official list is not loaded yet, so size comes from NSE index membership: NIFTY 100 is large, Midcap 150 mid, and the rest small.";
  const n = basis.indexCount;
  const fallback =
    n === 0
      ? ''
      : ` ${n} ${n === 1 ? 'holding is' : 'holdings are'} not on that list and ${n === 1 ? 'is' : 'are'} sized by index membership instead.`;
  return `From AMFI's half-yearly list for the six months ended ${longDate(basis.amfiPeriod)}, under SEBI's rule: large cap is the 100 largest companies by market value, mid cap the next 150, small cap the rest.${fallback}`;
}

function Allocation({ analysis }: { analysis: PortfolioAnalysisDto }) {
  const [asTable, setAsTable] = React.useState(false);
  const sectorIndex = new Map(analysis.sectors.map((s, i) => [s.key, i]));
  const sizeIndex = new Map(analysis.sizes.map((s, i) => [s.key, i]));
  const pctText = (r: number) => `${(r * 100).toFixed(1)}%`;
  const c = analysis.concentration;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title="Where your money sits"
          hint="Each box is one holding. Its size is its share of your value; its colour is its sector. Hover a box for the numbers."
        >
          <div className="-mt-1 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={asTable}
              onClick={() => setAsTable((v) => !v)}
            >
              {asTable ? 'Show as boxes' : 'Show as a table'}
            </Button>
          </div>
          {asTable ? (
            <ShareTable holdings={analysis.holdings} />
          ) : (
            <>
              <ShareTable holdings={analysis.holdings} className="sr-only" />
              <Treemap
                ariaLabel="Treemap of holdings by share of value. The same figures follow as a table."
                items={analysis.holdings.map((h) => ({
                  key: h.symbol,
                  value: h.valuePaise,
                  label: h.symbol,
                  caption: `${pctText(h.weight)}${h.dayChangeRatio === null ? '' : ` · ${h.dayChangeRatio > 0 ? '▲' : h.dayChangeRatio < 0 ? '▼' : '→'} ${(Math.abs(h.dayChangeRatio) * 100).toFixed(1)}% today`}`,
                  colourIndex: sectorIndex.get(h.sectorGroup) ?? 0,
                  title: `${h.name}: ${pctText(h.weight)} of value, ${formatPaise(h.valuePaise, { decimals: 0 })}, ${h.sector}`,
                }))}
              />
              <p className="text-xs text-muted-foreground">
                Each colour is a sector (a stock with no sector gets its own colour).
              </p>
            </>
          )}
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <Card
            title="By sector"
            hint="NSE's industry classification for each stock. Stocks NSE has not classified are grouped as 'Not classified'."
          >
            <DonutWithLegend
              ariaLabel="Share of value by sector"
              centre={`${analysis.sectors.length} ${analysis.sectors.length === 1 ? 'sector' : 'sectors'}`}
              caption="by value"
              parts={analysis.sectors.map((s, i) => ({
                key: s.key,
                label: s.label,
                weight: s.weight,
                valuePaise: s.valuePaise,
                colourIndex: i,
              }))}
            />
          </Card>
          <Card title="By company size" hint={sizeHint(analysis.sizeBasis)}>
            <DonutWithLegend
              ariaLabel="Share of value by company size"
              centre="Size"
              caption="by value"
              parts={analysis.sizes.map((s) => ({
                key: s.key,
                label: s.label,
                weight: s.weight,
                valuePaise: s.valuePaise,
                colourIndex: sizeIndex.get(s.key) ?? 0,
              }))}
            />
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {c !== null && (
          <Card
            title="Concentration"
            hint="How much of your value depends on your biggest holdings. A description, not a judgement."
          >
            <div className="flex flex-col gap-2">
              <ShareBar label="Largest holding" detail={c.largestName} share={c.largest} />
              {c.holdings > 3 && <ShareBar label="Top 3 holdings" share={c.top3} />}
              {c.holdings > 5 && <ShareBar label="Top 5 holdings" share={c.top5} />}
            </div>
            <div className="rounded-md bg-surface-sunken px-3 py-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                Effective number of holdings
                <MetricHint>
                  If every holding were the same size this would equal how many you hold. The more
                  the money gathers in a few names, the lower it falls. Worked out as 1 ÷ the sum of
                  each weight squared.
                </MetricHint>
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {c.effectiveHoldings.toFixed(1)}{' '}
                <span className="text-sm font-normal text-muted-foreground">of {c.holdings}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Your money is spread like {c.effectiveHoldings.toFixed(1)} equal-sized holdings.
              </div>
            </div>
          </Card>
        )}
        {analysis.contributors.length > 0 && (
          <Card
            title="What moved your gain"
            hint="Gain or loss in rupees on each holding since you added it: today's value minus what you paid."
          >
            <GainBars
              rows={analysis.contributors.map((r) => ({
                key: r.symbol,
                label: r.name,
                gainPaise: r.gainPaise,
              }))}
            />
            {analysis.contributorsTotal > analysis.contributors.length && (
              <p className="text-xs text-muted-foreground">
                The {analysis.contributors.length} largest moves of {analysis.contributorsTotal}{' '}
                holdings. The full list is in the holdings table on the Overview.
              </p>
            )}
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Worth a look">
          {analysis.attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to point out right now.</p>
          ) : (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {analysis.attention.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Facts about your own list. Not a suggestion to do anything.
          </p>
        </Card>
        <Card
          title="Upcoming company events"
          hint="Results dates, board meetings, dividends, bonuses, splits, rights issues and buybacks in the next 60 days for the stocks you hold, from the exchange's calendar. It is refreshed every weekday."
        >
          <UpcomingList events={analysis.upcoming} />
        </Card>
      </div>
    </div>
  );
}

/** The treemap's figures as a table: for screen readers always, for anyone on request. */
function ShareTable({
  holdings,
  className,
}: {
  holdings: PortfolioAnalysisDto['holdings'];
  className?: string;
}) {
  return (
    <div className={className ?? 'overflow-x-auto'}>
      <table className="w-full text-sm">
        <caption className="sr-only">Your holdings by share of value</caption>
        <thead className="text-left text-xs text-muted-foreground uppercase tracking-wide">
          <tr>
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Stock
            </th>
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Sector
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              Value
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Share
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border tabular-nums">
          {[...holdings]
            .sort((a, b) => b.valuePaise - a.valuePaise)
            .map((h) => (
              <tr key={h.symbol}>
                <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                  {h.name}
                </th>
                <td className="py-1.5 pr-3 text-muted-foreground">{h.sector}</td>
                <td className="py-1.5 pr-3 text-right">
                  {formatPaise(h.valuePaise, { decimals: 0 })}
                </td>
                <td className="py-1.5 text-right">{(h.weight * 100).toFixed(1)}%</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function UpcomingList({ events }: { events: readonly UpcomingEventDto[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        None of your stocks has a results date, board meeting, dividend, split, bonus, rights issue
        or buyback on the exchange&apos;s calendar for the next 60 days. Companies usually announce
        these only a few weeks ahead, so this fills in as they do.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border text-sm">
      {events.map((e) => {
        const est = dividendEstimatePaise(e);
        return (
          <li
            key={`${e.symbol}${e.eventType}${e.eventDate}`}
            className="flex items-start justify-between gap-3 py-2"
          >
            <div className="min-w-0">
              <div className="font-medium">
                {shortDate(e.eventDate)} · {e.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {eventLabel(e.eventType)}
                {e.title !== '' && e.title !== eventLabel(e.eventType) ? ` · ${e.title}` : ''}
              </div>
            </div>
            {e.dividendPaise !== null && (
              <div className="shrink-0 text-right text-xs tabular-nums">
                <div>{formatPaise(e.dividendPaise)} a share</div>
                <div className="text-muted-foreground">
                  {est !== null
                    ? `about ${formatPaise(est, { decimals: 0 })} for you`
                    : e.shareChangeBefore !== null
                      ? `after the ${e.shareChangeBefore.kind} on ${shortDate(e.shareChangeBefore.date)}`
                      : ''}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Later({ title, shows, needs }: { title: string; shows: string; needs: string }) {
  return (
    <section className="rounded-lg border border-dashed border-border bg-surface p-6">
      <h2 className="text-sm font-semibold">{title} is coming in a later update</h2>
      <p className="mt-2 max-w-prose text-sm">{shows}</p>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">{needs}</p>
    </section>
  );
}
