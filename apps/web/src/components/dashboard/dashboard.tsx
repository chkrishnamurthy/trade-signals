'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  CardSkeleton,
  ChartSkeleton,
  ConnectionError,
  SkeletonRows,
} from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import { ContentGrid, GridMain, GridRail } from '@/components/layout/grid';
import {
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageTitle,
} from '@/components/layout/page';
import { LastUpdated, MarketStatus } from '@/components/market/market-status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardHeading, CardTitle } from '@/components/ui/card';
import { istTime } from '@/lib/format';
import { useDashboard } from '@/lib/use-dashboard';
import { MarketActivity, QuickStats } from './activity';
import { MarketBreadth } from './breadth';
import { MarketChart } from './chart';
import { IndexCards } from './index-cards';
import { MoversCard } from './movers';
import { StockSearch } from './search';
import { SectorHeatmap, SectorPerformance } from './sectors';
import { MarketSentiment } from './sentiment';
import { SwingOpportunities, TradingSignals } from './signals';
import { StockDetailDrawer } from './stock-drawer';
import { Watchlist } from './watchlist';

/**
 * The market dashboard.
 *
 * Two feeds drive everything: a cheap quote poll and an expensive indicator
 * pass. Sections that need indicators show their own loading state rather than
 * holding up the whole page.
 *
 * Layout is composed entirely from the design system — AppShell, PageContainer,
 * ContentGrid — so a second page inherits the same frame by writing the same
 * five lines.
 */
export function Dashboard({ indexKey = 'nifty50' }: { indexKey?: string }) {
  const { dashboard, signals, refresh, isRefreshing } = useDashboard(indexKey);
  const [selected, setSelected] = useState<string | null>(null);

  const data = dashboard.status === 'ready' ? dashboard.data : null;
  const isStale = dashboard.status === 'ready' && dashboard.stale;
  const signalData = signals.status === 'ready' ? signals.data : null;
  const signalsLoading = signals.status === 'loading';

  const quoteBySymbol = useMemo(
    () => new Map((data?.quotes ?? []).map((q) => [q.symbol, q])),
    [data],
  );
  const signalBySymbol = useMemo(
    () => new Map((signalData?.signals ?? []).map((s) => [s.symbol, s])),
    [signalData],
  );

  const onSelect = useCallback((symbol: string) => setSelected(symbol), []);
  const closeDrawer = useCallback(() => setSelected(null), []);

  // The slow feed carries EMA participation the fast feed cannot know about.
  const breadth = useMemo(() => {
    if (data === null) return null;
    const base = data.sentiment.breadth;
    if (signalData === null) return base;
    return {
      ...base,
      aboveEma20: signalData.breadthExtras.aboveEma20,
      aboveEma50: signalData.breadthExtras.aboveEma50,
      aboveEma200: signalData.breadthExtras.aboveEma200,
      withIndicators: signalData.breadthExtras.total,
    };
  }, [data, signalData]);

  const topbar = (
    <>
      <StockSearch onSelect={onSelect} />
      <div className="hidden items-center gap-2 sm:flex">
        <MarketStatus
          phase={data?.market.phase ?? 'unknown'}
          isOpen={data?.market.isOpen ?? false}
        />
        <LastUpdated at={data?.fetchedAt ?? null} />
      </div>
    </>
  );

  if (dashboard.status === 'error') {
    return (
      <AppShell topbar={topbar}>
        <PageContainer width="narrow">
          <ConnectionError
            detail={dashboard.error.remedy ?? dashboard.error.error}
            onRetry={refresh}
          />
        </PageContainer>
      </AppShell>
    );
  }

  return (
    <AppShell topbar={topbar}>
      <PageContainer>
        <PageHeader>
          <div className="min-w-0">
            <PageTitle>Market dashboard</PageTitle>
            <PageDescription>
              Indices, breadth, sectors and technical setups across the NIFTY 50. Decision support
              only — orders are placed elsewhere.
            </PageDescription>
          </div>
          <div className="flex items-center gap-2 sm:hidden">
            <MarketStatus
              phase={data?.market.phase ?? 'unknown'}
              isOpen={data?.market.isOpen ?? false}
            />
          </div>
        </PageHeader>

        {data === null ? (
          <DashboardSkeleton />
        ) : (
          <PageContent>
            {isStale && (
              <Alert variant="warning">
                <AlertTitle>Showing a cached snapshot</AlertTitle>
                <AlertDescription>
                  The market data source is unreachable. These figures are from{' '}
                  {istTime(data.fetchedAt)} IST and are not current.
                </AlertDescription>
              </Alert>
            )}

            <IndexCards indices={data.indices} />
            <QuickStats stats={data.quickStats} />

            {/* Chart plus analytics rail on desktop, stacked on mobile. */}
            <ContentGrid columns="board">
              <GridMain>
                <MarketChart
                  symbol={data.indices[0]?.symbol ?? 'NIFTY50'}
                  title={data.indices[0]?.name ?? 'NIFTY 50'}
                  previousClose={data.indices[0]?.previousClose ?? null}
                />
              </GridMain>
              <GridRail>
                <MarketSentiment sentiment={data.sentiment} />
                {breadth !== null && <MarketBreadth breadth={breadth} />}
              </GridRail>
            </ContentGrid>

            <ContentGrid columns="cards">
              <MoversCard
                title="Top gainers"
                movers={data.gainers}
                emptyTitle="No advancing stocks"
                onSelect={onSelect}
              />
              <MoversCard
                title="Top losers"
                movers={data.losers}
                emptyTitle="No declining stocks"
                onSelect={onSelect}
              />
              <MoversCard
                title="Most active"
                subtitle="By turnover"
                movers={data.mostActive}
                metric="turnover"
                emptyTitle="No turnover data"
                onSelect={onSelect}
              />
              <MoversCard
                title="Unusual volume"
                subtitle="Versus 20-day average"
                movers={data.unusualVolume}
                metric="relativeVolume"
                emptyTitle={data.indicatorsReady ? 'Nothing unusual' : 'Waiting for indicators'}
                emptyDetail={
                  data.indicatorsReady
                    ? 'No constituent is trading at 1.5× its average volume.'
                    : 'The 20-day average volume arrives with the indicator pass.'
                }
                onSelect={onSelect}
              />
            </ContentGrid>

            <ContentGrid columns="board">
              <GridRail>
                <TradingSignals
                  signals={signalData?.signals ?? []}
                  loading={signalsLoading}
                  onSelect={onSelect}
                />
              </GridRail>
              <GridMain>
                <SwingOpportunities
                  candidates={signalData?.swing ?? []}
                  loading={signalsLoading}
                  onSelect={onSelect}
                />
              </GridMain>
            </ContentGrid>

            <ContentGrid columns="split">
              <SectorPerformance sectors={data.sectors} />
              <SectorHeatmap sectors={data.sectors} quotes={data.quotes} onSelect={onSelect} />
            </ContentGrid>

            <ContentGrid columns="split">
              <Watchlist
                quotes={data.quotes}
                signals={signalData?.signals ?? []}
                onSelect={onSelect}
                onBrowse={() => onSelect(data.gainers[0]?.symbol ?? data.quotes[0]?.symbol ?? '')}
              />
              <MarketActivity events={signalData?.activity ?? []} loading={signalsLoading} />
            </ContentGrid>

            <footer className="flex flex-wrap items-center justify-between gap-2 pb-6 text-xs text-muted-foreground">
              <span>
                {data.quotes.length} constituents · updated {istTime(data.fetchedAt)} IST
                {data.cached && ' · cached'}
                {isRefreshing && ' · refreshing'}
              </span>
              <span>
                Technical analysis only. Not investment advice.
                {signalData !== null &&
                  signalData.skipped.length > 0 &&
                  ` No history for: ${signalData.skipped.join(', ')}`}
              </span>
            </footer>
          </PageContent>
        )}
      </PageContainer>

      {selected !== null && selected !== '' && (
        <StockDetailDrawer
          quote={quoteBySymbol.get(selected) ?? null}
          signal={signalBySymbol.get(selected) ?? null}
          isLive={data?.market.isOpen ?? false}
          onClose={closeDrawer}
        />
      )}
    </AppShell>
  );
}

/** Mirrors the real layout so nothing jumps when the first payload lands. */
function DashboardSkeleton() {
  return (
    <PageContent aria-busy="true">
      <ContentGrid columns="metrics">
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton
          <CardSkeleton key={i} />
        ))}
      </ContentGrid>
      <ContentGrid columns="board">
        <GridMain>
          <ChartSkeleton />
        </GridMain>
        <GridRail>
          <Card>
            <CardHeader>
              <CardHeading>
                <CardTitle>Market sentiment</CardTitle>
              </CardHeading>
            </CardHeader>
            <CardContent>
              <SkeletonRows rows={4} />
            </CardContent>
          </Card>
        </GridRail>
      </ContentGrid>
      <span className="sr-only">Loading market data</span>
    </PageContent>
  );
}
