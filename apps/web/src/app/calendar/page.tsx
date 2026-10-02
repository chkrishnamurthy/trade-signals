import {
  MARKET_CALENDAR_RANGES,
  MARKET_EVENT_TYPES,
  type MarketCalendarRange,
  type MarketEventType,
  selectedMarketCalendarRange,
} from '@equitywise/shared';
import type { Metadata } from 'next';
import { CalendarView } from '@/components/calendar/calendar-view';
import { getMarketCalendar } from '@/server/market-calendar';

export const metadata: Metadata = {
  title: 'Market Calendar — EquityWise',
  description: 'NSE market holidays, results, corporate actions, and watchlist events.',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function rangeFrom(value: string | undefined): MarketCalendarRange {
  return MARKET_CALENDAR_RANGES.includes(value as MarketCalendarRange)
    ? (value as MarketCalendarRange)
    : 'month';
}

function eventTypeFrom(value: string | undefined): MarketEventType | undefined {
  return MARKET_EVENT_TYPES.includes(value as MarketEventType)
    ? (value as MarketEventType)
    : undefined;
}

export default async function MarketCalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const range = rangeFrom(first(params.range));
  const eventType = eventTypeFrom(first(params.eventType));
  const watchlistOnly = first(params.watchlistOnly) === 'true';
  const now = new Date();
  const selected = selectedMarketCalendarRange(range, now);
  const data = await getMarketCalendar(
    {
      ...selected,
      ...(eventType === undefined ? {} : { eventType }),
      watchlistOnly,
    },
    now,
  );

  return <CalendarView data={data} range={range} />;
}
