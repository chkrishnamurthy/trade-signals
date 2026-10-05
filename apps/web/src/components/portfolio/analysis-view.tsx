'use client';

import { formatPaise } from '@equitywise/shared';
import { FileUpIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
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
import type { PortfolioAnalysisDto, UpcomingEventDto } from '@/lib/portfolio-types';
import { DonutWithLegend, GainBars, ShareBar, Treemap } from './portfolio-charts';
import { PortfolioNav } from './portfolio-nav';
import { SummaryStrip } from './summary-strip';

/**
 * Portfolio analysis — one page, four tabs, the summary pinned on top. Phase 2
 * fills Allocation; Returns, Risk and Tax say what they will show and what they
 * need. Describes the user's own numbers; never suggests what to do.
 */
export function AnalysisView({ analysis }: { analysis: PortfolioAnalysisDto }) {
  const empty = analysis.holdingCount === 0;
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
                    <Link href={'/portfolio' as Route}>Go to My portfolio</Link>
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
              <Tabs defaultValue="allocation">
                <TabsList className="mb-3 flex w-full justify-start overflow-x-auto sm:w-auto">
                  <TabsTrigger value="allocation">Allocation</TabsTrigger>
                  <TabsTrigger value="returns">Returns</TabsTrigger>
                  <TabsTrigger value="risk">Risk</TabsTrigger>
                  <TabsTrigger value="tax">Tax</TabsTrigger>
                </TabsList>
                <TabsContent value="allocation">
                  <Allocation analysis={analysis} />
                </TabsContent>
                <TabsContent value="returns">
                  <Later
                    title="Returns"
                    shows="Your yearly return (XIRR) beside the same money in Nifty 50 and Nifty 500, value over time, and dividends received."
                    needs="It needs the date of each purchase. Entries from a trade list already have them; a holdings file gives today's date only."
                  />
                </TabsContent>
                <TabsContent value="risk">
                  <Later
                    title="Risk"
                    shows="How much your value moves (volatility), how closely it follows Nifty 50 (beta), the deepest fall from a high, and how your stocks move together."
                    needs="It needs about six months of history behind your holdings."
                  />
                </TabsContent>
                <TabsContent value="tax">
                  <Later
                    title="Tax"
                    shows="Shares you removed this financial year, split into short and long term, with the 2018 grandfathering rule applied and an indicative figure. Not tax advice."
                    needs="It needs at least one removed-shares entry with the date of the original purchase."
                  />
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

function Allocation({ analysis }: { analysis: PortfolioAnalysisDto }) {
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
          <Treemap
            ariaLabel="Treemap of holdings by share of value"
            items={analysis.holdings.map((h) => ({
              key: h.symbol,
              value: h.valuePaise,
              label: h.symbol,
              caption: `${pctText(h.weight)}${h.dayChangeRatio === null ? '' : ` · ${h.dayChangeRatio > 0 ? '▲' : h.dayChangeRatio < 0 ? '▼' : '→'} ${(Math.abs(h.dayChangeRatio) * 100).toFixed(1)}% today`}`,
              colourIndex: sectorIndex.get(h.sector) ?? 0,
              title: `${h.name}: ${pctText(h.weight)} of value, ${formatPaise(h.valuePaise, { decimals: 0 })}, ${h.sector}`,
            }))}
          />
          <p className="text-xs text-muted-foreground">Colours match the sector list beside.</p>
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
          <Card
            title="By company size (by index)"
            hint="Size from NSE index membership: NIFTY 100 is large, Midcap 150 mid, Smallcap 250 small, Microcap 250 micro. A stand-in for the official SEBI/AMFI list."
          >
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
          title="Coming up"
          hint="Results, dividends, bonuses, splits, rights issues and buybacks in the next 60 days for the stocks you hold, from the exchange calendar."
        >
          <UpcomingList events={analysis.upcoming} />
        </Card>
      </div>
    </div>
  );
}

export function UpcomingList({ events }: { events: readonly UpcomingEventDto[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing on the calendar for your holdings in the next 60 days.
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
            {est !== null && e.dividendPaise !== null && (
              <div className="shrink-0 text-right text-xs tabular-nums">
                <div>{formatPaise(e.dividendPaise)} a share</div>
                <div className="text-muted-foreground">
                  about {formatPaise(est, { decimals: 0 })} for you
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
