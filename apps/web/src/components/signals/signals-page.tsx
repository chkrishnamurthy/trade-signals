'use client';

import { LayoutGridIcon, ListIcon, RefreshCwIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import { ContentGrid } from '@/components/layout/grid';
import {
  PageActions,
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
  Section,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/layout/page';
import { LastUpdated } from '@/components/market/market-status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { agoLabel, istTime } from '@/lib/format';
import {
  applyFilters,
  buildSections,
  DEFAULT_SIGNAL_FILTERS,
  type SignalFilterState,
} from '@/lib/intraday-display';
import type { IntradaySignalDto } from '@/lib/intraday-types';
import { derivePipelineStatus, type PipelineState } from '@/lib/pipeline-status';
import { useIntradaySignals } from '@/lib/use-intraday-signals';
import { EngineStatus } from './engine-status';
import { SignalCard, SignalRow } from './signal-card';
import { SignalDetail } from './signal-detail';
import { SignalFilters } from './signal-filters';
import { SignalSummary } from './signal-summary';
import { SignalsDisclaimer } from './vocabulary';

const PROBLEM_TITLE: Partial<Record<PipelineState, string>> = {
  unknown: "Can't confirm market status",
  delayed: 'Scan is running behind',
  stopped: "Signal engine isn't scanning",
  error: 'Last scan failed',
};

function isProblemState(state: PipelineState): boolean {
  return state in PROBLEM_TITLE;
}

/**
 * The Trade Signals page.
 *
 * Same-day intraday setups only. Nothing here is a long-term view, nothing is
 * carried overnight, and every setup is expected to be closed out before the
 * session ends — which the engine enforces by expiring live signals near the
 * bell rather than leaving them on screen.
 *
 * The page is a consumer. Every score, every reason and every level was
 * computed by the worker and read out of Postgres; this component sorts,
 * filters and renders, and performs no analysis of its own.
 *
 * Layout is composed entirely from the design system — AppShell, PageContainer,
 * ContentGrid, Card — so it inherits the same frame, spacing and theming as the
 * dashboard without introducing a single new token.
 */
export function SignalsPage() {
  const { feed, refresh, isRefreshing } = useIntradaySignals();
  const [filters, setFilters] = useState<SignalFilterState>(DEFAULT_SIGNAL_FILTERS);
  const [density, setDensity] = useState<'cards' | 'compact'>('cards');
  const [selected, setSelected] = useState<IntradaySignalDto | null>(null);

  const data = feed.status === 'ready' ? feed.data : null;

  const sectors = useMemo(() => {
    const found = new Set<string>();
    for (const signal of data?.signals ?? []) {
      if (signal.sector !== null) found.add(signal.sector);
    }
    return [...found].sort();
  }, [data]);

  const filtered = useMemo(() => applyFilters(data?.signals ?? [], filters), [data, filters]);
  const sections = useMemo(() => buildSections(filtered), [filtered]);

  const openSignal = useCallback((signal: IntradaySignalDto) => setSelected(signal), []);

  // The single source of truth for "is this thing actually scanning?" — the
  // header pill and both banners below all read from this one call so they
  // can never disagree with each other.
  const pipeline =
    data === null
      ? null
      : derivePipelineStatus({
          market: data.market,
          run: data.run,
          stale: data.stale,
          now: Date.now(),
        });

  if (feed.status === 'error') {
    return (
      <AppShell>
        <PageContainer width="narrow">
          <PageHeader>
            <PageHeading>
              <PageTitle>Intraday signals</PageTitle>
              <PageDescription>
                Technical setups forming in today&rsquo;s session, each scored on how many
                independent conditions agree.
              </PageDescription>
            </PageHeading>
          </PageHeader>
          <ErrorState
            title="Could not load intraday signals"
            description={feed.error.remedy ?? 'The signals store is unreachable.'}
            detail={feed.error.error}
            onRetry={refresh}
          />
        </PageContainer>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageContainer>
        {/* One sentence. The full "what confluence means, and that these are
            intraday only" explanation used to live here and wrapped to three
            lines above the densest table in the product; it now sits in the
            footer disclaimer and on the signal cards themselves. */}
        <PageHeader>
          <PageHeading>
            <PageTitle>Intraday signals</PageTitle>
            <PageDescription>
              Technical setups forming in today&rsquo;s session, each scored on how many independent
              conditions agree.
            </PageDescription>
          </PageHeading>
          <PageActions>
            {/* The primary answer to "is this actually scanning right now?" —
                derived entirely from the run row, market state and staleness
                the feed already carries; see engine-status.tsx. Replaces the
                market-phase badge that used to sit here — that badge's own
                "unknown" reading and this pill's could disagree, and its raw
                phase label ("Session state unavailable") didn't explain
                anything a reader could act on. */}
            {data !== null && <EngineStatus feed={data} />}
            {/* When the ENGINE last scanned, which is not when quotes were last
                fetched — the header's stamp answers that. Two clocks meaning
                different things must not sit side by side, so this one is
                labelled and lives with the page's own actions. */}
            <span className="hidden items-center gap-1.5 text-muted-foreground text-xs sm:inline-flex">
              Scanned
              <LastUpdated
                at={data?.run?.finishedAt ?? data?.fetchedAt ?? null}
                staleAfterSeconds={600}
              />
            </span>
            <ToggleGroup
              type="single"
              value={density}
              onValueChange={(value) => {
                if (value !== '') setDensity(value as 'cards' | 'compact');
              }}
              aria-label="Layout density"
              className="hidden md:flex"
            >
              <ToggleGroupItem value="cards" aria-label="Cards">
                <LayoutGridIcon className="size-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem value="compact" aria-label="Compact list">
                <ListIcon className="size-3.5" />
              </ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" size="sm" onClick={refresh} disabled={isRefreshing}>
              <RefreshCwIcon className={isRefreshing ? 'animate-spin' : undefined} />
              Refresh
            </Button>
          </PageActions>
        </PageHeader>

        {data === null ? (
          <PageContent>
            <ContentGrid columns="metrics">
              {[0, 1, 2, 3].map((index) => (
                <CardSkeleton key={index} />
              ))}
            </ContentGrid>
            <ContentGrid columns="cards">
              {[0, 1, 2, 3].map((index) => (
                <CardSkeleton key={index} className="h-96" />
              ))}
            </ContentGrid>
          </PageContent>
        ) : (
          <PageContent>
            {pipeline !== null && isProblemState(pipeline.state) && (
              <Alert variant={pipeline.tone === 'critical' ? 'destructive' : 'warning'}>
                <AlertTitle>{PROBLEM_TITLE[pipeline.state]}</AlertTitle>
                <AlertDescription>
                  {pipeline.detail}{' '}
                  {pipeline.lastActivityAt !== null && (
                    <>
                      Last scanned {agoLabel(pipeline.lastActivityAt, Date.now())} (
                      {istTime(pipeline.lastActivityAt)} IST).
                    </>
                  )}
                  {(pipeline.state === 'stopped' || pipeline.state === 'unknown') && (
                    <>
                      {' '}
                      Start the worker with{' '}
                      <code className="font-mono">pnpm --filter @wealthos/worker dev</code> if it is
                      not already running.
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {pipeline?.state === 'closed' && (
              <Alert>
                <AlertTitle>Market closed</AlertTitle>
                <AlertDescription>
                  {pipeline.detail} These are the setups recorded during the {data.tradingDate}{' '}
                  session, shown as history — not live opportunities.
                </AlertDescription>
              </Alert>
            )}

            <SignalSummary feed={data} />

            <SignalFilters filters={filters} onChange={setFilters} sectors={sectors} />

            {sections.length === 0 ? (
              <Card>
                <CardContent>
                  <EmptyState
                    title={
                      data.signals.length === 0
                        ? 'No setups for this session yet'
                        : 'No setups match these filters'
                    }
                    description={
                      data.signals.length === 0
                        ? (data.notice ??
                          'The engine surfaces only setups that clear the quality threshold. A quiet feed is a normal outcome.')
                        : 'Widen the filters above, or switch Status to “All” to include setups that have already ended.'
                    }
                    action={
                      data.signals.length === 0 ? undefined : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFilters(DEFAULT_SIGNAL_FILTERS)}
                        >
                          Reset filters
                        </Button>
                      )
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              sections.map((section) => (
                <Section key={section.id}>
                  <SectionHeader>
                    <div className="min-w-0">
                      <SectionTitle>{section.title}</SectionTitle>
                      <SectionDescription>{section.description}</SectionDescription>
                    </div>
                    <Badge variant="secondary" size="sm">
                      {section.signals.length}
                    </Badge>
                  </SectionHeader>

                  {density === 'compact' ? (
                    <Card>
                      <CardContent flush>
                        {section.signals.map((signal) => (
                          <SignalRow key={signal.id} signal={signal} onOpen={openSignal} />
                        ))}
                      </CardContent>
                    </Card>
                  ) : (
                    <ContentGrid columns="cards">
                      {section.signals.map((signal) => (
                        <SignalCard key={signal.id} signal={signal} onOpen={openSignal} />
                      ))}
                    </ContentGrid>
                  )}
                </Section>
              ))
            )}

            {data.notice !== null && sections.length > 0 && (
              <p className="text-xs text-muted-foreground">{data.notice}</p>
            )}

            <SignalsDisclaimer />
          </PageContent>
        )}
      </PageContainer>

      <SignalDetail
        signal={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </AppShell>
  );
}
