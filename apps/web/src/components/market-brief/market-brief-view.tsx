'use client';

import type { Route } from 'next';
import Link from 'next/link';
import type * as React from 'react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageActions,
  PageContainer,
  PageContent,
  PageDescription,
  PageDisclaimer,
  PageHeader,
  PageHeading,
  PageTitle,
  Section,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/layout/page';
import { PercentChange, Price } from '@/components/market/numeric';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SegmentedControl } from '@/components/ui/toggle-group';
import { Text } from '@/components/ui/typography';
import type { DailyMarketBrief } from '@/lib/market-brief';
import { encodeFilter, stockHref } from '@/lib/screener-format';
import { toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import type { LeaderDto, MarketBreadthDto } from '@/server/market-breadth';
import type { MarketBriefResponse, PersonalMoverDto } from '@/server/market-brief';
import { HighsLowsChart, ParticipationChart } from './breadth-charts';
import {
  AddToWatchlist,
  ConditionBadge,
  formatIstTimestamp,
  formatSessionDate,
  StockName,
  WatchlistChips,
} from './parts';
import {
  buildPersonalItems,
  INDUSTRY_METRICS,
  type Industry,
  type IndustryMetric,
  marketAttentionCategories,
  rankIndustries,
  signed,
} from './view-model';

type Universe = MarketBreadthDto['universe'];

function screenHref(filter: Parameters<typeof encodeFilter>[0], universe: Universe): Route {
  const query = new URLSearchParams({ f: encodeFilter(filter) });
  if (universe === 'nifty500') query.set('u', 'index:nifty500');
  return `/screener?${query.toString()}` as Route;
}

/** One market-wide read, then personal relevance and progressively deeper detail. */
export function MarketBriefView({
  brief,
  breadth,
  marketRead,
  personalMovers,
  defaultWatchlistId,
}: MarketBriefResponse) {
  const latest = breadth.history[breadth.history.length - 1];
  const watchedSymbols = useMemo(
    () => new Set(personalMovers.map((item) => item.symbol)),
    [personalMovers],
  );

  return (
    <AppShell>
      <PageContainer>
        <PageHeader className="gap-y-3">
          <PageHeading>
            <PageTitle>Market Brief</PageTitle>
            <PageDescription>
              The latest completed NSE session, from the broad market to the stocks you follow.
            </PageDescription>
            {/* Which session this is and whether it is complete: part of what
                the page is, so it reads under the title at every width. */}
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              <Badge
                variant={latest === undefined ? 'neutral' : breadth.stale ? 'warning' : 'bullish'}
              >
                {latest === undefined ? 'Unavailable' : breadth.stale ? 'Stale' : 'Complete'}
              </Badge>
              {breadth.session !== null && <span>{formatSessionDate(breadth.session)}</span>}
              {breadth.builtAt !== null && (
                <span className="max-sm:hidden">
                  · built {formatIstTimestamp(breadth.builtAt)} IST
                </span>
              )}
            </div>
          </PageHeading>
          <PageActions>
            <UniverseSelector universe={breadth.universe} />
          </PageActions>
        </PageHeader>

        <PageContent>
          {latest === undefined ? (
            <EmptyState
              title="Market breadth has not been computed yet"
              description="The brief will populate after the next completed nightly market snapshot."
            />
          ) : (
            <>
              <AtAGlance brief={brief} breadth={breadth} marketRead={marketRead} />
              <PersonalSection brief={brief} movers={personalMovers} />
              <TrendsSection breadth={breadth} />
              <IndustrySection breadth={breadth} />
              <MarketAttentionSection
                breadth={breadth}
                watchedSymbols={watchedSymbols}
                defaultWatchlistId={defaultWatchlistId}
              />
            </>
          )}

          <PageDisclaimer>
            Market-wide breadth is computed nightly from split/bonus-adjusted NSE end-of-day
            history.
          </PageDisclaimer>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}

function UniverseSelector({ universe }: { universe: Universe }) {
  return (
    <fieldset
      aria-label="Market universe"
      className="m-0 inline-flex rounded-md border-0 bg-muted p-0.5"
    >
      {(['all', 'nifty500'] as const).map((key) => (
        <Link
          key={key}
          href={(key === 'all' ? '/today' : '/today?u=nifty500') as Route}
          aria-current={universe === key ? 'page' : undefined}
          className={cn(
            'inline-flex h-(--control-sm) items-center rounded-sm px-3 font-medium text-xs',
            universe === key
              ? 'bg-surface text-foreground shadow-subtle'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {key === 'all' ? 'All NSE' : 'Nifty 500'}
        </Link>
      ))}
    </fieldset>
  );
}

function AtAGlance({
  brief,
  breadth,
  marketRead,
}: {
  brief: DailyMarketBrief;
  breadth: MarketBreadthDto;
  marketRead: MarketBriefResponse['marketRead'];
}) {
  const last = breadth.history[breadth.history.length - 1];
  const weekAgo = breadth.history[breadth.history.length - 6];
  if (last === undefined) return null;
  const directional = last.advances + last.declines;
  const adRatio = last.declines === 0 ? null : last.advances / last.declines;

  return (
    <Section aria-labelledby="market-read-heading" className="pt-0">
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-5 py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <SectionTitle id="market-read-heading">Market at a glance</SectionTitle>
                <ConditionBadge label={marketRead.label} />
              </div>
              <Text as="p" variant="body" className="text-pretty text-base leading-relaxed">
                {marketRead.headline}
              </Text>
            </div>
            <div className="rounded-md bg-surface-sunken px-4 py-3 lg:min-w-48">
              <Text as="p" variant="overline" className="normal-case">
                {brief.overview.indexName ?? 'NIFTY 50 benchmark'}
              </Text>
              <div className="mt-1">
                {brief.overview.indexReturnPercent === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <PercentChange value={brief.overview.indexReturnPercent} size="xl" />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <InsightTile
              label="Advances / declines"
              value={
                <>
                  <span className="text-bullish-strong">
                    {last.advances.toLocaleString('en-IN')}
                  </span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-bearish-strong">
                    {last.declines.toLocaleString('en-IN')}
                  </span>
                </>
              }
              hint={`${last.unchanged} unchanged · ${directional.toLocaleString('en-IN')} directional · A/D ${adRatio === null ? '—' : adRatio.toFixed(2)}`}
              href={screenHref({ metric: 'changePct', cmp: 'gt', value: 0 }, breadth.universe)}
            />
            <InsightTile
              label="Above 20 EMA"
              value={last.above20Pct === null ? '—' : `${last.above20Pct.toFixed(1)}%`}
              hint={weeklyChange(last.above20Pct, weekAgo?.above20Pct)}
              href={screenHref({ metric: 'closeVsEma20', cmp: 'gt', value: 0 }, breadth.universe)}
            />
            <InsightTile
              label="Above 200 EMA"
              value={last.above200Pct === null ? '—' : `${last.above200Pct.toFixed(1)}%`}
              hint={weeklyChange(last.above200Pct, weekAgo?.above200Pct)}
              href={screenHref({ metric: 'closeVsEma200', cmp: 'gt', value: 0 }, breadth.universe)}
            />
            <InsightTile
              label="New 52W highs / lows"
              value={
                <>
                  <span className="text-bullish-strong">{last.newHighs}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-bearish-strong">{last.newLows}</span>
                </>
              }
              hint={`Above 50 EMA ${last.above50Pct === null ? '—' : `${last.above50Pct.toFixed(1)}%`}`}
              href={screenHref({ metric: 'breakout52w', cmp: 'is', value: true }, breadth.universe)}
            />
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}

function weeklyChange(current: number | null, previous: number | null | undefined): string {
  return current === null || previous === null || previous === undefined
    ? 'of stocks with enough history'
    : `${signed(current - previous, 1, ' pp')} this week`;
}

function InsightTile({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  href: Route;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-surface px-3 py-3 shadow-subtle transition-colors hover:border-border-strong"
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="figure font-semibold text-xl tracking-tight sm:text-2xl">{value}</span>
      <span className="line-clamp-2 text-2xs text-muted-foreground">{hint}</span>
    </Link>
  );
}

function PersonalSection({
  brief,
  movers,
}: {
  brief: DailyMarketBrief;
  movers: readonly PersonalMoverDto[];
}) {
  const items = useMemo(
    () => buildPersonalItems(movers, brief.watchlists.items),
    [brief.watchlists.items, movers],
  );

  return (
    <Section aria-labelledby="personal-heading">
      <SectionHeader>
        <div>
          <SectionTitle id="personal-heading">Your stocks today</SectionTitle>
          <SectionDescription>
            Watchlist names with the most meaningful moves and changes
          </SectionDescription>
        </div>
        <Link
          href="/watchlists"
          className="font-medium text-primary-strong text-xs hover:underline"
        >
          Open watchlists
        </Link>
      </SectionHeader>
      <Card>
        <CardContent className="py-2">
          {!brief.watchlists.hasWatchlists ? (
            <EmptyState
              title="No watchlists yet"
              description="Follow a few names to connect the market brief to stocks you care about."
              action={
                <Link href="/watchlists" className="text-primary-strong underline">
                  Create a watchlist
                </Link>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="No notable watchlist changes"
              description="None of the names you follow has a completed snapshot for this session."
            />
          ) : (
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {items.map((item) => (
                <li
                  key={item.instrumentId}
                  className="flex flex-col gap-2 border-border border-b py-3"
                >
                  <div className="flex items-center gap-3">
                    <StockName symbol={item.symbol} name={item.name} className="flex-1" />
                    <Price paise={item.closePaise} size="sm" />
                    {item.sessionReturn !== null && (
                      <PercentChange value={item.sessionReturn} size="sm" />
                    )}
                  </div>
                  {item.reasons.length > 0 && (
                    <ul className="flex flex-wrap gap-1">
                      {item.reasons.slice(0, 3).map((reason) => (
                        <li key={reason}>
                          <Badge variant="outline" size="sm" className="font-normal">
                            {reason.replace(/\.$/, '')}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  <WatchlistChips refs={item.watchlists} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </Section>
  );
}

function TrendsSection({ breadth }: { breadth: MarketBreadthDto }) {
  const last = breadth.history[breadth.history.length - 1];
  return (
    <Section aria-labelledby="participation-heading">
      <SectionHeader>
        <SectionTitle id="participation-heading">Participation over time</SectionTitle>
        <SectionDescription>
          Whether today confirms or diverges from the broader trend
        </SectionDescription>
      </SectionHeader>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="flex flex-col gap-2 p-4 lg:col-span-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-sm">Stocks above their 200 EMA · 1 year</h3>
            <span className="figure text-muted-foreground text-xs">
              Latest{' '}
              {last?.above200Pct === null || last === undefined
                ? '—'
                : `${last.above200Pct.toFixed(1)}%`}
            </span>
          </div>
          <ParticipationChart history={breadth.history} />
        </Card>
        <Card className="flex flex-col gap-2 p-4 lg:col-span-2">
          <h3 className="font-semibold text-sm">New 52-week highs vs lows · 60 sessions</h3>
          <HighsLowsChart history={breadth.history.slice(-60)} />
        </Card>
      </div>
    </Section>
  );
}

function IndustrySection({ breadth }: { breadth: MarketBreadthDto }) {
  const [metric, setMetric] = useState<IndustryMetric>('ret1m');
  const { leaders, laggards } = rankIndustries(breadth.industries, metric);

  if (breadth.industries.length === 0) return null;
  return (
    <Section aria-labelledby="industry-heading">
      <SectionHeader>
        <div>
          <SectionTitle id="industry-heading">Industry leadership and weakness</SectionTitle>
          <SectionDescription>
            Median return of classified stocks in the selected universe
          </SectionDescription>
        </div>
        <SegmentedControl
          aria-label="Industry timeframe"
          value={metric}
          onValueChange={setMetric}
          options={INDUSTRY_METRICS.map((option) => ({ value: option.id, label: option.label }))}
        />
      </SectionHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <IndustryList title="Leading" rows={leaders} metric={metric} universe={breadth.universe} />
        <IndustryList
          title="Weakening"
          rows={laggards}
          metric={metric}
          universe={breadth.universe}
        />
      </div>
      <details className="rounded-lg border border-border bg-surface p-4 shadow-subtle">
        <summary className="cursor-pointer font-medium text-sm">View all industries</summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-2xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="pb-2 text-left font-medium">Industry</th>
                {INDUSTRY_METRICS.map((option) => (
                  <th key={option.id} className="pb-2 text-right font-medium">
                    {option.label}
                  </th>
                ))}
                <th className="pb-2 text-right font-medium">Above 50 EMA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {breadth.industries.map((row) => (
                <tr key={row.industry}>
                  <td className="py-2 font-medium">
                    {row.industry}{' '}
                    <span className="text-2xs text-muted-foreground">{row.stocks}</span>
                  </td>
                  {INDUSTRY_METRICS.map((option) => (
                    <td
                      key={option.id}
                      className={cn(
                        'figure py-2 text-right text-xs',
                        toneText({
                          tone:
                            (row[option.id] ?? 0) > 0
                              ? 'bullish'
                              : (row[option.id] ?? 0) < 0
                                ? 'bearish'
                                : 'neutral',
                        }),
                      )}
                    >
                      {signed(row[option.id])}
                    </td>
                  ))}
                  <td className="figure py-2 text-right text-xs">
                    {row.above50Pct === null ? '—' : `${row.above50Pct.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Section>
  );
}

function IndustryList({
  title,
  rows,
  metric,
  universe,
}: {
  title: string;
  rows: readonly Industry[];
  metric: IndustryMetric;
  universe: Universe;
}) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 font-semibold text-sm">{title}</h3>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.industry}>
            <Link
              href={screenHref({ metric: 'industry', cmp: 'in', value: [row.industry] }, universe)}
              className="flex items-center gap-3 py-2.5 hover:underline"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.industry} <span className="text-2xs text-muted-foreground">{row.stocks}</span>
              </span>
              <span className="figure font-medium text-xs">{signed(row[metric])}</span>
              <span className="figure w-16 text-right text-muted-foreground text-xs">
                {row.above50Pct === null ? '—' : `${row.above50Pct.toFixed(0)}% >50`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MarketAttentionSection({
  breadth,
  watchedSymbols,
  defaultWatchlistId,
}: {
  breadth: MarketBreadthDto;
  watchedSymbols: ReadonlySet<string>;
  defaultWatchlistId: number | null;
}) {
  const categories = marketAttentionCategories(breadth);
  const first = categories[0];
  if (first === undefined) return null;

  return (
    <Section aria-labelledby="attention-heading">
      <SectionHeader>
        <SectionTitle id="attention-heading">Stocks worth a closer look</SectionTitle>
        <SectionDescription>Measured market activity</SectionDescription>
      </SectionHeader>
      <Card>
        <CardContent className="py-4">
          <Tabs defaultValue={first.id}>
            <TabsList variant="pill">
              {categories.map((category) => (
                <TabsTrigger key={category.id} value={category.id}>
                  {category.label}{' '}
                  <span className="ml-1 text-subtle-foreground">
                    {'count' in category && category.count !== null
                      ? category.count
                      : category.rows.length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {categories.map((category) => (
              <TabsContent key={category.id} value={category.id}>
                <LeaderList
                  rows={category.rows}
                  metricLabel={category.format}
                  watchedSymbols={watchedSymbols}
                  defaultWatchlistId={defaultWatchlistId}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </Section>
  );
}

function LeaderList({
  rows,
  metricLabel,
  watchedSymbols,
  defaultWatchlistId,
}: {
  rows: readonly LeaderDto[];
  metricLabel: (value: number | null) => string;
  watchedSymbols: ReadonlySet<string>;
  defaultWatchlistId: number | null;
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.symbol} className="flex flex-wrap items-center gap-3 py-2.5">
          <Link
            href={stockHref(row.symbol)}
            className="flex min-w-0 flex-1 flex-col hover:underline"
          >
            <span className="font-mono font-medium text-xs">{row.symbol}</span>
            <span className="truncate text-2xs text-muted-foreground">
              {row.industry ?? row.name}
            </span>
          </Link>
          <span className="figure font-medium text-xs">{metricLabel(row.metric)}</span>
          <span
            className={cn(
              'figure w-16 text-right text-xs',
              toneText({
                tone:
                  (row.changePct ?? 0) > 0
                    ? 'bullish'
                    : (row.changePct ?? 0) < 0
                      ? 'bearish'
                      : 'neutral',
              }),
            )}
          >
            {signed(row.changePct, 2)}
          </span>
          <AddToWatchlist
            symbol={row.symbol}
            defaultWatchlistId={defaultWatchlistId}
            alreadyWatched={watchedSymbols.has(row.symbol)}
          />
        </li>
      ))}
    </ul>
  );
}
