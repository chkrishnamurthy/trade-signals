import type { ReactNode } from 'react';
import {
  LoadingRegion,
  SkeletonChart,
  SkeletonForm,
  SkeletonList,
  SkeletonMetrics,
  SkeletonPanel,
  SkeletonResults,
  SkeletonSummary,
  SkeletonTable,
  SkeletonText,
  SkeletonToolbar,
} from '@/components/data-display/loading';
import { PortfolioNav } from '@/components/portfolio/portfolio-nav';
import { Skeleton } from '@/components/ui/skeleton';
import { AppShell } from './app-shell';
import { PageContainer, PageDescription, PageHeader, PageHeading, PageTitle } from './page';

/** Route fallback shell. Keep real navigation and known headings usable; only
 * the data region is busy. No new fetches, fake values or delayed reveals. */
export function PageLoading({
  title,
  description,
  navigation,
  children,
}: {
  title: string;
  description?: string;
  navigation?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>{title}</PageTitle>
            {description && <PageDescription>{description}</PageDescription>}
          </PageHeading>
        </PageHeader>
        {navigation && <div className="mb-4">{navigation}</div>}
        <LoadingRegion label={`Loading ${title.toLowerCase()}`}>
          <div className="flex flex-col gap-4">{children}</div>
        </LoadingRegion>
      </PageContainer>
    </AppShell>
  );
}

export function TodayLoading() {
  return (
    <PageLoading
      title="Welcome back 👋"
      description="Here’s your read on the session that just closed."
    >
      <Skeleton className="h-8 w-72 max-w-full" />
      <SkeletonMetrics />
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <SkeletonPanel className="space-y-6">
          <Skeleton className="h-5 w-48 max-w-full" />
          <SkeletonText lines={3} />
          <SkeletonMetrics count={3} className="grid-cols-3 lg:grid-cols-3" />
        </SkeletonPanel>
        <SkeletonPanel>
          <Skeleton className="h-4 w-32" />
          <SkeletonList rows={3} />
        </SkeletonPanel>
      </div>
      <SkeletonTable rows={5} />
    </PageLoading>
  );
}

export function WatchlistsLoading() {
  return (
    <PageLoading
      title="My watchlists"
      description="The stocks you follow, with prices and technical readings side by side."
    >
      <SkeletonToolbar />
      <SkeletonSummary />
      <SkeletonTable columns={7} />
    </PageLoading>
  );
}
export function ScreenerLoading() {
  return (
    <PageLoading
      title="Screener"
      description="Find stocks by combining technical, delivery, F&O and ownership conditions."
    >
      <SkeletonToolbar />
      <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <SkeletonPanel className="hidden space-y-4 lg:block">
          <Skeleton className="h-4 w-32" />
          <SkeletonList rows={6} compact />
        </SkeletonPanel>
        <div className="min-w-0 space-y-4">
          <SkeletonToolbar />
          <SkeletonPanel className="space-y-3">
            <SkeletonText lines={2} />
            <Skeleton className="h-8 w-32" />
          </SkeletonPanel>
          <SkeletonResults columns={7} />
        </div>
      </div>
    </PageLoading>
  );
}
export function PortfolioLoading() {
  return (
    <PageLoading
      title="My portfolio"
      navigation={<PortfolioNav current="overview" />}
      description="The shares you hold, valued at the latest price."
    >
      <SkeletonMetrics count={5} className="lg:grid-cols-5" />
      <SkeletonToolbar />
      <SkeletonResults columns={7} />
    </PageLoading>
  );
}
export function HoldingLoading() {
  return (
    <PageLoading title="Holding">
      <Skeleton className="h-6 w-56 max-w-full" />
      <SkeletonMetrics />
      <SkeletonToolbar />
      <SkeletonPanel className="space-y-5">
        <Skeleton className="h-4 w-32" />
        <SkeletonText />
      </SkeletonPanel>
      <SkeletonTable rows={5} />
    </PageLoading>
  );
}
export function AnalysisLoading() {
  return (
    <PageLoading
      title="Portfolio analysis"
      navigation={<PortfolioNav current="analysis" />}
      description="How your holdings fit together, and how they have performed."
    >
      <SkeletonToolbar />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SkeletonChart className="h-96" />
        <div className="space-y-4">
          <SkeletonChart className="h-44" />
          <SkeletonChart className="h-48" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonChart />
        <SkeletonChart />
      </div>
    </PageLoading>
  );
}
export function BreadthLoading() {
  return (
    <PageLoading
      title="Market breadth"
      description="Advances and declines, stocks above key averages, new highs and lows, and industry rotation."
    >
      <SkeletonMetrics count={6} className="sm:grid-cols-3 xl:grid-cols-6" />
      <div className="grid gap-4 lg:grid-cols-5">
        <SkeletonChart className="lg:col-span-3" />
        <SkeletonChart className="lg:col-span-2" />
      </div>
      <SkeletonTable rows={6} columns={6} />
    </PageLoading>
  );
}
export function FlowsLoading() {
  return (
    <PageLoading
      title="Institutional Flow"
      description="Where the big money went — cash flows, futures positioning, delivery and large deals."
    >
      <Skeleton className="h-6 w-64 max-w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonChart className="h-64" />
        <SkeletonChart className="h-64" />
      </div>
      <SkeletonToolbar />
      <SkeletonTable columns={7} />
      <SkeletonTable rows={4} />
    </PageLoading>
  );
}
export function AnnouncementsLoading() {
  return (
    <PageLoading
      title="Corporate Announcements"
      description="Official corporate filings published by the NSE and BSE."
    >
      <SkeletonToolbar />
      {[0, 1, 2, 3].map((i) => (
        <SkeletonPanel key={i} className="space-y-4">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-5 w-20" />
          </div>
          <SkeletonText lines={2} />
          <Skeleton className="h-3 w-24" />
        </SkeletonPanel>
      ))}
    </PageLoading>
  );
}
export function CalendarContentSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-2.5 lg:grid-cols-[6rem_minmax(0,1fr)] lg:gap-4">
          <div className="flex gap-2 lg:block">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-7 w-12 lg:mt-2" />
          </div>
          <SkeletonPanel>
            <SkeletonList rows={2} compact />
          </SkeletonPanel>
        </div>
      ))}
    </div>
  );
}
export function CalendarLoading() {
  return (
    <PageLoading
      title="Market Calendar"
      description="Track results, corporate actions, holidays, and events that may affect your watchlist."
    >
      <SkeletonMetrics />
      <SkeletonToolbar />
      <CalendarContentSkeleton />
    </PageLoading>
  );
}
export function NoticesLoading() {
  return (
    <PageLoading
      navigation={<PortfolioNav current="notices" />}
      title="Notices"
      description="Updates about the shares you hold."
    >
      <SkeletonToolbar />
      <SkeletonPanel>
        <SkeletonList rows={6} />
      </SkeletonPanel>
    </PageLoading>
  );
}
export function AlertsLoading() {
  return (
    <PageLoading
      title="Alerts"
      description="Be told when a stock crosses a price or RSI level on a completed session."
    >
      <SkeletonPanel className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <Skeleton className="h-9 w-24 self-end" />
      </SkeletonPanel>
      <SkeletonTable rows={5} />
      <SkeletonPanel>
        <SkeletonList rows={3} />
      </SkeletonPanel>
    </PageLoading>
  );
}
export function StockLoading() {
  return (
    <AppShell>
      <PageContainer>
        <LoadingRegion label="Loading stock research">
          <div className="space-y-4 pt-4">
            <Skeleton className="h-8 w-28" />
            <SkeletonPanel className="space-y-5">
              <div className="flex flex-wrap items-center gap-4">
                <Skeleton className="size-14 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-3">
                  <Skeleton className="h-7 w-64 max-w-full" />
                  <Skeleton className="h-3 w-40 max-w-full" />
                </div>
                <Skeleton className="h-9 w-32" />
              </div>
              <SkeletonMetrics />
            </SkeletonPanel>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <SkeletonPanel className="space-y-5">
                <SkeletonToolbar />
                <SkeletonMetrics count={12} className="lg:grid-cols-3" />
              </SkeletonPanel>
              <div className="space-y-4">
                <SkeletonPanel className="space-y-4">
                  <Skeleton className="h-4 w-32" />
                  <SkeletonText lines={4} />
                </SkeletonPanel>
                <SkeletonPanel>
                  <SkeletonList rows={4} compact />
                </SkeletonPanel>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <SkeletonChart className="h-96" />
              <SkeletonPanel>
                <SkeletonList rows={5} />
              </SkeletonPanel>
            </div>
          </div>
        </LoadingRegion>
      </PageContainer>
    </AppShell>
  );
}
export function ProfileLoading() {
  return (
    <PageLoading
      title="Your profile"
      description="Manage how you appear across EquityWise and the settings that secure your account."
    >
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-6 w-64 max-w-full" />
      </div>
      <div className="flex gap-2 py-2">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <SkeletonPanel className="space-y-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="h-9 w-28" />
          <SkeletonText lines={2} />
        </SkeletonPanel>
        <div className="lg:col-span-2">
          <SkeletonForm />
        </div>
      </div>
    </PageLoading>
  );
}
export function AdminLoading() {
  return (
    <PageLoading title="Users" description="Manage accounts, roles and access across EquityWise.">
      <SkeletonMetrics count={6} className="lg:grid-cols-6" />
      <SkeletonToolbar />
      <SkeletonTable columns={6} />
    </PageLoading>
  );
}
export function LogsLoading() {
  return (
    <PageLoading title="Event log">
      <SkeletonToolbar />
      <SkeletonTable columns={6} rows={10} />
    </PageLoading>
  );
}
export function IpoHealthLoading() {
  return (
    <PageLoading
      title="IPO data health"
      description="Feeds, unmatched observations and source conflicts."
    >
      <SkeletonMetrics />
      <SkeletonTable rows={5} />
      <SkeletonTable rows={4} />
    </PageLoading>
  );
}
export function PaperHealthLoading() {
  return (
    <PageLoading
      title="Paper trading health"
      description="Feed, worker cycles, calendar and open alerts."
    >
      <SkeletonMetrics />
      <SkeletonTable rows={5} />
      <SkeletonPanel>
        <SkeletonList rows={3} />
      </SkeletonPanel>
    </PageLoading>
  );
}
