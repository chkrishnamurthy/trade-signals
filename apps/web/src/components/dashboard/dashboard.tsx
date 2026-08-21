'use client';

import { useCallback, useMemo, useState } from 'react';
import { Card, SkeletonRows } from '@/components/ui/card';
import { istTime } from '@/lib/format';
import { useDashboard } from '@/lib/use-dashboard';
import { MarketActivity, QuickStats } from './activity';
import { MarketBreadth } from './breadth';
import { MarketChart } from './chart';
import { IndexCards } from './index-cards';
import { MoversCard } from './movers';
import { SectorHeatmap, SectorPerformance } from './sectors';
import { MarketSentiment } from './sentiment';
import { SwingOpportunities, TradingSignals } from './signals';
import { StockDetailDrawer } from './stock-drawer';
import { TopNav } from './top-nav';
import { Watchlist } from './watchlist';

/**
 * The market dashboard.
 *
 * Two feeds drive everything: a cheap quote poll and an expensive indicator
 * pass. Sections that need indicators show their own loading state rather than
 * holding up the whole page.
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

  if (dashboard.status === 'error') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 dark:border-rose-900 dark:bg-rose-950/40">
          <h1 className="font-semibold text-rose-900 dark:text-rose-200">
            Market data temporarily unavailable
          </h1>
          <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">{dashboard.error.error}</p>
          {dashboard.error.remedy !== undefined && (
            <p className="mt-3 rounded bg-rose-100 px-3 py-2 font-mono text-xs text-rose-900 dark:bg-rose-900/40 dark:text-rose-200">
              {dashboard.error.remedy}
            </p>
          )}
          <button
            type="button"
            onClick={refresh}
            className="mt-4 rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-200"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
      <TopNav
        status={data?.market.status ?? 'UNKNOWN'}
        isOpen={data?.market.isOpen ?? false}
        lastUpdated={data === null ? '—' : `${istTime(data.fetchedAt)} IST`}
        onSelectSymbol={onSelect}
      />

      <main className="mx-auto max-w-[1800px] space-y-4 px-4 py-4 sm:px-6">
        {data === null ? (
          <DashboardSkeleton />
        ) : (
          <>
            {isStale && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Upstream unreachable — showing the last successful snapshot from{' '}
                {istTime(data.fetchedAt)} IST.
              </p>
            )}

            <IndexCards indices={data.indices} />
            <QuickStats stats={data.quickStats} />

            {/* Main grid: chart + analytics rail on desktop, stacked on mobile. */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <MarketChart
                  symbol={data.indices[0]?.symbol ?? 'NIFTY50'}
                  title={data.indices[0]?.name ?? 'NIFTY 50'}
                  previousClose={data.indices[0]?.previousClose ?? null}
                />
              </div>
              <div className="space-y-4">
                <MarketSentiment sentiment={data.sentiment} />
                {breadth !== null && <MarketBreadth breadth={breadth} />}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <TradingSignals
                signals={signalData?.signals ?? []}
                loading={signalsLoading}
                onSelect={onSelect}
              />
              <div className="xl:col-span-2">
                <SwingOpportunities
                  candidates={signalData?.swing ?? []}
                  loading={signalsLoading}
                  onSelect={onSelect}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectorPerformance sectors={data.sectors} />
              <SectorHeatmap sectors={data.sectors} quotes={data.quotes} onSelect={onSelect} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Watchlist
                quotes={data.quotes}
                signals={signalData?.signals ?? []}
                onSelect={onSelect}
                onBrowse={() => onSelect(data.gainers[0]?.symbol ?? data.quotes[0]?.symbol ?? '')}
              />
              <MarketActivity events={signalData?.activity ?? []} loading={signalsLoading} />
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 pb-6 pt-2 text-xs text-slate-500 dark:text-slate-400">
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
          </>
        )}
      </main>

      {selected !== null && selected !== '' && (
        <StockDetailDrawer
          quote={quoteBySymbol.get(selected) ?? null}
          signal={signalBySymbol.get(selected) ?? null}
          isLive={data?.market.isOpen ?? false}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton
            key={i}
            className="h-32 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800/70"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="h-80 animate-pulse rounded-lg bg-slate-200 xl:col-span-2 dark:bg-slate-800/70" />
        <Card title="Market sentiment">
          <SkeletonRows rows={4} />
        </Card>
      </div>
      <span className="sr-only">Loading market data</span>
    </div>
  );
}
