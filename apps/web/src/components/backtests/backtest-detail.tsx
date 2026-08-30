'use client';

import { AlertTriangleIcon, ArrowLeftIcon, FilterXIcon } from 'lucide-react';
import Link from 'next/link';
import { DataTable, type DataTableColumn } from '@/components/data-display/data-table';
import { MetricCard, MetricHint } from '@/components/data-display/metric-card';
import { AppShell } from '@/components/layout/app-shell';
import { ContentGrid } from '@/components/layout/grid';
import {
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import {
  directionLabel,
  expectancyStatus,
  MIN_TRADES_PER_BUCKET,
  outcomeMeta,
  sampleStatus,
  strategyMeta,
  winRateStatus,
} from '@/lib/paper-display';
import { cn } from '@/lib/utils';
import type { BacktestDetailDto, RejectionRow } from '@/server/backtests';
import type { PaperBucket, PaperTradeRow } from '@/server/paper-trades';

/**
 * One backtest run, read as a result rather than a dashboard.
 *
 * The order is deliberate and is the order the question is actually asked in:
 * what were the conditions, what came out, is the sample big enough to mean
 * anything, which parts differ, and — last but most useful — why did the vast
 * majority of setups never become trades at all.
 *
 * Statistics are computed server-side by `summarisePaperTrades`, the same pure
 * function that graded the live paper trades, so this page and
 * `/signals/performance` can never disagree about what a number means. Nothing
 * here recomputes an outcome.
 *
 * Two honesty rules, both load-bearing:
 *
 *  - **A bucket below the sample floor is shown greyed and labelled**, never
 *    ranked. A strategy with two trades and +2.6R is noise wearing the costume
 *    of a discovery, and presenting it as a finding is the single most harmful
 *    thing this page could do.
 *  - **The margin of error sits beside the headline**, not in a footnote.
 */

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** A bucket table, with thin buckets visibly demoted rather than hidden. */
function BucketTable({
  title,
  description,
  buckets,
  format = (label) => label,
}: {
  title: string;
  description?: string;
  buckets: readonly PaperBucket[];
  format?: (label: string) => string;
}) {
  if (buckets.length === 0) return null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <Text variant="card-title" as="span">
            {title}
          </Text>
          {description === undefined ? null : (
            <Text variant="caption" as="span">
              {description}
            </Text>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {buckets.map((entry) => {
            const thin = entry.trades < MIN_TRADES_PER_BUCKET;
            return (
              <div
                key={entry.label}
                className={cn(
                  'flex items-baseline justify-between gap-3 border-border/60 border-b pb-1.5 last:border-0 last:pb-0',
                  thin && 'opacity-60',
                )}
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-sm">{format(entry.label)}</span>
                  <span className="shrink-0 text-subtle-foreground text-xs tabular-nums">
                    n={entry.trades}
                  </span>
                  {thin ? (
                    <Badge variant="outline" size="sm">
                      too few to read
                    </Badge>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-baseline gap-3 tabular-nums">
                  <span className="text-subtle-foreground text-xs">{percent(entry.hitRate)}</span>
                  <span
                    className={cn(
                      'w-16 text-right font-medium text-sm',
                      thin
                        ? 'text-subtle-foreground'
                        : entry.expectancyR > 0
                          ? 'text-bullish-strong'
                          : 'text-bearish-strong',
                    )}
                  >
                    {signed(entry.expectancyR)}R
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A strategy's display name, WITH its direction.
 *
 * `strategyMeta` deliberately strips direction from the name, which is right on
 * a signal card where a direction badge sits beside it. In a bucket table it is
 * not: `trend-continuation-long` and `trend-continuation-short` are separate
 * rows with separate results, and rendering both as "Trend continuation" makes
 * the table look duplicated and its numbers unattributable.
 */
function strategyLabel(id: string): string {
  const meta = strategyMeta(id);
  if (meta.direction === null) return meta.name;
  return `${meta.name} ${meta.direction}`;
}

/**
 * A rejection reason, split into the strategy that raised it and the reason.
 *
 * The stored strings are normalised for grouping — every number is replaced by
 * a placeholder, so "target is 0.34% below the 0.35% floor" and the thousands of
 * near-identical variants collapse into one countable reason. That is right for
 * counting and unreadable on screen, where it renders as "is N, below the N
 * floor". The placeholder becomes an ellipsis here, and the strategy prefix is
 * lifted out so the sentence reads as a sentence.
 */
function splitRejection(reason: string): { strategy: string | null; text: string } {
  const match = /^([a-z0-9-]+):\s+(.*)$/.exec(reason);
  const strategy = match?.[1] ?? null;
  const rest = match?.[2] ?? reason;
  return { strategy, text: rest.replace(/\bN\b/g, '\u2026') };
}

function RejectionPanel({
  rejections,
  total,
}: {
  rejections: readonly RejectionRow[];
  total: number;
}) {
  if (rejections.length === 0) return null;
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Why setups never became trades</SectionTitle>
        <SectionDescription>
          {total.toLocaleString()} rejections across the run. This is the panel to read when the
          trade count is low — it separates &ldquo;the market was quiet&rdquo; from &ldquo;a filter
          is set wrong&rdquo;, which look identical from a trade list alone.
        </SectionDescription>
      </SectionHeader>
      <Card>
        <CardContent className="flex flex-col gap-2">
          {rejections.map((row) => (
            <div key={row.reason} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm">
                  {splitRejection(row.reason).strategy === null ? null : (
                    <span className="mr-1.5 text-subtle-foreground text-xs">
                      {strategyLabel(splitRejection(row.reason).strategy ?? '')}
                    </span>
                  )}
                  {splitRejection(row.reason).text}
                </span>
                <span className="shrink-0 text-subtle-foreground text-xs tabular-nums">
                  {row.count.toLocaleString()} · {percent(row.share)}
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-neutral-line"
                  style={{ width: `${Math.max(1, row.share * 100).toFixed(1)}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </Section>
  );
}

export function BacktestDetail({ detail }: { detail: BacktestDetailDto }) {
  const { run, results, rejections, rejectionTotal } = detail;
  if (run === null) return null;

  const { summary } = results;
  const moe = results.marginOfErrorPoints;
  const expectancy = expectancyStatus(summary.expectancyR, summary.trades);
  const winRate = winRateStatus(summary.hitRate, summary.breakevenHitRate, summary.trades, moe);
  const sample = sampleStatus(summary.trades);

  const tradeColumns: DataTableColumn<PaperTradeRow>[] = [
    {
      id: 'date',
      header: 'Date',
      sortValue: (row) => row.tradingDate,
      cell: (row) => <span className="tabular-nums text-xs">{row.tradingDate}</span>,
    },
    {
      id: 'symbol',
      header: 'Symbol',
      sortValue: (row) => row.symbol,
      cell: (row) => <span className="font-medium">{row.symbol}</span>,
    },
    {
      id: 'strategy',
      header: 'Setup',
      sortValue: (row) => row.strategy,
      cell: (row) => (
        <div className="flex flex-col">
          <span className="text-sm">{strategyMeta(row.strategy).name}</span>
          <span className="text-subtle-foreground text-xs">{directionLabel(row.direction)}</span>
        </div>
      ),
    },
    {
      id: 'score',
      header: 'Score',
      numeric: true,
      sortValue: (row) => row.score,
      cell: (row) => row.score,
      hideBelow: 'sm',
    },
    {
      id: 'exit',
      header: 'Outcome',
      sortValue: (row) => row.exitReason,
      cell: (row) => {
        const meta = outcomeMeta(row.exitReason);
        return (
          <Badge variant={meta.tone} size="sm">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      id: 'r',
      header: 'Result',
      numeric: true,
      sortValue: (row) => row.rMultiple,
      cell: (row) => (
        <span
          className={cn(
            'font-medium',
            row.rMultiple > 0 ? 'text-bullish-strong' : 'text-bearish-strong',
          )}
        >
          {signed(row.rMultiple)}R
        </span>
      ),
    },
    {
      id: 'cost',
      header: 'Costs',
      numeric: true,
      sortValue: (row) => row.costPaise,
      cell: (row) => (
        <span className="text-subtle-foreground text-xs tabular-nums">{row.costPaise} p</span>
      ),
      hideBelow: 'lg',
    },
    {
      id: 'held',
      header: 'Held',
      numeric: true,
      sortValue: (row) => row.barsHeld,
      cell: (row) => <span className="text-xs tabular-nums">{row.barsHeld}m</span>,
      hideBelow: 'lg',
    },
  ];

  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <Link
              href="/backtests"
              className="flex w-fit items-center gap-1 text-subtle-foreground text-sm underline-offset-4 hover:underline"
            >
              <ArrowLeftIcon className="size-3.5" aria-hidden />
              All backtests
            </Link>
            <PageTitle>{run.label ?? `Run #${run.id}`}</PageTitle>
            <PageDescription>
              {run.fromDate} → {run.toDate} · {run.sessionsTotal} sessions · {run.universeSize}{' '}
              symbols · every {run.cycleMinutes} minutes · {run.evaluations.toLocaleString()}{' '}
              evaluations · code {run.gitRevision}
            </PageDescription>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {run.overrides.length === 0 ? (
                <Badge variant="outline" size="sm">
                  default config
                </Badge>
              ) : (
                run.overrides.map((entry) => (
                  <Badge key={entry.key} variant="neutral" size="sm">
                    {entry.key} {entry.value}
                  </Badge>
                ))
              )}
              <Badge variant="outline" size="sm">
                bars: {run.barSource}
              </Badge>
            </div>
          </PageHeading>
        </PageHeader>

        <PageContent>
          {run.universeDated ? null : (
            <Alert variant="warning">
              <AlertTriangleIcon />
              <AlertTitle>Undated universe — this result is flattered</AlertTitle>
              <AlertDescription>
                Today&rsquo;s index membership was applied to every past session. Companies dropped
                from the index since then are invisible here, and they are disproportionately the
                ones that did badly. The size of the effect is unknown and cannot be corrected
                without a dated constituent list.
              </AlertDescription>
            </Alert>
          )}

          {run.error === null ? null : (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>This run failed</AlertTitle>
              <AlertDescription>{run.error}</AlertDescription>
            </Alert>
          )}

          <ContentGrid>
            <MetricCard
              label="Expectancy"
              hint="Average result per trade, in multiples of the risk taken. The single number that decides whether the engine has an edge."
              value={
                <span
                  className={cn(
                    summary.expectancyR > 0 ? 'text-bullish-strong' : 'text-bearish-strong',
                  )}
                >
                  {signed(summary.expectancyR)}R
                </span>
              }
              footer={<Text variant="caption">{expectancy.label}</Text>}
            />
            <MetricCard
              label="Hit rate"
              hint="Share of trades that finished in profit after costs."
              value={percent(summary.hitRate)}
              footer={
                <Text variant="caption">
                  {summary.breakevenHitRate === null
                    ? winRate.label
                    : `${percent(summary.breakevenHitRate)} needed just to break even`}
                </Text>
              }
            />
            <MetricCard
              label="Trades"
              hint="Resolved outcomes. Signals that never triggered, or were invalidated before entry, are not counted."
              value={summary.trades}
              aside={
                moe === null ? null : (
                  <Badge variant={summary.trades < 100 ? 'warning' : 'secondary'} size="sm">
                    ±{moe.toFixed(1)} pts
                  </Badge>
                )
              }
              footer={
                <Text variant="caption">
                  from {run.signalsGenerated} signals · {sample.label}
                </Text>
              }
            />
            <MetricCard
              label="Win / loss size"
              hint="Average winner and average loser, in R. When these are close to equal you need roughly a 50% hit rate to break even."
              value={
                <span className="text-base">
                  {signed(summary.averageWinR)}R <span className="text-subtle-foreground">vs</span>{' '}
                  {signed(summary.averageLossR)}R
                </span>
              }
              footer={
                <Text variant="caption">
                  profit factor{' '}
                  {summary.profitFactor === null ? '—' : summary.profitFactor.toFixed(2)}
                </Text>
              }
            />
          </ContentGrid>

          {summary.trades > 0 && summary.trades < 100 ? (
            <Alert>
              <FilterXIcon />
              <AlertTitle>Read this sample carefully</AlertTitle>
              <AlertDescription>
                {summary.trades} trades carries a margin of error of roughly ±
                {moe?.toFixed(0) ?? '?'} percentage points on the hit rate — wider than most of the
                differences between the buckets below. Do not tune a threshold on a difference
                smaller than that; it will not survive the next month.
              </AlertDescription>
            </Alert>
          ) : null}

          <Section>
            <SectionHeader>
              <SectionTitle>
                Where the result comes from
                <MetricHint>
                  Each slice is graded by the same function as the headline. Buckets with fewer than{' '}
                  {MIN_TRADES_PER_BUCKET} trades are dimmed — they are noise, not findings.
                </MetricHint>
              </SectionTitle>
            </SectionHeader>
            <ContentGrid>
              <BucketTable
                title="By outcome"
                description="How trades ended."
                buckets={results.byExit}
                format={(label) => outcomeMeta(label).label}
              />
              <BucketTable
                title="By setup type"
                description="Which strategies contributed."
                buckets={results.byStrategy}
                format={strategyLabel}
              />
              <BucketTable
                title="By score band"
                description="Does a higher score actually mean a better outcome?"
                buckets={results.byScore}
              />
              <BucketTable
                title="By direction"
                buckets={results.byDirection}
                format={(label) => directionLabel(label)}
              />
              <BucketTable
                title="By session regime"
                description="Which part of the trading day."
                buckets={results.byRegime}
              />
            </ContentGrid>
          </Section>

          <RejectionPanel rejections={rejections} total={rejectionTotal} />

          <Section>
            <SectionHeader>
              <SectionTitle>Every trade</SectionTitle>
              <SectionDescription>
                Each row is one signal the engine produced, filled at the next bar&rsquo;s open and
                charged real brokerage, taxes and slippage on both legs.
              </SectionDescription>
            </SectionHeader>
            <DataTable
              data={results.trades}
              columns={tradeColumns}
              getRowId={(row) => row.id}
              initialSort={{ columnId: 'date', direction: 'asc' }}
              emptyTitle="No trades"
              emptyDescription="Signals were produced but none reached a fill, or the filters passed nothing."
            />
          </Section>

          <Text variant="secondary">
            Every figure is per share, in R — multiples of the risk taken. No capital, quantity or
            position is represented. This measures the engine assuming every signal is taken
            mechanically, at the next minute&rsquo;s open, exited at the level or before the bell,
            with no discretion and no missed fills.
          </Text>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
