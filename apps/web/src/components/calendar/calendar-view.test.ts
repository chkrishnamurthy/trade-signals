import type { MarketCalendarResponse, MarketEventDto } from '@equitywise/shared';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/calendar',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

import {
  CalendarView,
  EventDetailContent,
  eventTimingCopy,
  formatMarketDate,
} from './calendar-view';

const event: MarketEventDto = {
  id: 1,
  instrumentId: 42,
  symbol: 'TCS',
  companyName: 'Tata Consultancy Services',
  eventType: 'result',
  eventCategory: 'quarterly_results',
  title: 'TCS quarterly results',
  description: 'The company is expected to publish its quarterly results.',
  eventDate: '2026-10-10',
  eventTime: '2026-10-10T04:00:00.000Z',
  sourceName: 'NSE',
  sourceUrl: 'https://www.nseindia.com/',
  importance: 'high',
  metadata: {
    whyThisMatters: 'The release updates the public financial record.',
    whatToWatch: ['Read the filed financial statements.'],
  },
  onWatchlist: true,
};

const response: MarketCalendarResponse = {
  events: [event, { ...event, id: 2, eventDate: '2026-10-11', onWatchlist: false }],
  summary: {
    today: 2,
    thisWeekResults: 3,
    upcomingCorporateActions: 4,
    watchlistRelated: 1,
  },
  filters: {
    from: '2026-10-01',
    to: '2026-10-31',
    eventType: null,
    watchlistOnly: false,
  },
  hasWatchlists: true,
  nowIso: '2026-10-10T05:00:00.000Z',
};

describe('market calendar presentation', () => {
  it('shows the summary, grouped dates and a watchlist marker', () => {
    const html = renderToStaticMarkup(
      createElement(CalendarView, { data: response, range: 'month' }),
    );
    expect(html).toContain('Market Calendar');
    expect(html).toContain('Today&#x27;s events');
    expect(html).toContain('This week&#x27;s result events');
    expect(html).toContain('Upcoming corporate actions');
    expect(html).toContain('Watchlist-related events');
    expect(html).toContain('Saturday, 10 October 2026');
    expect(html).toContain('Sunday, 11 October 2026');
    expect(html).toContain('On your watchlist');
    expect(html).toContain(
      'Coverage reflects stored, source-attributed events and may be partial.',
    );
    expect(html).toContain('This is market information, not investment advice.');
    expect(html).not.toContain('Time not specified');
  });

  it('shows contextual empty copy for a watchlist filter', () => {
    const html = renderToStaticMarkup(
      createElement(CalendarView, {
        data: {
          ...response,
          events: [],
          filters: { ...response.filters, watchlistOnly: true },
        },
        range: 'month',
      }),
    );
    expect(html).toContain('No watchlist-related events in this period');
    expect(html).toContain('Try another date range or clear a filter.');
  });

  it('renders detail provenance, observation points and missing values safely', () => {
    const detail = renderToStaticMarkup(createElement(EventDetailContent, { event }));
    expect(detail).toContain('Why this matters');
    expect(detail).toContain('Read the filed financial statements.');
    expect(detail).toContain('Open source');
    expect(detail).toContain('rel="noopener noreferrer"');

    const missing = renderToStaticMarkup(
      createElement(EventDetailContent, {
        event: {
          ...event,
          symbol: null,
          companyName: null,
          eventTime: null,
          sourceName: null,
          sourceUrl: null,
          importance: null,
          metadata: {},
        },
      }),
    );
    expect(missing).toContain('Exact timing has not been published by the source.');
    expect(missing).not.toContain('Time not specified');
    expect(missing).toContain('Not applicable');
    expect(missing).toContain('Source name unavailable.');
    expect(missing).toContain('Source link unavailable.');
  });

  it('formats date keys independently of the host timezone', () => {
    expect(formatMarketDate('2026-10-10')).toBe('Saturday, 10 October 2026');
  });

  it('explains timed, date-only and holiday events without implying missing data', () => {
    const timed = eventTimingCopy(event);
    expect(timed.compact).toContain('09:30');
    expect(timed.compact).toContain('IST');

    expect(eventTimingCopy({ eventType: 'result', eventTime: null })).toEqual({
      compact: 'Time not published',
      detail: 'Exact timing has not been published by the source.',
    });
    expect(eventTimingCopy({ eventType: 'market_holiday', eventTime: null })).toEqual({
      compact: 'Market closed',
      detail: 'Market closed for the regular equity session.',
    });
  });
});
