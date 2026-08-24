'use client';

import {
  AlertTriangleIcon,
  CircleAlertIcon,
  InfoIcon,
  MinusIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';
import type * as React from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-display/data-table';
import { MetricCard, MetricHint } from '@/components/data-display/metric-card';
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
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Text } from '@/components/ui/typography';
import {
  type AttentionItem,
  attentionItems,
  directionLabel,
  expectancyStatus,
  MIN_TRADES_PER_BUCKET,
  outcomeMeta,
  overallVerdict,
  profitFactorStatus,
  type RankedBucket,
  rankBest,
  readTrend,
  regimeMeta,
  type Status,
  sampleStatus,
  scoreBandLabel,
  splitByOutcome,
  strategyMeta,
  type Trend,
  winRateStatus,
} from '@/lib/paper-display';
import { TONE_GLYPH, type Tone, toneFill, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import type { PaperBucket, PaperResultsDto, PaperTradeRow } from '@/server/paper-trades';
import { ActionBadge, SignalsDisclaimer } from './vocabulary';

/**
 * Signal performance — what the tape did with the engine's setups.
 *
 * The page is built to be read top to bottom by someone who has never seen the
 * word "expectancy", and to answer six questions in that order: how is it
 * doing, what works, what does not, what changed, what do the signals mean, and
 * what needs attention. Every section below maps to one of those.
 *
 * The honesty of this page matters more than any other in the product, because
 * it is the one that could most easily be read as a promise. Four rules govern
 * it, and the friendlier presentation does not relax any of them:
 *
 *  - **No grade below a usable sample.** Every status badge reads "Too early"
 *    until there are enough trades to mean something; a red "Poor" over eleven
 *    trades would be a stronger claim than the data can support.
 *  - **Every rate carries its margin of error.** A hit rate over nineteen
 *    trades is an anecdote, and "63%" without "±23 points" beside it would be
 *    the most misleading thing here.
 *  - **Nothing is expressed in rupees of profit.** Results are per share and in
 *    R — multiples of the risk taken — because the application does not know
 *    the user's capital or position size and must not imply that it does.
 *  - **Open trades are shown but never counted.** A signal with no outcome
 *    cannot be a win or a loss.
 *
 * These are PAPER results: a mechanical record of what would have happened to
 * every triggered signal, taken at the next minute's open, exited at its level
 * or at the bell. No money was involved and no orders exist anywhere in this
 * application.
 */
export function PerformanceView({ results }: { results: PaperResultsDto }) {
  const { summary, marginOfErrorPoints } = results;

  if (summary.trades === 0) {
    return (
      <Shell>
        <Alert>
          <InfoIcon />
          <AlertTitle>Nothing to measure yet</AlertTitle>
          <AlertDescription>
            Results appear here once signals trigger and the worker resolves them against the tape.
            Nothing is estimated and nothing is filled in — an empty page means the engine has not
            yet produced a triggered setup, not that it performed badly.
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }

  const attention = attentionItems(results);
  const strategies = splitByOutcome(results.byStrategy);
  const trend = readTrend(results.bySession);

  return (
    <Shell>
      {/* 1. How is the overall performance? */}
      <VerdictCard results={results} />

      <ReadingNote />

      {/* The numbers behind the verdict, each with its own plain-language grade. */}
      <ContentGrid columns="metrics">
        <MetricCard
          label="Average per signal"
          hint="The average result of one signal, in multiples of the risk it took. This is the single number that decides whether the engine has an edge. Above zero makes money; below zero loses it."
          aside={<StatusBadge status={expectancyStatus(summary.expectancyR, summary.trades)} />}
          value={
            <BigNumber
              value={`${signed(summary.expectancyR)}R`}
              tone={toneOfR(summary.expectancyR)}
            />
          }
          footer={
            <Text variant="caption">
              After brokerage, taxes and assumed slippage — {results.sessions}{' '}
              {results.sessions === 1 ? 'session' : 'sessions'} of signals
            </Text>
          }
        />

        <MetricCard
          label="How often it works"
          hint="The share of graded signals that ended in profit after costs. On its own this number means nothing — what matters is whether it clears the breakeven rate shown beneath it."
          aside={
            <StatusBadge
              status={winRateStatus(
                summary.hitRate,
                summary.breakevenHitRate,
                summary.trades,
                marginOfErrorPoints,
              )}
            />
          }
          value={
            <BigNumber
              value={`${(summary.hitRate * 100).toFixed(0)}%`}
              tone={
                summary.breakevenHitRate === null
                  ? 'neutral'
                  : summary.hitRate >= summary.breakevenHitRate
                    ? 'bullish'
                    : 'bearish'
              }
            />
          }
          footer={
            <BreakevenMeter
              hitRate={summary.hitRate}
              breakeven={summary.breakevenHitRate}
              marginOfErrorPoints={marginOfErrorPoints}
              wins={summary.wins}
              losses={summary.losses}
            />
          }
        />

        <MetricCard
          label="Size of wins vs losses"
          hint="Everything won divided by everything lost. Above 1.00 means the winners outweigh the losers; below 1.00 means they do not, however often the signals are right."
          aside={<StatusBadge status={profitFactorStatus(summary.profitFactor, summary.trades)} />}
          value={
            <BigNumber
              value={summary.profitFactor === null ? '—' : summary.profitFactor.toFixed(2)}
              tone={
                summary.profitFactor === null
                  ? 'neutral'
                  : summary.profitFactor >= 1
                    ? 'bullish'
                    : 'bearish'
              }
            />
          }
          footer={
            <Text variant="caption">
              Typical win {signed(summary.averageWinR)}R · typical loss{' '}
              {signed(summary.averageLossR)}R
            </Text>
          }
        />

        <MetricCard
          label="How much to trust this"
          hint="How many resolved signals these figures rest on. Statistics from a small sample swing wildly, so this number governs how seriously to take every other number on the page."
          aside={<StatusBadge status={sampleStatus(summary.trades)} />}
          value={<BigNumber value={String(summary.trades)} tone="neutral" />}
          footer={
            <Text variant="caption">
              graded {summary.trades === 1 ? 'signal' : 'signals'}
              {marginOfErrorPoints === null
                ? ''
                : ` · win rate accurate to about ±${marginOfErrorPoints.toFixed(0)} points`}
              {results.open > 0 ? ` · ${results.open} still running, not counted` : ''}
            </Text>
          }
        />
      </ContentGrid>

      {/* 6. Are there any areas that need attention? Placed high — it is the
          section a reader most needs and least expects to have to look for. */}
      {attention.length > 0 && (
        <Section>
          <SectionHeader>
            <SectionTitle>Needs attention</SectionTitle>
            <SectionDescription>Derived from the results below, worst first</SectionDescription>
          </SectionHeader>
          <div className="flex flex-col gap-2">
            {attention.map((item) => (
              <AttentionRow key={item.id} item={item} />
            ))}
          </div>
        </Section>
      )}

      {/* 2 & 3. What is performing well, and what is performing poorly? */}
      <Section>
        <SectionHeader>
          <SectionTitle>What works and what does not</SectionTitle>
          <SectionDescription>
            By setup type. Bars compare average result per signal; a bucket under{' '}
            {MIN_TRADES_PER_BUCKET} trades is marked as too thin to read.
          </SectionDescription>
        </SectionHeader>
        <ContentGrid columns="split">
          <RankPanel
            title="Working"
            emptyNote="No setup type is profitable on this sample."
            tone="bullish"
            buckets={strategies.working}
            labelFor={(label) => strategyMeta(label).name}
            hintFor={(label) => strategyMeta(label).hint}
            directionFor={(label) => strategyMeta(label).direction}
          />
          <RankPanel
            title="Losing money"
            emptyNote="No setup type is losing on this sample."
            tone="bearish"
            buckets={strategies.failing}
            labelFor={(label) => strategyMeta(label).name}
            hintFor={(label) => strategyMeta(label).hint}
            directionFor={(label) => strategyMeta(label).direction}
          />
        </ContentGrid>
      </Section>

      {/* 4. What has improved or declined? */}
      <Section>
        <SectionHeader>
          <SectionTitle>Direction of travel</SectionTitle>
          <SectionDescription>Session by session, oldest on the left</SectionDescription>
        </SectionHeader>
        <TrendCard trend={trend} sessions={results.bySession} />
      </Section>

      {/* 5. What do the signals indicate? Four cuts of the same trades. */}
      <Section>
        <SectionHeader>
          <SectionTitle>Where the results come from</SectionTitle>
          <SectionDescription>
            The same graded signals, sliced four ways. Each row carries its own trade count, because
            a bucket with four trades in it is telling you nothing.
          </SectionDescription>
        </SectionHeader>
        <ContentGrid columns="cards">
          <BreakdownCard
            title="By signal score"
            caption="Higher scores should perform better. If they do not, the scoring is not working."
            buckets={results.byScore}
            labelFor={scoreBandLabel}
          />
          <BreakdownCard
            title="By time of day"
            caption="Which part of the session the signal triggered in."
            buckets={results.byRegime}
            labelFor={(label) => regimeMeta(label).label}
            hintFor={(label) => regimeMeta(label).hint}
          />
          <BreakdownCard
            title="By direction"
            caption="Whether the engine reads upside better than downside."
            buckets={results.byDirection}
            labelFor={directionLabel}
          />
          <BreakdownCard
            title="By how it ended"
            caption="Where each signal finished. Counts here are outcomes, not quality."
            buckets={results.byExit}
            labelFor={(label) => outcomeMeta(label).label}
            hintFor={(label) => outcomeMeta(label).hint}
          />
        </ContentGrid>
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>Every graded signal</SectionTitle>
          <SectionDescription>
            Per share, in paise. No quantity, no capital and no rupee profit — those depend on
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

      <SignalsDisclaimer />
    </Shell>
  );
}

/** Page chrome, shared by the empty and populated states. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <PageTitle>Signal performance</PageTitle>
              <Badge variant="outline" size="sm">
                Paper only — no money
              </Badge>
            </div>
            <PageDescription>
              What actually happened to every intraday signal that triggered, measured against the
              tape and charged real transaction costs. A scorecard for the engine, not for your
              trading.
            </PageDescription>
          </div>
        </PageHeader>
        <PageContent>{children}</PageContent>
      </PageContainer>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/**
 * The answer to "how is it doing?", before any number.
 *
 * A reader who looks at nothing else should still leave with the correct
 * impression, so this states the conclusion in words, gives the one number
 * behind it, and immediately says how much confidence it deserves.
 */
function VerdictCard({ results }: { results: PaperResultsDto }) {
  const verdict = overallVerdict(results);
  const { summary } = results;

  const accent = {
    bullish: 'border-bullish-line bg-bullish-soft',
    bearish: 'border-bearish-line bg-bearish-soft',
    neutral: 'border-border bg-surface',
  }[verdict.tone];

  return (
    <Card className={cn('border', accent)}>
      <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Text as="h2" variant="overline">
              Overall verdict
            </Text>
            <VerdictBadge grade={verdict.grade} tone={verdict.tone} />
          </div>
          <Text as="p" variant="display" className={toneText({ tone: verdict.tone })}>
            <span aria-hidden className="mr-2 text-2xl">
              {TONE_GLYPH[verdict.tone]}
            </span>
            {verdict.headline}
          </Text>
          <Text as="p" variant="secondary" className="max-w-2xl text-balance">
            {verdict.detail}
          </Text>
        </div>

        {/* The three numbers the verdict rests on, so it is never a bare assertion. */}
        <dl className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-1 lg:text-right">
          <VerdictFigure
            label="Per signal"
            value={`${signed(summary.expectancyR)}R`}
            tone={toneOfR(summary.expectancyR)}
          />
          <VerdictFigure
            label="Works"
            value={`${(summary.hitRate * 100).toFixed(0)}%`}
            tone="neutral"
          />
          <VerdictFigure
            label="Needs"
            value={
              summary.breakevenHitRate === null
                ? '—'
                : `${(summary.breakevenHitRate * 100).toFixed(0)}%`
            }
            tone="neutral"
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function VerdictFigure({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('figure text-lg font-semibold', toneText({ tone }))}>{value}</dd>
    </div>
  );
}

function VerdictBadge({ grade, tone }: { grade: string; tone: Tone }) {
  const variant = tone === 'bullish' ? 'bullish' : tone === 'bearish' ? 'bearish' : 'outline';
  const label =
    grade === 'good'
      ? 'Healthy'
      : grade === 'poor'
        ? 'Not working'
        : grade === 'mixed'
          ? 'Flat'
          : 'Unproven';
  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );
}

/**
 * The two definitions the rest of the page depends on.
 *
 * Placed once, immediately under the verdict, rather than repeated as a
 * footnote on every card. R is the only piece of jargon this page cannot avoid
 * — results have to be expressed in units of risk because the application does
 * not know the user's capital — so it is defined in the one place a reader will
 * already be looking.
 */
function ReadingNote() {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-sunken px-3.5 py-3">
      <Text as="p" variant="caption">
        <span className="font-medium text-foreground">R is the risk each signal named</span> — the
        distance from its entry to its invalidation level. A result of +2R means price travelled
        twice that distance in the signal&rsquo;s favour before it was proven wrong; &minus;1R means
        it was proven wrong. Results are shown this way, rather than in rupees, because the
        application does not know your capital or how much you would have traded.
      </Text>
      <Text as="p" variant="caption">
        Every figure assumes each signal is taken mechanically at the next minute&rsquo;s open, held
        to its target or its invalidation level, and closed at the bell if neither is reached — with
        no discretion and no missed fills. Brokerage, taxes and assumed slippage are already
        subtracted.
      </Text>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attention
// ---------------------------------------------------------------------------

const SEVERITY: Record<
  AttentionItem['severity'],
  { icon: typeof CircleAlertIcon; className: string; label: string }
> = {
  high: {
    icon: CircleAlertIcon,
    className: 'border-bearish-line bg-bearish-soft text-bearish-strong',
    label: 'Act on this',
  },
  medium: {
    icon: AlertTriangleIcon,
    className: 'border-warning-line bg-warning-soft text-warning-foreground',
    label: 'Look into it',
  },
  info: {
    icon: InfoIcon,
    className: 'border-border bg-surface text-foreground',
    label: 'For information',
  },
};

function AttentionRow({ item }: { item: AttentionItem }) {
  const severity = SEVERITY[item.severity];
  const Icon = severity.icon;
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border px-3.5 py-3', severity.className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Text variant="body" className="font-medium">
            {item.title}
          </Text>
          <span className="sr-only">{severity.label}</span>
        </div>
        <Text as="p" variant="caption" className="mt-0.5 opacity-90">
          {item.detail}
        </Text>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison panels
// ---------------------------------------------------------------------------

/**
 * One side of the working/not-working split.
 *
 * Bars are drawn on a scale shared with the other panel, so the eye can compare
 * a winner against a loser directly rather than within its own column.
 */
function RankPanel({
  title,
  tone,
  buckets,
  emptyNote,
  labelFor,
  hintFor,
  directionFor,
}: {
  title: string;
  tone: Tone;
  buckets: readonly RankedBucket[];
  emptyNote: string;
  labelFor: (label: string) => string;
  hintFor?: ((label: string) => string) | undefined;
  directionFor?: ((label: string) => 'long' | 'short' | null) | undefined;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Text as="h3" variant="card-title">
            <span aria-hidden className={cn('mr-1.5', toneText({ tone }))}>
              {TONE_GLYPH[tone]}
            </span>
            {title}
          </Text>
          <Text variant="caption">
            {buckets.length} {buckets.length === 1 ? 'setup type' : 'setup types'}
          </Text>
        </div>

        {buckets.length === 0 ? (
          <Text variant="caption">{emptyNote}</Text>
        ) : (
          <div className="flex flex-col gap-2.5">
            {buckets.map((entry) => (
              <ComparisonRow
                key={entry.label}
                label={labelFor(entry.label)}
                hint={hintFor?.(entry.label)}
                direction={directionFor?.(entry.label) ?? null}
                bucket={entry}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A titled card of comparison rows — one cut of the graded trades. */
function BreakdownCard({
  title,
  caption,
  buckets,
  labelFor,
  hintFor,
}: {
  title: string;
  caption: string;
  buckets: readonly PaperBucket[];
  labelFor: (label: string) => string;
  hintFor?: ((label: string) => string) | undefined;
}) {
  const ranked = rankBest(buckets);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <Text as="h3" variant="card-title">
            {title}
          </Text>
          <Text as="p" variant="caption" className="mt-0.5">
            {caption}
          </Text>
        </div>
        {ranked.length === 0 ? (
          <Text variant="caption">Nothing recorded yet.</Text>
        ) : (
          <div className="flex flex-col gap-2.5">
            {ranked.map((entry) => (
              <ComparisonRow
                key={entry.label}
                label={labelFor(entry.label)}
                hint={hintFor?.(entry.label)}
                direction={null}
                bucket={entry}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One bucket: what it is, how it did, and whether to believe it.
 *
 * The bar is the comparison instrument and the number is the fact; both are
 * present because a bar alone cannot be read precisely and a number alone
 * cannot be scanned. The trade count sits beside them so no row can be read as
 * more solid than it is.
 */
function ComparisonRow({
  label,
  hint,
  direction,
  bucket,
}: {
  label: string;
  hint?: string | undefined;
  direction: 'long' | 'short' | null;
  bucket: RankedBucket;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Text variant="body" className="truncate">
            {label}
          </Text>
          {direction !== null && <ActionBadge direction={direction} size="sm" />}
          {hint !== undefined && <MetricHint>{hint}</MetricHint>}
        </div>
        <span
          className={cn('figure shrink-0 text-sm font-medium', toneText({ tone: bucket.tone }))}
        >
          <span aria-hidden className="mr-1">
            {TONE_GLYPH[bucket.tone]}
          </span>
          {signed(bucket.expectancyR)}R
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className={cn('h-full rounded-full', toneFill({ tone: bucket.tone }))}
            style={{ width: `${Math.max(2, bucket.share * 100)}%` }}
          />
        </div>
        <Text variant="caption" className="shrink-0 tabular-nums">
          {bucket.trades} {bucket.trades === 1 ? 'signal' : 'signals'} ·{' '}
          {(bucket.hitRate * 100).toFixed(0)}% work
        </Text>
        {!bucket.reliable && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" size="sm" className="shrink-0 font-normal">
                thin
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Fewer than {MIN_TRADES_PER_BUCKET} signals. Read this row as a hint about where to
              look, never as a result.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

/** Recent sessions against earlier ones, plus the session-by-session shape. */
function TrendCard({ trend, sessions }: { trend: Trend; sessions: readonly PaperBucket[] }) {
  const tone: Tone =
    trend.direction === 'improving'
      ? 'bullish'
      : trend.direction === 'declining'
        ? 'bearish'
        : 'neutral';
  const Icon =
    trend.direction === 'improving'
      ? TrendingUpIcon
      : trend.direction === 'declining'
        ? TrendingDownIcon
        : MinusIcon;
  const headline =
    trend.direction === 'improving'
      ? 'Improving'
      : trend.direction === 'declining'
        ? 'Getting worse'
        : trend.direction === 'flat'
          ? 'No real change'
          : 'Not enough history';

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon className={cn('size-4', toneText({ tone }))} aria-hidden />
              <Text variant="card-title" className={toneText({ tone })}>
                {headline}
              </Text>
            </div>
            <Text as="p" variant="secondary" className="mt-1 max-w-xl text-balance">
              {trend.detail}
            </Text>
          </div>

          {trend.recentR !== null && trend.earlierR !== null && (
            <dl className="flex shrink-0 gap-6">
              <VerdictFigure
                label={`First ${trend.earlierSessions}`}
                value={`${signed(trend.earlierR)}R`}
                tone={toneOfR(trend.earlierR)}
              />
              <VerdictFigure
                label={`Last ${trend.recentSessions}`}
                value={`${signed(trend.recentR)}R`}
                tone={toneOfR(trend.recentR)}
              />
            </dl>
          )}
        </div>

        <SessionStrip sessions={sessions} />
      </CardContent>
    </Card>
  );
}

/**
 * One bar per session, above or below a centre line.
 *
 * Deliberately not a line chart: sessions are discrete and unevenly weighted,
 * and joining them with a line would imply a continuous quantity moving between
 * them. Scrolls horizontally rather than compressing on a phone, because bars
 * thinner than a couple of pixels stop carrying information.
 */
function SessionStrip({ sessions }: { sessions: readonly PaperBucket[] }) {
  if (sessions.length === 0) return null;
  const widest = Math.max(...sessions.map((entry) => Math.abs(entry.expectancyR)), 0.0001);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-x-auto">
        <div className="flex h-20 min-w-full items-stretch gap-1">
          {sessions.map((entry) => {
            const tone: Tone =
              entry.expectancyR > 0 ? 'bullish' : entry.expectancyR < 0 ? 'bearish' : 'neutral';
            const height = `${Math.max(4, (Math.abs(entry.expectancyR) / widest) * 100)}%`;
            return (
              <Tooltip key={entry.label}>
                <TooltipTrigger asChild>
                  {/* A real button, not a focusable div: the tooltip carries the
                      only copy of this bar's numbers, so it has to be reachable
                      by keyboard as well as by pointer. */}
                  <button
                    type="button"
                    className="flex min-w-2 flex-1 cursor-default flex-col justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="sr-only">
                      {entry.label}: {signed(entry.expectancyR)}R over {entry.trades}{' '}
                      {entry.trades === 1 ? 'signal' : 'signals'}
                    </span>
                    {/* Top half grows upward for a profitable session. */}
                    <div className="flex flex-1 items-end">
                      {entry.expectancyR > 0 && (
                        <div
                          className={cn('w-full rounded-sm', toneFill({ tone }))}
                          style={{ height }}
                        />
                      )}
                    </div>
                    <div className="h-px w-full bg-border" />
                    <div className="flex flex-1 items-start">
                      {entry.expectancyR <= 0 && (
                        <div
                          className={cn('w-full rounded-sm', toneFill({ tone }))}
                          style={{ height }}
                        />
                      )}
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {entry.label} · {signed(entry.expectancyR)}R over {entry.trades}{' '}
                  {entry.trades === 1 ? 'signal' : 'signals'} · {(entry.hitRate * 100).toFixed(0)}%
                  worked
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Text variant="caption">{sessions[0]?.label}</Text>
        {/* The legend is the first thing to go when the row gets tight: the
            dates are the axis, and without them the bars mean nothing. */}
        <Text variant="caption" className="hidden text-center sm:inline">
          Above the line: a profitable session. Below: a losing one.
        </Text>
        <Text variant="caption">{sessions.at(-1)?.label}</Text>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

function BigNumber({ value, tone }: { value: string; tone: Tone }) {
  return (
    <Text variant="metric" className={toneText({ tone })}>
      {value}
    </Text>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant={status.tone} size="sm">
      {status.label}
    </Badge>
  );
}

/**
 * Win rate against the rate this win/loss geometry needs.
 *
 * The most important comparison on the page and the hardest to state in words,
 * so it is drawn: the fill is what happens, the marker is what is required, and
 * the gap between them is the whole story.
 */
function BreakevenMeter({
  hitRate,
  breakeven,
  marginOfErrorPoints,
  wins,
  losses,
}: {
  hitRate: number;
  breakeven: number | null;
  marginOfErrorPoints: number | null;
  wins: number;
  losses: number;
}) {
  const clear = breakeven !== null && hitRate >= breakeven;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={cn('h-full rounded-full', clear ? 'bg-bullish' : 'bg-bearish')}
          style={{ width: `${Math.min(100, Math.max(1, hitRate * 100))}%` }}
        />
        {breakeven !== null && (
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground"
            style={{ left: `${Math.min(100, breakeven * 100)}%` }}
            aria-hidden
          />
        )}
      </div>
      <Text variant="caption">
        {wins}W / {losses}L
        {breakeven === null
          ? ' · breakeven undefined until there is a winner'
          : ` · needs ${(breakeven * 100).toFixed(0)}% to cover costs`}
        {marginOfErrorPoints === null ? '' : ` · ±${marginOfErrorPoints.toFixed(0)} pts`}
      </Text>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

const TRADE_COLUMNS: readonly DataTableColumn<PaperTradeRow>[] = [
  {
    id: 'symbol',
    header: 'Stock',
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
    header: 'Signal time',
    cell: (row) => <span className="font-mono text-xs tabular-nums">{istTime(row.entryAt)}</span>,
    sortValue: (row) => Date.parse(row.entryAt),
  },
  {
    id: 'tradingDate',
    header: 'Date',
    hideBelow: 'md',
    cell: (row) => <span className="font-mono text-xs">{row.tradingDate}</span>,
    sortValue: (row) => row.tradingDate,
  },
  {
    id: 'strategy',
    header: 'Setup type',
    hideBelow: 'lg',
    cell: (row) => {
      const meta = strategyMeta(row.strategy);
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm">{meta.name}</span>
          </TooltipTrigger>
          <TooltipContent>{meta.hint}</TooltipContent>
        </Tooltip>
      );
    },
    sortValue: (row) => strategyMeta(row.strategy).name,
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
    header: 'Entry price',
    numeric: true,
    hideBelow: 'sm',
    cell: (row) => <Price paise={row.entryPrice} bare size="sm" />,
    sortValue: (row) => row.entryPrice,
  },
  {
    id: 'exitPrice',
    header: 'Exit price',
    numeric: true,
    hideBelow: 'sm',
    cell: (row) => <Price paise={row.exitPrice} bare size="sm" />,
    sortValue: (row) => row.exitPrice,
  },
  {
    id: 'barsHeld',
    header: 'Held',
    numeric: true,
    hideBelow: 'xl',
    cell: (row) => <span className="font-mono text-xs tabular-nums">{row.barsHeld}m</span>,
    sortValue: (row) => row.barsHeld,
  },
  {
    id: 'costPaise',
    header: 'Costs',
    numeric: true,
    hideBelow: 'xl',
    cell: (row) => <Price paise={row.costPaise} bare size="sm" />,
    sortValue: (row) => row.costPaise,
  },
  {
    id: 'exitReason',
    header: 'How it ended',
    cell: (row) => {
      const meta = outcomeMeta(row.exitReason);
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={meta.tone} size="sm">
              {meta.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{meta.hint}</TooltipContent>
        </Tooltip>
      );
    },
    sortValue: (row) => outcomeMeta(row.exitReason).label,
  },
  {
    id: 'rMultiple',
    header: 'Result',
    numeric: true,
    cell: (row) =>
      row.exitReason === 'unresolved' ? (
        <Text variant="caption">running</Text>
      ) : (
        <span className={cn('figure tabular-nums', toneText({ tone: toneOfR(row.rMultiple) }))}>
          <span aria-hidden className="mr-1">
            {TONE_GLYPH[toneOfR(row.rMultiple)]}
          </span>
          {signed(row.rMultiple)}R
        </span>
      ),
    sortValue: (row) => (row.exitReason === 'unresolved' ? null : row.rMultiple),
  },
];

/** Tone of a result in R. Colour follows the sign; the sign is written too. */
function toneOfR(value: number): Tone {
  if (value > 0) return 'bullish';
  if (value < 0) return 'bearish';
  return 'neutral';
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
