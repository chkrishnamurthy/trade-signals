'use client';
import {
  type PaperOverview,
  type PaperSettingsResponse,
  paperOverviewSchema,
} from '@equitywise/shared';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { usePolledResource } from '@/components/intraday/use-polled-resource';
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
import { ActivityCard } from './activity-card';
import { ControlsCard } from './controls-card';
import { clock, reasonLabel, time } from './format';
import { HistoryCard } from './history-card';
import { OpenTradesCard } from './open-trades-card';
import { PerformanceCard } from './performance-card';
import { SummaryCards } from './summary-cards';

export const PHASE: Record<PaperOverview['phase'], string> = {
  PRE_OPEN: 'Pre-open',
  OPENING_RANGE: 'Opening range forming',
  SESSION: 'Signal window open',
  AFTER_ENTRIES: 'No new entries after 14:30',
  SQUARE_OFF: 'Square-off under way',
  CLOSED: 'Market closed',
};

export function FeedBadge({ feed }: { feed: PaperOverview['feed'] }) {
  const tone = {
    LIVE: 'bullish',
    STALE: 'warning',
    CLOSED: 'neutral',
    UNAVAILABLE: 'destructive',
  } as const;
  return (
    <Badge
      variant={tone[feed.mode]}
      title={
        feed.lastQuoteAt === null
          ? 'No price sample yet'
          : `Last price sample ${clock(feed.lastQuoteAt)} IST`
      }
    >
      Data: {feed.name} · {feed.mode.toLowerCase()}
    </Badge>
  );
}

const HALT: Record<string, string> = {
  DAILY_LOSS_HALT: 'Daily loss limit reached — no new paper trades until tomorrow.',
  DRAWDOWN_HALT: 'Drawdown limit reached — no new paper trades until you resume.',
  OPEN_AFTER_CUTOFF:
    'A paper trade was still open after the close; it was resolved as unavailable.',
  RECONCILE_MISMATCH:
    'The virtual ledger did not reconcile last night; figures may be off until it is fixed.',
};

/** The state banners of plan §4, one line each, with the next expected time where useful. */
export function StateBanners({ data }: { data: PaperOverview }) {
  const banners: { title: string; body: string; tone?: 'destructive' | undefined }[] = [];
  if (data.session.kind === 'HOLIDAY' || data.session.kind === 'WEEKEND')
    banners.push({
      title:
        data.session.kind === 'HOLIDAY'
          ? `Exchange holiday${data.session.note ? ` — ${data.session.note}` : ''}`
          : 'Weekend',
      body: 'No session today. Open paper trades are never carried between sessions.',
    });
  if (data.session.kind === 'CLOSED_UNSCHEDULED')
    banners.push({
      title: 'Unscheduled closure',
      body: 'The exchange did not open as scheduled; no entries today.',
      tone: 'destructive',
    });
  if (data.phase !== 'CLOSED' && data.phase !== 'PRE_OPEN') {
    if (data.feed.mode === 'STALE' || data.feed.mode === 'UNAVAILABLE') {
      const s = data.feed.socket;
      const report =
        s === null
          ? 'The worker has not reported its price socket yet — is it running the current build?'
          : `Worker socket: ${s.provider ?? 'unknown'} · ${s.state} · last tick ${s.lastTickAt === null ? 'never' : `${time(s.lastTickAt)} IST`} · reported ${time(s.reportedAt)} IST${s.note ? ` · ${s.note}` : ''}`;
      banners.push({
        title: data.feed.mode === 'STALE' ? 'Price feed stale' : 'Price feed unavailable',
        body: `Entries and exits wait for a covered price; any trade whose coverage broke for more than 15 s ends as "unavailable" rather than guessed. ${report}`,
        tone: 'destructive',
      });
    }
    if (data.feed.workerDelayed)
      banners.push({
        title: 'Worker delayed',
        body: 'The paper engine has not completed a cycle in the last 30 s; figures may lag.',
      });
  }
  for (const h of data.halts)
    banners.push({
      title: reasonLabel(h.kind) || h.kind,
      body: `${HALT[h.kind] ?? h.kind} (${time(h.at)} IST)`,
      tone:
        h.kind === 'RECONCILE_MISMATCH' || h.kind === 'OPEN_AFTER_CUTOFF'
          ? 'destructive'
          : undefined,
    });
  if (banners.length === 0) return null;
  return (
    <div className="space-y-2">
      {banners.map((b) => (
        <Alert key={b.title} variant={b.tone}>
          <AlertTitle>{b.title}</AlertTitle>
          <AlertDescription>{b.body}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

export function PaperDashboard() {
  const { data, error, refreshing, refresh } = usePolledResource(
    API_ROUTES.paperOverview,
    paperOverviewSchema,
  );
  // Settings changes come back in the mutation response; show them at once
  // rather than waiting for the next poll.
  const [override, setOverride] = useState<PaperSettingsResponse | null>(null);
  const view: PaperOverview | null =
    data === null
      ? null
      : override && override.settings.settingsVersion > data.settings.settingsVersion
        ? { ...data, settings: override.settings, assignments: override.assignments }
        : data;
  return (
    <AppShell>
      <PageContainer>
        <PageHeader className="flex-col sm:flex-row">
          <PageHeading className="w-full sm:w-auto">
            <PageTitle>Paper Trading</PageTitle>
            <PageDescription>
              Your strategies, simulated automatically on virtual capital. Watch what they would
              have done — nothing here can place an order.
            </PageDescription>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="warning">Simulation only — no real orders</Badge>
              {view ? (
                <>
                  <Badge variant="outline">{PHASE[view.phase]}</Badge>
                  <FeedBadge feed={view.feed} />
                  <span className="tabular-nums">
                    {clock(view.serverNow)} IST · {view.sessionDate}
                  </span>
                  <span>· {view.simulation.tier}</span>
                </>
              ) : null}
            </div>
          </PageHeading>
          <PageActions>
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
                {view ? ` Showing the snapshot from ${clock(view.serverNow)} IST.` : ''}
              </AlertDescription>
            </Alert>
          ) : null}
          {view ? (
            <>
              <StateBanners data={view} />
              <ControlsCard data={view} onChanged={setOverride} />
              <SummaryCards data={view} />
              <OpenTradesCard data={view} />
              <ActivityCard sessionDate={view.sessionDate} />
              <HistoryCard />
              <PerformanceCard />
            </>
          ) : error ? null : (
            <div className="space-y-4" aria-busy role="status">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          <PageDisclaimer>
            Paper trading is a simulation for education and research. Trades, balances, profits and
            losses are virtual; fills, slippage and charges are estimates from sampled prices, not
            from an order book. Nothing here is investment advice, and past simulated results do not
            predict anything.
          </PageDisclaimer>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
