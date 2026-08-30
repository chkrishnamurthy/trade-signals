'use client';

import { AlertTriangleIcon, TerminalIcon } from 'lucide-react';
import Link from 'next/link';
import { DataTable, type DataTableColumn } from '@/components/data-display/data-table';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import type { BacktestListDto, BacktestRunRow } from '@/server/backtests';

/**
 * Every backtest that has been run.
 *
 * A backtest is an EXPERIMENT, and the list is read as a lab notebook: what was
 * asked, over what window, with what settings, and what came out. So the
 * columns that identify a run — window, overrides, code revision — sit beside
 * the result rather than behind a click, because an expectancy figure without
 * the conditions that produced it is not a finding.
 *
 * Three things this page refuses to do:
 *
 *  - **Rank runs by expectancy.** Sorting experiments by outcome is how you
 *    talk yourself into the best-looking parameter on a sample too small to
 *    support it. The default order is chronological.
 *  - **Hide the sample size.** Trade count sits next to every result.
 *  - **Hide the survivorship caveat.** A run against an undated universe is
 *    badged as such, on the row, every time.
 *
 * Results are in R — multiples of the risk taken. No money is represented
 * anywhere, here or in the data behind it.
 */

const STATUS_VARIANT: Record<string, 'bullish' | 'bearish' | 'warning' | 'secondary'> = {
  succeeded: 'bullish',
  failed: 'bearish',
  cancelled: 'secondary',
  running: 'warning',
  queued: 'secondary',
};

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
}

function duration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 90) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

export function BacktestsPage({ list }: { list: BacktestListDto }) {
  const columns: DataTableColumn<BacktestRunRow>[] = [
    {
      id: 'run',
      header: 'Run',
      sortValue: (row) => Number(row.id),
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/backtests/${row.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.label ?? `Run #${row.id}`}
          </Link>
          <div className="text-subtle-foreground text-xs tabular-nums">
            #{row.id} · {row.fromDate} → {row.toDate}
          </div>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={STATUS_VARIANT[row.status] ?? 'secondary'} size="sm">
            {row.status}
          </Badge>
          {row.status === 'running' ? (
            <span className="text-subtle-foreground text-xs tabular-nums">
              {row.sessionsDone}/{row.sessionsTotal} sessions
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'sessions',
      header: 'Sessions',
      numeric: true,
      sortValue: (row) => row.sessionsTotal,
      cell: (row) => row.sessionsTotal,
      hideBelow: 'md',
    },
    {
      id: 'signals',
      header: 'Signals',
      numeric: true,
      sortValue: (row) => row.signalsGenerated,
      cell: (row) => row.signalsGenerated,
      hideBelow: 'lg',
    },
    {
      id: 'trades',
      header: 'Trades',
      numeric: true,
      sortValue: (row) => row.tradesRecorded,
      cell: (row) => (
        <span className={cn(row.tradesRecorded < 30 && 'text-subtle-foreground')}>
          {row.tradesRecorded}
        </span>
      ),
    },
    {
      id: 'hitRate',
      header: 'Hit rate',
      numeric: true,
      sortValue: (row) => row.hitRate,
      cell: (row) => (row.hitRate === null ? '—' : `${(row.hitRate * 100).toFixed(1)}%`),
      hideBelow: 'sm',
    },
    {
      id: 'expectancy',
      header: 'Expectancy',
      numeric: true,
      sortValue: (row) => row.expectancyR,
      cell: (row) =>
        row.expectancyR === null ? (
          '—'
        ) : (
          <span
            className={cn(
              'font-medium',
              row.expectancyR > 0 ? 'text-bullish-strong' : 'text-bearish-strong',
            )}
          >
            {signed(row.expectancyR)}R
          </span>
        ),
    },
    {
      id: 'conditions',
      header: 'Conditions',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.overrides.length === 0 ? (
            <Badge variant="outline" size="sm">
              default config
            </Badge>
          ) : (
            row.overrides.map((entry) => (
              <Badge key={entry.key} variant="neutral" size="sm">
                {entry.key} {entry.value}
              </Badge>
            ))
          )}
          <Badge variant="outline" size="sm">
            {row.barSource}
          </Badge>
          {row.universeDated ? null : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Badge variant="warning" size="sm">
                    undated universe
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Today&rsquo;s index membership was applied to every past session, so companies
                dropped from the index since are invisible. This flatters the result by an unknown
                amount.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
      hideBelow: 'xl',
    },
    {
      id: 'meta',
      header: 'Code',
      numeric: true,
      cell: (row) => (
        <span className="font-mono text-subtle-foreground text-xs">
          {row.gitRevision} · {duration(row.durationSeconds)}
        </span>
      ),
      hideBelow: 'xl',
    },
  ];

  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Backtests</PageTitle>
            <PageDescription>
              Historical replays of the signal engine over stored candles — graded against the tape,
              charged real transaction costs, and kept entirely separate from live results.
            </PageDescription>
          </PageHeading>
        </PageHeader>

        <PageContent>
          {list.configured ? null : (
            <Alert variant="warning">
              <AlertTriangleIcon />
              <AlertTitle>No database configured</AlertTitle>
              <AlertDescription>
                Set <code>DATABASE_URL</code> so stored backtest runs can be read.
              </AlertDescription>
            </Alert>
          )}

          <DataTable
            data={list.runs}
            columns={columns}
            getRowId={(row) => row.id}
            initialSort={{ columnId: 'run', direction: 'desc' }}
            emptyTitle="No backtests yet"
            emptyDescription="Run one from the terminal, then reload this page."
          />

          <Alert>
            <TerminalIcon />
            <AlertTitle>Running a backtest</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col gap-2">
                <Text variant="secondary">
                  Backtests are produced by the worker-side script, never by this page — the browser
                  never runs the engine.
                </Text>
                <code className="block rounded-md bg-muted px-3 py-2 font-mono text-xs">
                  pnpm backtest:intraday --from 2026-05-01 --label &quot;my experiment&quot;
                </code>
                <Text variant="secondary">
                  Add <code>--min-score 75</code> or <code>--target-atr 2.5</code> to test a change
                  without editing any config file.
                </Text>
              </div>
            </AlertDescription>
          </Alert>

          <Text variant="secondary">
            Every figure is per share, in R — multiples of the risk taken on the trade. No capital,
            quantity or position is represented. This measures the engine, not your trading.
          </Text>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
