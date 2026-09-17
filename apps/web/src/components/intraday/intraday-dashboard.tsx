'use client';
import { formatPaise, type IntradayToday, intradayTodaySchema } from '@equitywise/shared';
import { PauseIcon, PlayIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
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
} from '@/components/layout/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API_ROUTES } from '@/lib/api-routes';
import { OverviewCard } from './overview-card';
import { PaperControlsCard } from './paper-controls-card';
import { RulesCard } from './rules-card';
import { SignalsCard } from './signals-card';
import { TradesCard } from './trades-card';
import { usePolledResource } from './use-polled-resource';

const PHASE: Record<IntradayToday['phase'], string> = {
  PRE_OPEN: 'Pre-open',
  OPENING_RANGE: 'Opening range forming',
  SESSION: 'Signal window open',
  AFTER_ENTRIES: 'No new entries after 14:30',
  CLOSED: 'Market closed',
};
const clock = (at: number) =>
  new Date(at).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

function SourceBadge({ source }: { source: IntradayToday['source'] }) {
  const tone =
    source.mode === 'LIVE'
      ? 'bullish'
      : source.mode === 'STALE'
        ? 'warning'
        : source.mode === 'UNAVAILABLE'
          ? 'destructive'
          : 'neutral';
  const label = { LIVE: 'live', STALE: 'stale', CLOSED: 'closed', UNAVAILABLE: 'unavailable' }[
    source.mode
  ];
  return (
    <Badge
      variant={tone}
      title={
        source.lastQuoteAt === null
          ? 'No price sample yet'
          : `Last price sample ${clock(source.lastQuoteAt)} IST`
      }
    >
      Data: {source.name} · {label}
    </Badge>
  );
}

export function IntradayDashboard() {
  const [paused, setPaused] = useState(false);
  const { data, error, refreshing, refresh } = usePolledResource(
    API_ROUTES.intradayToday,
    intradayTodaySchema,
    paused,
  );
  const capital = data ? formatPaise(data.book.capitalPaise) : '₹5,00,000';
  return (
    <AppShell>
      <PageContainer>
        <PageHeader className="flex-col sm:flex-row">
          <PageHeading className="w-full sm:w-auto">
            <PageTitle>Intraday Strategies</PageTitle>
            <PageDescription>Paper trading ready, clean signals, fixed targets.</PageDescription>
            {data ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{PHASE[data.phase]}</Badge>
                <SourceBadge source={data.source} />
                <span className="tabular-nums">
                  {clock(data.serverNow)} IST · {data.sessionDate}
                </span>
                {data.scanner ? <span>· scanner: {data.scanner.message}</span> : null}
              </div>
            ) : null}
          </PageHeading>
          <PageActions>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
            >
              {paused ? (
                <PlayIcon className="size-4" aria-hidden />
              ) : (
                <PauseIcon className="size-4" aria-hidden />
              )}
              {paused ? 'Resume my refresh' : 'Pause my refresh'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              <RefreshCwIcon
                className={refreshing ? 'size-4 animate-spin' : 'size-4'}
                aria-hidden
              />
              Refresh
            </Button>
          </PageActions>
        </PageHeader>
        <PageContent>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Data unavailable</AlertTitle>
              <AlertDescription>
                {error}
                {data ? ` Showing the snapshot from ${clock(data.serverNow)} IST.` : ''}
              </AlertDescription>
            </Alert>
          ) : null}
          {data ? (
            <>
              <OverviewCard rules={data.rules} capital={capital} />
              <SignalsCard data={data} />
              <TradesCard data={data} />
              <RulesCard rules={data.rules} />
              <PaperControlsCard capital={capital} />
            </>
          ) : error ? null : (
            <div className="space-y-4" aria-busy role="status">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          <PageDisclaimer>
            Signals are generated using predefined technical rules for educational and research
            purposes. They are not guaranteed to be profitable and are not investment advice. Every
            price shown is a technical level; shares and results are simulated.
          </PageDisclaimer>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
