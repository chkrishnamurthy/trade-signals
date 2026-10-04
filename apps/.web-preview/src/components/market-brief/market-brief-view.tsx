'use client';

import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';
import { useEffect, useState } from 'react';
import { StatTile } from '@/components/data-display/metric-card';
import { EmptyState } from '@/components/data-display/states';
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
  Section,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/layout/page';
import { PercentChange, Price } from '@/components/market/numeric';
import { SetupTag, SignalBadge, SignalStrength } from '@/components/market/signal';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/typography';
import type {
  AttentionItemDto,
  ChangeEventDto,
  DailyMarketBrief,
  MarketConditionFactor,
  SetupRowDto,
  WatchlistBriefItemDto,
} from '@/lib/market-brief';
import { cn } from '@/lib/utils';
import { FactorBreakdown } from './factor-breakdown';
import {
  AddToWatchlist,
  AttentionBadge,
  BreadthBar,
  ConditionBadge,
  formatIstTimestamp,
  formatSessionDate,
  StatusBadge,
  StatusBanner,
  StockName,
  WatchlistChips,
} from './parts';

/**
 * The Daily Market Brief page body (`/today`) — the signed-in home.
 *
 * It opens like a place a person arrives, not a console: a time-of-day
 * greeting, a one-line read on the session, then the headline figures and the
 * plain-English technical read side by side with the names they follow. The
 * deeper record — market condition factors, full breadth, what changed,
 * attention stocks and setup lists — follows beneath, summary before detail.
 *
 * It renders a read model the server already assembled — it performs no
 * calculation and issues no market-data call. Every score carries a factor
 * breakdown, direction is always paired with a text label, and prices are
 * formatted only here via the shared numeric components (which wrap
 * `formatPaise`).
 */
export function MarketBriefView({
  brief,
  defaultWatchlistId,
}: {
  brief: DailyMarketBrief;
  defaultWatchlistId: number | null;
}) {
  const { session } = brief;
  const isUnavailable = session.status === 'unavailable';

  return (
    <AppShell>
      <PageContainer>
        <GreetingHeader session={session} />

        <PageContent>
          <StatusBanner session={session} />

          {isUnavailable ? (
            <EmptyState
              title="No completed session to summarise"
              description="Once the daily end-of-day pass produces data, the brief will populate here."
            />
          ) : (
            <>
              <HeroStats brief={brief} />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
                <TechnicalReadCard brief={brief} />
                <MoversCard brief={brief} />
              </div>

              <OverviewSection brief={brief} />
              <ConditionSection brief={brief} />
              <ChangesSection changes={brief.changes} defaultWatchlistId={defaultWatchlistId} />
              <AttentionSection
                attention={brief.attention}
                defaultWatchlistId={defaultWatchlistId}
              />
              <SetupsSection setups={brief.setups} defaultWatchlistId={defaultWatchlistId} />
            </>
          )}

          <PageDisclaimer>{brief.disclaimer}</PageDisclaimer>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}

/** A warm, time-aware header. The greeting resolves after mount so the server
 *  and client markup never disagree about the viewer's local hour. */
function GreetingHeader({ session }: { session: DailyMarketBrief['session'] }) {
  const [greeting, setGreeting] = useState('Welcome back');
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  }, []);

  return (
    <PageHeader>
      <PageHeading>
        <PageTitle>{greeting} 👋</PageTitle>
        <PageDescription>
          Here&rsquo;s your read on the session that just closed —{' '}
          <span className="font-medium text-foreground">
            {formatSessionDate(session.sessionDate)}
          </span>
          {session.completedAt !== null && <> · {formatIstTimestamp(session.completedAt)} IST</>}.
        </PageDescription>
      </PageHeading>
      <PageActions>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <StatusBadge status={session.status} />
          <span className="text-muted-foreground">
            {session.availableInstruments} of {session.expectedInstruments} instruments
          </span>
        </div>
      </PageActions>
    </PageHeader>
  );
}

/** The four figures that frame the session, as tone-coloured cards. */
function HeroStats({ brief }: { brief: DailyMarketBrief }) {
  const { overview } = brief;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <HeroStatCard
        label={overview.indexName ?? 'Benchmark'}
        tone="neutral"
        value={
          overview.indexReturnPercent === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <PercentChange value={overview.indexReturnPercent} size="xl" />
          )
        }
      />
      <HeroStatCard label="Advancing" tone="bullish" value={overview.advances} />
      <HeroStatCard label="Declining" tone="bearish" value={overview.declines} />
      <HeroStatCard label="New bullish setups" tone="bullish" value={overview.newBullishSetups} />
    </div>
  );
}

function HeroStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone: 'bullish' | 'bearish' | 'neutral';
}) {
  const toneCls =
    tone === 'bullish'
      ? 'border-bullish/25 bg-bullish-soft/50'
      : tone === 'bearish'
        ? 'border-bearish/25 bg-bearish-soft/50'
        : 'border-border bg-surface';
  const valueCls =
    tone === 'bullish'
      ? 'text-bullish-strong'
      : tone === 'bearish'
        ? 'text-bearish-strong'
        : 'text-foreground';
  return (
    <div className={cn('rounded-lg border px-4 py-3 shadow-subtle', toneCls)}>
      <Text as="p" variant="overline" className="truncate normal-case">
        {label}
      </Text>
      <div className={cn('figure mt-1 font-semibold text-2xl tracking-tight', valueCls)}>
        {value}
      </div>
    </div>
  );
}

/** The plain-English read on the session — the headline paired with the
 *  market-condition label and a compact breadth summary. */
function TechnicalReadCard({ brief }: { brief: DailyMarketBrief }) {
  const { overview } = brief;
  return (
    <Card className="min-w-0">
      <CardContent className="flex flex-col gap-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle className="text-base">Today&rsquo;s technical read</SectionTitle>
          <ConditionBadge label={brief.marketCondition.label} />
        </div>
        <Text as="p" variant="body" className="text-pretty text-base leading-relaxed">
          {brief.headline}
        </Text>
        <dl className="grid grid-cols-3 gap-2 border-border border-t pt-4">
          <MiniStat label="Advances" value={overview.advances} tone="bullish" />
          <MiniStat label="Declines" value={overview.declines} tone="bearish" />
          <MiniStat label="New bullish" value={overview.newBullishSetups} tone="bullish" />
        </dl>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'bullish' | 'bearish';
}) {
  return (
    <div className="rounded-md bg-surface-sunken px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          'figure font-semibold text-lg',
          tone === 'bullish' ? 'text-bullish-strong' : 'text-bearish-strong',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Compact list of the names the user follows that moved this session. */
function MoversCard({ brief }: { brief: DailyMarketBrief }) {
  const { watchlists } = brief;
  const movers = [...watchlists.items]
    .sort((a, b) => Math.abs(b.sessionReturn ?? 0) - Math.abs(a.sessionReturn ?? 0))
    .slice(0, 6);

  return (
    <Card className="min-w-0">
      <CardContent className="flex h-full flex-col py-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <SectionTitle className="text-base">Movers you follow</SectionTitle>
          <Link
            href="/watchlists"
            className="inline-flex items-center gap-0.5 font-medium text-primary text-xs hover:underline"
          >
            Watchlists <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>

        {!watchlists.hasWatchlists ? (
          <EmptyState
            title="No watchlists yet"
            description="Follow a few names to get a personalised read each session."
            action={
              <Link
                href="/watchlists"
                className="text-primary text-sm underline underline-offset-4"
              >
                Create a watchlist
              </Link>
            }
          />
        ) : movers.length === 0 ? (
          <Text as="p" variant="secondary" className="py-4">
            No notable moves in the names you follow today.
          </Text>
        ) : (
          <ul className="divide-y divide-border">
            {movers.map((item) => (
              <MoverRow key={item.instrumentId} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MoverRow({ item }: { item: WatchlistBriefItemDto }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <StockName symbol={item.symbol} name={item.name} className="min-w-0 flex-1" />
      <Price paise={item.closePaise} size="sm" />
      {item.sessionReturn !== null && (
        <div className="w-16 text-right">
          <PercentChange value={item.sessionReturn} size="sm" />
        </div>
      )}
    </li>
  );
}

function ConditionSection({ brief }: { brief: DailyMarketBrief }) {
  const { marketCondition } = brief;
  return (
    <Section aria-labelledby="condition-heading">
      <SectionHeader>
        <SectionTitle id="condition-heading">Market condition</SectionTitle>
      </SectionHeader>
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <Text as="p" variant="secondary">
            {marketCondition.explanation}
          </Text>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {marketCondition.factors.map((factor) => (
              <ConditionFactor key={factor.id} factor={factor} />
            ))}
          </dl>
        </CardContent>
      </Card>
    </Section>
  );
}

function ConditionFactor({ factor }: { factor: MarketConditionFactor }) {
  const denominator =
    factor.availableCount !== undefined && factor.totalCount !== undefined
      ? `${factor.availableCount} of ${factor.totalCount}`
      : null;
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface px-3 py-2">
      <dt className="truncate text-muted-foreground text-xs">{factor.label}</dt>
      <dd className="figure mt-0.5 font-semibold text-foreground text-sm">{factor.value}</dd>
      {denominator !== null && <dd className="text-subtle-foreground text-2xs">{denominator}</dd>}
    </div>
  );
}

function OverviewSection({ brief }: { brief: DailyMarketBrief }) {
  const { overview } = brief;
  return (
    <Section aria-labelledby="overview-heading">
      <SectionHeader>
        <SectionTitle id="overview-heading">Market overview</SectionTitle>
      </SectionHeader>

      <Card>
        <CardContent className="py-4">
          <BreadthBar
            advances={overview.advances}
            declines={overview.declines}
            unchanged={overview.unchanged}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile
          label={overview.indexName ?? 'Benchmark'}
          value={
            overview.indexReturnPercent === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <PercentChange value={overview.indexReturnPercent} size="sm" />
            )
          }
          hint="Benchmark index session return, previous close to close."
        />
        <StatTile
          label="Advancing"
          value={<CountValue value={overview.advances} tone="bullish" />}
        />
        <StatTile
          label="Declining"
          value={<CountValue value={overview.declines} tone="bearish" />}
        />
        <StatTile
          label="Unchanged"
          value={<CountValue value={overview.unchanged} tone="muted" />}
        />
        <StatTile
          label="Above 20-day avg"
          value={<Fraction count={overview.above20DayAverage} total={overview.above20DayTotal} />}
        />
        <StatTile
          label="Above 50-day avg"
          value={<Fraction count={overview.above50DayAverage} total={overview.above50DayTotal} />}
        />
        <StatTile
          label="New bullish setups"
          value={<CountValue value={overview.newBullishSetups} tone="bullish" />}
        />
        <StatTile
          label="New bearish setups"
          value={<CountValue value={overview.newBearishSetups} tone="bearish" />}
        />
      </div>
    </Section>
  );
}

function CountValue({ value, tone }: { value: number; tone: 'bullish' | 'bearish' | 'muted' }) {
  const cls =
    tone === 'bullish'
      ? 'text-bullish-strong'
      : tone === 'bearish'
        ? 'text-bearish-strong'
        : 'text-foreground';
  return <span className={`figure font-semibold text-lg ${cls}`}>{value}</span>;
}

function Fraction({ count, total }: { count: number | null; total: number | null }) {
  if (count === null || total === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="figure font-semibold text-foreground text-lg">
      {count}
      <span className="text-subtle-foreground text-sm"> / {total}</span>
    </span>
  );
}

const EVENT_DIRECTION_TONE: Record<'bullish' | 'bearish' | 'neutral', string> = {
  bullish: 'text-bullish-strong',
  bearish: 'text-bearish-strong',
  neutral: 'text-muted-foreground',
};

function DirectionTag({ direction }: { direction: 'bullish' | 'bearish' | 'neutral' | null }) {
  if (direction === null) return null;
  const glyph = direction === 'bullish' ? '▲' : direction === 'bearish' ? '▼' : '→';
  const label = direction.charAt(0).toUpperCase() + direction.slice(1);
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${EVENT_DIRECTION_TONE[direction]}`}
    >
      <span aria-hidden>{glyph}</span>
      {label}
    </span>
  );
}

function ChangesSection({
  changes,
  defaultWatchlistId,
}: {
  changes: readonly ChangeEventDto[];
  defaultWatchlistId: number | null;
}) {
  return (
    <Section aria-labelledby="changes-heading" className="min-w-0">
      <SectionHeader>
        <SectionTitle id="changes-heading">What changed today</SectionTitle>
        <SectionDescription>Versus the previous completed session</SectionDescription>
      </SectionHeader>
      <Card className="min-w-0">
        <CardContent className="py-2">
          {changes.length === 0 ? (
            <EmptyState
              title="No notable technical changes"
              description="Nothing crossed a tracked threshold since the previous session."
            />
          ) : (
            <ul className="divide-y divide-border">
              {changes.map((change) => (
                <li
                  key={`${change.instrumentId}-${change.eventType}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
                >
                  <StockName symbol={change.symbol} name={change.name} className="flex-1" />
                  <DirectionTag direction={change.direction} />
                  <Price paise={change.closePaise} size="sm" />
                  {change.sessionReturn !== null && (
                    <PercentChange value={change.sessionReturn} size="sm" />
                  )}
                  <p className="w-full text-muted-foreground text-xs">{change.explanation}</p>
                  <div className="flex w-full items-center justify-between gap-2">
                    <WatchlistChips refs={change.watchlists} />
                    <AddToWatchlist
                      symbol={change.symbol}
                      defaultWatchlistId={defaultWatchlistId}
                      alreadyWatched={change.watchlists.length > 0}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </Section>
  );
}

function AttentionSection({
  attention,
  defaultWatchlistId,
}: {
  attention: readonly AttentionItemDto[];
  defaultWatchlistId: number | null;
}) {
  return (
    <Section aria-labelledby="attention-heading">
      <SectionHeader>
        <SectionTitle id="attention-heading">Top attention stocks</SectionTitle>
        <SectionDescription>
          Prioritised by deterministic attention factors — not a probability of profit
        </SectionDescription>
      </SectionHeader>
      <Card>
        <CardContent className="py-2">
          {attention.length === 0 ? (
            <EmptyState
              title="Nothing requires attention"
              description="No stock met an attention threshold this session."
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {attention.map((item) => (
                <AttentionCard
                  key={item.instrumentId}
                  item={item}
                  defaultWatchlistId={defaultWatchlistId}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </Section>
  );
}

function AttentionCard({
  item,
  defaultWatchlistId,
}: {
  item: AttentionItemDto;
  defaultWatchlistId: number | null;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-subtle">
      <div className="flex items-start justify-between gap-2">
        <StockName symbol={item.symbol} name={item.name} />
        <AttentionBadge level={item.level} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {item.direction !== null && <SignalBadge direction={item.direction} compact />}
        <Price paise={item.closePaise} size="sm" />
        {item.sessionReturn !== null && <PercentChange value={item.sessionReturn} size="sm" />}
      </div>
      <ul className="flex flex-wrap gap-1">
        {item.factors.map((factor) => (
          <li key={factor.id}>
            <SetupTag>{factor.label}</SetupTag>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <FactorBreakdown
          title={`${item.symbol} — why it's shown`}
          attentionFactors={item.factors}
          attentionTotal={item.score}
          signalFactors={item.signalFactors}
        />
        <AddToWatchlist
          symbol={item.symbol}
          defaultWatchlistId={defaultWatchlistId}
          alreadyWatched={item.watchlists.length > 0}
        />
      </div>
    </li>
  );
}

const SETUP_TABS = [
  { id: 'bullish', label: 'Bullish' },
  { id: 'bearish', label: 'Bearish' },
  { id: 'breakout', label: 'Breakout' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'unusualVolume', label: 'Unusual volume' },
] as const;

function SetupsSection({
  setups,
  defaultWatchlistId,
}: {
  setups: DailyMarketBrief['setups'];
  defaultWatchlistId: number | null;
}) {
  const available = SETUP_TABS.filter((tab) => setups[tab.id].length > 0);
  if (available.length === 0) return null;

  const firstTab = available[0];
  if (firstTab === undefined) return null;

  return (
    <Section aria-labelledby="setups-heading">
      <SectionHeader>
        <SectionTitle id="setups-heading">Setup lists</SectionTitle>
      </SectionHeader>
      <Card>
        <CardContent className="py-4">
          <Tabs defaultValue={firstTab.id}>
            <TabsList className="flex-wrap">
              {available.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                  <span className="ml-1 text-subtle-foreground">{setups[tab.id].length}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {available.map((tab) => (
              <TabsContent key={tab.id} value={tab.id}>
                <SetupList rows={setups[tab.id]} defaultWatchlistId={defaultWatchlistId} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </Section>
  );
}

function SetupList({
  rows,
  defaultWatchlistId,
}: {
  rows: readonly SetupRowDto[];
  defaultWatchlistId: number | null;
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.instrumentId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
          <StockName symbol={row.symbol} name={row.name} className="min-w-[9rem] flex-1" />
          {row.direction !== null && <SignalBadge direction={row.direction} compact />}
          <Price paise={row.closePaise} size="sm" />
          {row.sessionReturn !== null && <PercentChange value={row.sessionReturn} size="sm" />}
          {row.strength !== null && (
            <div className="w-28">
              <SignalStrength
                strength={row.strength}
                direction={row.direction ?? undefined}
                label={`${row.symbol} setup strength`}
              />
            </div>
          )}
          <p className="w-full text-muted-foreground text-xs sm:w-auto sm:flex-1">
            {row.explanation}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <FactorBreakdown
              title={`${row.symbol} — setup factors`}
              signalFactors={row.signalFactors}
            />
            <AddToWatchlist
              symbol={row.symbol}
              defaultWatchlistId={defaultWatchlistId}
              alreadyWatched={row.watchlists.length > 0}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
