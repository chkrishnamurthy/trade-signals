'use client';

import { DataTable, type DataTableColumn } from '@/components/data-display/data-table';
import { MetricCard, StatTile } from '@/components/data-display/metric-card';
import { AppShell } from '@/components/layout/app-shell';
import { ContentGrid } from '@/components/layout/grid';
import {
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageTitle,
  Section,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/layout/page';
import { Price } from '@/components/market/numeric';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import type { PaperBucket, PaperResultsDto, PaperTradeRow } from '@/server/paper-trades';
import { ActionBadge } from './vocabulary';

/**
 * Signal accuracy — what the tape did with the engine's setups.
 *
 * The honesty of this page matters more than any other in the product, because
 * it is the one that could most easily be read as a promise. Three rules
 * govern it:
 *
 *  - Every rate is published with its margin of error. A hit rate over
 *    nineteen trades is not a hit rate, it is an anecdote, and showing "63%"
 *    without "±23 points" beside it would be the most misleading thing here.
 *  - Nothing is expressed in rupees of profit. Results are per share and in R
 *    — multiples of the risk taken — because the application does not know the
 *    user's capital or position size and must not imply that it does.
 *  - Open trades are shown but never counted. A position with no outcome
 *    cannot be a win or a loss.
 *
 * These are PAPER results: a mechanical record of what would have happened to
 * every triggered signal, taken at the next minute's open, exited at its level
 * or at the bell. No money was involved and no orders exist anywhere in this
 * application.
 */

const EXIT_LABEL: Record<string, string> = {
  target1: 'Target 1 reached',
  target2: 'Target 2 reached',
  stop: 'Invalidation level hit',
  session_close: 'Closed at session end',
  unresolved: 'Still open',
};

export function PerformanceView({ results }: { results: PaperResultsDto }) {
  const { summary, marginOfErrorPoints } = results;
  const thin = summary.trades < 100;

  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <div className="flex flex-wrap items-center gap-2">
            <PageTitle>Signal accuracy</PageTitle>
            <Badge variant="outline" size="sm">
              Paper only — no money
            </Badge>
          </div>
          <PageDescription>
            What actually happened to every intraday signal that triggered, measured against the
            tape and charged real transaction costs. A record of the engine, not of your trading.
          </PageDescription>
        </PageHeader>

        <PageContent>
          {summary.trades === 0 ? (
            <Alert>
              <AlertTitle>No outcomes recorded yet</AlertTitle>
              <AlertDescription>
                Results appear here once signals trigger and the worker resolves them. Nothing is
                estimated and nothing is filled in — an empty page means the engine has not yet
                produced a triggered setup, not that it performed badly.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert variant={thin ? 'warning' : 'default'}>
                <AlertTitle>
                  {thin ? 'Small sample — read this before the numbers' : 'How to read this'}
                </AlertTitle>
                <AlertDescription>
                  {summary.trades} resolved {summary.trades === 1 ? 'trade' : 'trades'} across{' '}
                  {results.sessions} {results.sessions === 1 ? 'session' : 'sessions'}
                  {marginOfErrorPoints === null
                    ? ''
                    : `. At this size the hit rate carries a margin of error of roughly ±${marginOfErrorPoints.toFixed(0)} percentage points`}
                  {thin
                    ? ' — wider than most of the differences between the buckets below. Do not change the configuration on a difference this small.'
                    : '.'}{' '}
                  Every figure assumes each signal is taken mechanically at the next minute&rsquo;s
                  open, with no discretion and no missed fills.
                </AlertDescription>
              </Alert>

              <ContentGrid columns="metrics">
                <MetricCard
                  label="Expectancy"
                  hint="Mean net result per trade, in multiples of the risk taken. The single number that decides whether the engine has an edge. Above zero is profitable before your own execution; below zero is not."
                  value={
                    <Text variant="metric" className={toneFor(summary.expectancyR)}>
                      {signed(summary.expectancyR)}R
                    </Text>
                  }
                  footer={<Text variant="caption">Net of costs and assumed slippage</Text>}
                />
                <MetricCard
                  label="Hit rate"
                  hint="Share of resolved trades that ended net positive after costs. Meaningless without the breakeven figure beside it."
                  value={<Text variant="metric">{(summary.hitRate * 100).toFixed(1)}%</Text>}
                  footer={
                    <Text variant="caption">
                      {summary.wins}W / {summary.losses}L
                      {marginOfErrorPoints === null
                        ? ''
                        : ` · ±${marginOfErrorPoints.toFixed(0)} pts`}
                    </Text>
                  }
                />
                <MetricCard
                  label="Breakeven needs"
                  hint="The hit rate this win/loss geometry requires merely to break even. If the hit rate above is below this, the engine loses money however good the setups look."
                  value={
                    <Text variant="metric">
                      {summary.breakevenHitRate === null
                        ? '—'
                        : `${(summary.breakevenHitRate * 100).toFixed(1)}%`}
                    </Text>
                  }
                  footer={
                    <Text variant="caption">
                      {summary.breakevenHitRate === null
                        ? 'Undefined — no winners yet'
                        : summary.hitRate >= summary.breakevenHitRate
                          ? 'Hit rate clears the bar'
                          : 'Hit rate is below the bar'}
                    </Text>
                  }
                />
                <MetricCard
                  label="Profit factor"
                  hint="Gross winnings divided by gross losses, in R. Above 1.0 means the winners outweigh the losers."
                  value={
                    <Text variant="metric">
                      {summary.profitFactor === null ? '—' : summary.profitFactor.toFixed(2)}
                    </Text>
                  }
                  footer={
                    <Text variant="caption">
                      Avg win {signed(summary.averageWinR)}R · avg loss{' '}
                      {signed(summary.averageLossR)}R
                    </Text>
                  }
                />
              </ContentGrid>

              <ContentGrid columns="stats">
                <StatTile label="Resolved" value={summary.trades} />
                <StatTile
                  label="Still open"
                  value={results.open}
                  hint="Triggered and running. Excluded from every statistic above — an open trade has no outcome."
                />
                <StatTile label="Sessions" value={results.sessions} />
                <StatTile label="Avg hold" value={`${summary.averageBarsHeld.toFixed(0)} min`} />
              </ContentGrid>

              <Section>
                <SectionHeader>
                  <SectionTitle>Where the results come from</SectionTitle>
                  <SectionDescription>
                    Sliced three ways. Each bucket carries its own trade count, because a bucket
                    with four trades in it is telling you nothing.
                  </SectionDescription>
                </SectionHeader>
                <ContentGrid columns="cards">
                  <BucketCard title="By score band" buckets={results.byScore} />
                  <BucketCard title="By strategy" buckets={results.byStrategy} />
                  <BucketCard
                    title="By outcome"
                    buckets={results.byExit}
                    labelFor={(label) => EXIT_LABEL[label] ?? label}
                  />
                </ContentGrid>
              </Section>

              <Section>
                <SectionHeader>
                  <SectionTitle>Every recorded outcome</SectionTitle>
                  <SectionDescription>
                    Per share, in paise. No quantity, no capital, no rupee profit — those depend on
                    decisions this application does not make and does not know about.
                  </SectionDescription>
                </SectionHeader>
                <DataTable
                  data={results.trades}
                  columns={TRADE_COLUMNS}
                  getRowId={(row) => row.id}
                  initialSort={{ columnId: 'entryAt', direction: 'desc' }}
                  pageSize={25}
                  stickyHeader
                  emptyTitle="No outcomes recorded"
                  caption="Paper outcomes of triggered intraday signals"
                />
              </Section>
            </>
          )}
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}

function BucketCard({
  title,
  buckets,
  labelFor = (label: string) => label,
}: {
  title: string;
  buckets: readonly PaperBucket[];
  labelFor?: (label: string) => string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-3 shadow-subtle">
      <Text as="h3" variant="overline">
        {title}
      </Text>
      <div className="mt-2 flex flex-col gap-2">
        {buckets.length === 0 ? (
          <Text variant="caption">Nothing recorded yet.</Text>
        ) : (
          buckets.map((entry) => (
            <div key={entry.label} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <Text variant="body" className="truncate">
                  {labelFor(entry.label)}
                </Text>
                <Text variant="caption">
                  {entry.trades} {entry.trades === 1 ? 'trade' : 'trades'} ·{' '}
                  {(entry.hitRate * 100).toFixed(0)}% hit
                  {entry.trades < 20 ? ' · too few to read' : ''}
                </Text>
              </div>
              <span className={cn('font-mono text-sm tabular-nums', toneFor(entry.expectancyR))}>
                {signed(entry.expectancyR)}R
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const TRADE_COLUMNS: readonly DataTableColumn<PaperTradeRow>[] = [
  {
    id: 'symbol',
    header: 'Symbol',
    cell: (row) => (
      <div className="flex items-center gap-2">
        <ActionBadge direction={row.direction} size="sm" />
        <span className="font-medium">{row.symbol}</span>
      </div>
    ),
    sortValue: (row) => row.symbol,
  },
  {
    id: 'entryAt',
    header: 'Entered',
    cell: (row) => <span className="font-mono text-xs tabular-nums">{istTime(row.entryAt)}</span>,
    sortValue: (row) => Date.parse(row.entryAt),
  },
  {
    id: 'tradingDate',
    header: 'Session',
    hideBelow: 'md',
    cell: (row) => <span className="font-mono text-xs">{row.tradingDate}</span>,
    sortValue: (row) => row.tradingDate,
  },
  {
    id: 'strategy',
    header: 'Setup',
    hideBelow: 'lg',
    cell: (row) => <Text variant="caption">{row.strategy}</Text>,
    sortValue: (row) => row.strategy,
  },
  {
    id: 'score',
    header: 'Score',
    numeric: true,
    cell: (row) => <span className="font-mono tabular-nums">{row.score}</span>,
    sortValue: (row) => row.score,
  },
  {
    id: 'entryPrice',
    header: 'Fill',
    numeric: true,
    hideBelow: 'sm',
    cell: (row) => <Price paise={row.entryPrice} bare size="sm" />,
    sortValue: (row) => row.entryPrice,
  },
  {
    id: 'exitPrice',
    header: 'Exit',
    numeric: true,
    hideBelow: 'sm',
    cell: (row) => <Price paise={row.exitPrice} bare size="sm" />,
    sortValue: (row) => row.exitPrice,
  },
  {
    id: 'exitReason',
    header: 'Outcome',
    cell: (row) => (
      <Badge variant={outcomeVariant(row.exitReason)} size="sm">
        {EXIT_LABEL[row.exitReason] ?? row.exitReason}
      </Badge>
    ),
    sortValue: (row) => row.exitReason,
  },
  {
    id: 'costPaise',
    header: 'Cost',
    numeric: true,
    hideBelow: 'xl',
    cell: (row) => <Price paise={row.costPaise} bare size="sm" />,
    sortValue: (row) => row.costPaise,
  },
  {
    id: 'rMultiple',
    header: 'Result',
    numeric: true,
    cell: (row) =>
      row.exitReason === 'unresolved' ? (
        <Text variant="caption">running</Text>
      ) : (
        <span className={cn('font-mono tabular-nums', toneFor(row.rMultiple))}>
          {signed(row.rMultiple)}R
        </span>
      ),
    sortValue: (row) => (row.exitReason === 'unresolved' ? null : row.rMultiple),
  },
];

function outcomeVariant(reason: string): 'bullish' | 'bearish' | 'neutral' | 'outline' {
  if (reason === 'target1' || reason === 'target2') return 'bullish';
  if (reason === 'stop') return 'bearish';
  if (reason === 'unresolved') return 'outline';
  return 'neutral';
}

/** Colour follows the sign, but the sign is always written out too. */
function toneFor(value: number): string {
  if (value > 0) return 'text-bullish';
  if (value < 0) return 'text-bearish';
  return '';
}

const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
