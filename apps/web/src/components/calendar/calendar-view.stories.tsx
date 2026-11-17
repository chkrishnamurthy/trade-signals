import type { MarketCalendarResponse, MarketEventDto } from '@equitywise/shared';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { CalendarView } from './calendar-view';

const result: MarketEventDto = {
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

const data: MarketCalendarResponse = {
  events: [
    result,
    { ...result, id: 2, eventDate: '2026-10-11', onWatchlist: false },
    {
      ...result,
      id: 3,
      symbol: 'HINDUNILVR',
      companyName: 'Hindustan Unilever',
      title: 'Hindustan Unilever interim dividend, ex-date',
      eventDate: '2026-10-12',
      importance: 'medium',
      onWatchlist: false,
    },
  ],
  summary: { today: 2, thisWeekResults: 3, upcomingCorporateActions: 4, watchlistRelated: 1 },
  filters: { from: '2026-10-01', to: '2026-10-31', eventType: null, watchlistOnly: false },
  hasWatchlists: true,
  nowIso: '2026-10-10T05:00:00.000Z',
};

/**
 * The market calendar inside the application frame. The phone story guards the
 * filter row: range switch, event-type select and the watchlist toggle have to
 * stack without widening the page.
 */
const meta = {
  title: 'Pages/Market calendar',
  component: CalendarView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/calendar' } },
  },
  args: { data, range: 'month' },
} satisfies Meta<typeof CalendarView>;

export default meta;
type Story = StoryObj<typeof meta>;

const noSidewaysScroll = async () => {
  await waitFor(() => {
    const root = document.documentElement;
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  });
};

export const Desktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: noSidewaysScroll,
};

export const Tablet: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  play: noSidewaysScroll,
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  play: noSidewaysScroll,
};
