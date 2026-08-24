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
import { LastUpdated, MarketStatus } from '@/components/market/market-status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  applyFilters,
  buildSections,
  DEFAULT_SIGNAL_FILTERS,
  type SignalFilterState,
} from '@/lib/intraday-display';
import type { IntradaySignalDto } from '@/lib/intraday-types';
import { useIntradaySignals } from '@/lib/use-intraday-signals';
import { SignalCard, SignalRow } from './signal-card';
import { SignalDetail } from './signal-detail';
import { SignalFilters } from './signal-filters';
import { SignalSummary } from './signal-summary';
import { SignalsDisclaimer } from './vocabulary';

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

  const topbar = (
    <div className="flex flex-1 items-center justify-end gap-2">
      <Badge variant="outline" size="sm">
        Intraday only
      </Badge>
      <div className="hidden items-center gap-2 sm:flex">
        <MarketStatus
          phase={data?.market.phase ?? 'unknown'}
          isOpen={data?.market.isOpen ?? false}
        />
        <LastUpdated
          at={data?.run?.finishedAt ?? data?.fetchedAt ?? null}
          staleAfterSeconds={600}
        />
      </div>
    </div>
  );

  if (feed.status === 'error') {
    return (
      <AppShell topbar={topbar}>
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
    <AppShell topbar={topbar}>
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
            <div className="flex items-center gap-2 sm:hidden">
              <MarketStatus
                phase={data?.market.phase ?? 'unknown'}
                isOpen={data?.market.isOpen ?? false}
              />
            </div>
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
            {data.stale && (
              <Alert variant="warning">
                <AlertTitle>The signal engine has not run recently</AlertTitle>
                <AlertDescription>
                  The setups below were last validated at{' '}
                  {data.run?.finishedAt === null || data.run === null
                    ? 'an unknown time'
                    : new Date(data.run.finishedAt).toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour12: false,
                      })}{' '}
                  and may no longer be valid. Start the worker with{' '}
                  <code className="font-mono">pnpm --filter @wealthos/worker dev</code> to resume
                  live evaluation.
                </AlertDescription>
              </Alert>
            )}

            {!data.market.isOpen && (
              <Alert>
                <AlertTitle>Market closed</AlertTitle>
                <AlertDescription>
                  These are the setups recorded during the {data.tradingDate} session, shown as
                  history. They are not live intraday opportunities.
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
