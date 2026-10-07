'use client';

import {
  MARKET_EVENT_LABELS,
  MARKET_EVENT_TYPES,
  type MarketCalendarRange,
  type MarketCalendarResponse,
  type MarketEventDto,
  type MarketEventType,
} from '@equitywise/shared';
import {
  CalendarDaysIcon,
  ChevronRightIcon,
  ClockIcon,
  CoinsIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FlagIcon,
  GiftIcon,
  InfoIcon,
  LandmarkIcon,
  ListChecksIcon,
  type LucideIcon,
  MegaphoneIcon,
  RotateCcwIcon,
  ScissorsIcon,
  StarIcon,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type * as React from 'react';
import { useCallback } from 'react';
import { MetricCard } from '@/components/data-display/metric-card';
import { EmptyState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

const RANGE_OPTIONS: readonly { id: MarketCalendarRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

const TYPE_BADGE: Record<
  MarketEventType,
  'default' | 'secondary' | 'outline' | 'neutral' | 'warning'
> = {
  market_holiday: 'neutral',
  result: 'default',
  board_meeting: 'secondary',
  dividend: 'outline',
  bonus: 'outline',
  stock_split: 'outline',
  rights_issue: 'outline',
  buyback: 'outline',
  ipo: 'warning',
  corporate_announcement: 'secondary',
};

const EVENT_ICON: Record<MarketEventType, LucideIcon> = {
  market_holiday: CalendarDaysIcon,
  result: FileTextIcon,
  board_meeting: LandmarkIcon,
  dividend: CoinsIcon,
  bonus: GiftIcon,
  stock_split: ScissorsIcon,
  rights_issue: ListChecksIcon,
  buyback: RotateCcwIcon,
  ipo: FlagIcon,
  corporate_announcement: MegaphoneIcon,
};

export function formatMarketDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return dateKey;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatEventTime(iso: string): string {
  return `${new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso))} IST`;
}

export function eventTimingCopy(event: Pick<MarketEventDto, 'eventTime' | 'eventType'>): {
  compact: string;
  detail: string;
} {
  if (event.eventTime !== null) {
    const time = formatEventTime(event.eventTime);
    return { compact: time, detail: time };
  }
  if (event.eventType === 'market_holiday') {
    return {
      compact: 'Market closed',
      detail: 'Market closed for the regular equity session.',
    };
  }
  return {
    compact: 'Time not published',
    detail: 'Exact timing has not been published by the source.',
  };
}

function formatEventCategory(value: string): string {
  return value.replaceAll('_', ' ');
}

function groupedEvents(events: readonly MarketEventDto[]): readonly [string, MarketEventDto[]][] {
  const groups = new Map<string, MarketEventDto[]>();
  for (const event of events) {
    const group = groups.get(event.eventDate) ?? [];
    group.push(event);
    groups.set(event.eventDate, group);
  }
  return [...groups.entries()];
}

function dateParts(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return { weekday: '', day: dateKey, month: '' };
  }
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return {
    weekday: new Intl.DateTimeFormat('en-IN', {
      weekday: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(date),
    day: new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      timeZone: 'Asia/Kolkata',
    }).format(date),
    month: new Intl.DateTimeFormat('en-IN', {
      month: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(date),
  };
}

function useCalendarNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.push(query === '' ? pathname : `${pathname}?${query}`);
    },
    [params, pathname, router],
  );

  const clearFilters = useCallback(
    () => setParams({ range: null, eventType: null, watchlistOnly: null }),
    [setParams],
  );

  return { setParams, clearFilters };
}

export function CalendarView({
  data,
  range,
}: {
  data: MarketCalendarResponse;
  range: MarketCalendarRange;
}) {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Market Calendar</PageTitle>
            <PageDescription>
              Track results, corporate actions, holidays, and events that may affect your watchlist.
            </PageDescription>
          </PageHeading>
        </PageHeader>

        <PageContent>
          <CalendarSummary data={data} />
          <CalendarFilters data={data} range={range} />
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Text variant="caption">
              Coverage reflects stored, source-attributed events and may be partial.
            </Text>
          </div>
          <EventTimeline data={data} range={range} />
          <p className="text-subtle-foreground text-xs">
            This is market information, not investment advice.
          </p>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}

function SummaryIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

function CalendarSummary({ data }: { data: MarketCalendarResponse }) {
  const value = (count: number) => <Text variant="metric">{count}</Text>;
  return (
    <section aria-label="Market calendar summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard
        label="Today's events"
        value={value(data.summary.today)}
        aside={<SummaryIcon icon={CalendarDaysIcon} />}
        footer={<Text variant="caption">Today in IST</Text>}
      />
      <MetricCard
        label="This week's result events"
        value={value(data.summary.thisWeekResults)}
        aside={<SummaryIcon icon={FileTextIcon} />}
        footer={<Text variant="caption">Monday through Sunday</Text>}
      />
      <MetricCard
        label="Upcoming corporate actions"
        value={value(data.summary.upcomingCorporateActions)}
        aside={<SummaryIcon icon={GiftIcon} />}
        footer={<Text variant="caption">Next 30 days</Text>}
      />
      <MetricCard
        label="Watchlist-related events"
        value={value(data.summary.watchlistRelated)}
        aside={<SummaryIcon icon={StarIcon} />}
        footer={<Text variant="caption">Next 30 days</Text>}
      />
    </section>
  );
}

function CalendarFilters({
  data,
  range,
}: {
  data: MarketCalendarResponse;
  range: MarketCalendarRange;
}) {
  const { setParams, clearFilters } = useCalendarNavigation();
  const hasActiveFilters =
    range !== 'month' || data.filters.eventType !== null || data.filters.watchlistOnly;

  return (
    <section
      aria-label="Calendar filters"
      className="rounded-lg border border-border bg-surface-raised p-3 shadow-subtle"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <fieldset
          className="m-0 grid grid-cols-3 items-center gap-0.5 rounded-md border-0 bg-muted p-0.5 text-muted-foreground text-xs sm:inline-grid sm:w-fit"
          aria-label="Date range"
        >
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={range === option.id}
              onClick={() => setParams({ range: option.id === 'month' ? null : option.id })}
              className={cn(
                'rounded-sm px-3 py-1.5 font-medium transition-colors',
                range === option.id
                  ? 'bg-surface text-foreground shadow-subtle'
                  : 'hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </fieldset>

        <div className="flex min-w-0 items-center gap-2 text-sm">
          <label htmlFor="calendar-event-type" className="shrink-0 text-muted-foreground">
            Event type
          </label>
          <Select
            value={data.filters.eventType ?? 'all'}
            onValueChange={(value) => setParams({ eventType: value === 'all' ? null : value })}
          >
            <SelectTrigger id="calendar-event-type" className="min-w-0 flex-1 sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All event types</SelectItem>
              {MARKET_EVENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {MARKET_EVENT_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-sm lg:ml-auto">
          <Switch
            id="calendar-watchlist-only"
            checked={data.filters.watchlistOnly}
            disabled={!data.hasWatchlists}
            onCheckedChange={(checked) => setParams({ watchlistOnly: checked ? 'true' : null })}
          />
          <label
            htmlFor="calendar-watchlist-only"
            className={cn(!data.hasWatchlists && 'text-muted-foreground')}
          >
            Watchlist Only
          </label>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
              Clear filters
            </Button>
          )}
        </div>
      </div>
      {!data.hasWatchlists && (
        <Text variant="caption" className="mt-2 block lg:text-right">
          Add a stock to a watchlist to use this filter.
        </Text>
      )}
    </section>
  );
}

function EventTimeline({
  data,
  range,
}: {
  data: MarketCalendarResponse;
  range: MarketCalendarRange;
}) {
  const { clearFilters } = useCalendarNavigation();
  if (data.events.length === 0) {
    const type = data.filters.eventType;
    const title = data.filters.watchlistOnly
      ? 'No watchlist-related events in this period'
      : type === null
        ? 'No market events in this period'
        : `No ${MARKET_EVENT_LABELS[type].toLowerCase()} events in this period`;
    const hasActiveFilters =
      range !== 'month' || data.filters.eventType !== null || data.filters.watchlistOnly;
    return (
      <div className="rounded-lg border border-border bg-surface shadow-subtle">
        <EmptyState
          icon={<CalendarDaysIcon />}
          title={title}
          description="Try another date range or clear a filter."
          action={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
          className="min-h-56"
        />
      </div>
    );
  }

  return (
    <section aria-label="Market events" className="space-y-6">
      {groupedEvents(data.events).map(([date, events]) => {
        const parts = dateParts(date);
        return (
          <section
            key={date}
            aria-labelledby={`date-${date}`}
            className="grid gap-2.5 lg:grid-cols-[6rem_minmax(0,1fr)] lg:gap-4"
          >
            <div className="flex min-w-0 items-center gap-2 lg:flex-col lg:items-start lg:gap-0.5 lg:pt-2">
              <h2 id={`date-${date}`} className="sr-only">
                {formatMarketDate(date)}
              </h2>
              <Text variant="overline" className="shrink-0 text-muted-foreground">
                {parts.weekday}
              </Text>
              <span className="flex shrink-0 items-baseline gap-1.5 lg:gap-1">
                <span className="figure text-xl font-semibold tracking-tight text-foreground">
                  {parts.day}
                </span>
                <Text variant="caption" className="uppercase">
                  {parts.month}
                </Text>
              </span>
              <Text variant="caption" className="ml-auto whitespace-nowrap lg:ml-0 lg:mt-1">
                {events.length} {events.length === 1 ? 'event' : 'events'}
              </Text>
            </div>
            <ol className="min-w-0 space-y-2 border-border lg:border-l lg:pl-4">
              {events.map((event) => (
                <EventItem key={event.id} event={event} />
              ))}
            </ol>
          </section>
        );
      })}
    </section>
  );
}

function EventItem({ event }: { event: MarketEventDto }) {
  const Icon = EVENT_ICON[event.eventType];
  const timing = eventTimingCopy(event);
  return (
    <li>
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className={cn(
              'group block w-full rounded-lg border border-border bg-surface p-3 text-left shadow-subtle transition-colors hover:border-border-strong hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-3.5',
              event.onWatchlist && 'border-primary/40 bg-primary/5 hover:border-primary/60',
            )}
          >
            <span className="flex min-w-0 items-start gap-3">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground',
                  event.onWatchlist && 'border-primary/30 bg-primary/10 text-primary',
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={TYPE_BADGE[event.eventType]}>
                    {MARKET_EVENT_LABELS[event.eventType]}
                  </Badge>
                  {event.importance === 'high' && <Badge variant="warning">High importance</Badge>}
                  {event.onWatchlist && (
                    <Badge variant="outline" className="text-primary">
                      <StarIcon className="fill-current" aria-hidden />
                      On your watchlist
                    </Badge>
                  )}
                </span>
                <span className="mt-1.5 block text-sm font-semibold text-foreground">
                  {event.title}
                </span>
                {(event.symbol !== null || event.companyName !== null) && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {[event.symbol, event.companyName].filter(Boolean).join(' · ')}
                  </span>
                )}
                <span className="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {event.description ?? 'Further event details are not available.'}
                </span>
                <span className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border pt-2 text-xs text-subtle-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ClockIcon className="size-3.5" aria-hidden />
                    {timing.compact}
                  </span>
                  <span className="truncate">{event.sourceName ?? 'Source unavailable'}</span>
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-muted-foreground transition-colors group-hover:text-foreground">
                    View details
                    <ChevronRightIcon className="size-3.5" aria-hidden />
                  </span>
                </span>
              </span>
            </span>
          </button>
        </SheetTrigger>
        <SheetContent className="sm:max-w-xl motion-reduce:animate-none">
          <SheetHeader>
            <div className="flex min-w-0 items-start gap-3 pr-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <div className="min-w-0">
                <SheetTitle>{event.title}</SheetTitle>
                <SheetDescription className="whitespace-normal">
                  {event.companyName ?? event.symbol ?? 'Market-wide event'} ·{' '}
                  {MARKET_EVENT_LABELS[event.eventType]}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <SheetBody>
            <EventDetailContent event={event} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </li>
  );
}

export function EventDetailContent({ event }: { event: MarketEventDto }) {
  const timing = eventTimingCopy(event);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Badge variant={TYPE_BADGE[event.eventType]}>{MARKET_EVENT_LABELS[event.eventType]}</Badge>
        {event.eventCategory !== null && (
          <Badge variant="outline" className="capitalize">
            {formatEventCategory(event.eventCategory)}
          </Badge>
        )}
        {event.onWatchlist && (
          <Badge variant="outline" className="text-primary">
            <StarIcon className="fill-current" aria-hidden />
            On your watchlist
          </Badge>
        )}
      </div>

      <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        <DetailFact label="Event date" value={formatMarketDate(event.eventDate)} />
        <DetailFact label="Timing" value={timing.detail} />
        <DetailFact
          label="Company / symbol"
          value={[event.companyName, event.symbol].filter(Boolean).join(' · ') || 'Not applicable'}
        />
        <DetailFact label="Importance" value={event.importance ?? 'Not specified'} capitalize />
      </dl>

      <DetailSection icon={<FileTextIcon />} title="Plain-language explanation">
        <p>{event.description ?? 'Description unavailable.'}</p>
      </DetailSection>
      <DetailSection icon={<FlagIcon />} title="Why this matters">
        <p>{event.metadata.whyThisMatters ?? 'Additional context is unavailable.'}</p>
      </DetailSection>
      <DetailSection icon={<ListChecksIcon />} title="What to watch">
        {event.metadata.whatToWatch?.length ? (
          <ul className="list-disc space-y-1 pl-5">
            {event.metadata.whatToWatch.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>Observation points are unavailable.</p>
        )}
      </DetailSection>
      <DetailSection icon={<LandmarkIcon />} title="Source and provenance">
        <p>{event.sourceName ?? 'Source name unavailable.'}</p>
        {event.sourceUrl === null ? (
          <p>Source link unavailable.</p>
        ) : (
          <Button asChild variant="outline" size="sm">
            <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon aria-hidden />
              Open source
            </a>
          </Button>
        )}
      </DetailSection>
      <p className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-subtle-foreground text-xs">
        This is market information, not investment advice.
      </p>
    </div>
  );
}

function DetailFact({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="bg-surface p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 text-sm font-medium text-foreground', capitalize && 'capitalize')}>
        {value}
      </dd>
    </div>
  );
}

function DetailSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 text-sm shadow-subtle">
      <h2 className="flex items-center gap-2 font-semibold [&_svg]:size-4">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}
