import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ToastProvider } from '@/components/ui/toast';
import type { DailyMarketBrief } from '@/lib/market-brief';
import { SessionProvider, type SessionUser } from '@/lib/use-session';
import type { MarketBreadthDto } from '@/server/market-breadth';
import type { MarketBriefResponse } from '@/server/market-brief';
import { MarketBriefView } from './market-brief-view';

const watchlist = [{ watchlistId: 7, name: 'Core' }];
const emptySetups = { bullish: [], bearish: [], breakout: [], breakdown: [], unusualVolume: [] };

const brief: DailyMarketBrief = {
  session: {
    sessionDate: '2026-10-09',
    previousSessionDate: '2026-10-08',
    completedAt: '2026-10-09T12:45:00.000Z',
    status: 'complete',
    availableInstruments: 2_620,
    expectedInstruments: 2_620,
    sessionsBehind: 0,
  },
  headline: 'Broad participation weakened despite a positive benchmark close.',
  marketCondition: {
    label: 'bearish',
    explanation: 'Participation and long-term trend breadth were weak.',
    factors: [],
  },
  overview: {
    indexName: 'NIFTY 50',
    indexReturnPercent: 0.42,
    advances: 1_447,
    declines: 1_099,
    unchanged: 74,
    directionCovered: 2_620,
    above20DayAverage: 621,
    above20DayTotal: 2_620,
    above50DayAverage: 684,
    above50DayTotal: 2_620,
    newBullishSetups: 0,
    newBearishSetups: 0,
  },
  changes: [],
  attention: [],
  watchlists: {
    hasWatchlists: true,
    watchedCount: 2,
    affectedCount: 1,
    newBullishCount: 0,
    newBearishCount: 0,
    strengthenedCount: 1,
    invalidatedCount: 0,
    transitionCount: 1,
    items: [
      {
        instrumentId: 1,
        symbol: 'RELIANCE',
        name: 'Reliance Industries',
        eventType: 'crossed_above_ma20',
        direction: 'bullish',
        explanation: 'Crossed above its 20-day average.',
        closePaise: 140_250,
        sessionReturn: 1.24,
        watchlists: watchlist,
      },
    ],
  },
  setups: emptySetups,
  disclaimer: 'Technical research only; not investment advice.',
  signalsIncluded: false,
};

const history: MarketBreadthDto['history'] = Array.from({ length: 12 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 8, 24 + index)).toISOString().slice(0, 10),
  advances: 1_100 + index * 20,
  declines: 1_400 - index * 15,
  unchanged: 50,
  above20Pct: 28 + index * 0.6,
  above50Pct: 31 + index * 0.4,
  above200Pct: 37 + index * 0.3,
  newHighs: 12 + index,
  newLows: 54 - index,
}));

const industries: MarketBreadthDto['industries'] = [
  ['Capital Goods', 1.6],
  ['Healthcare', 1.2],
  ['Automobiles', 0.7],
  ['Banks', 0.3],
  ['Information Technology', 0.1],
  ['FMCG', -0.4],
  ['Metals', -1.1],
  ['Realty', -1.8],
].map(([industry, ret1m], index) => ({
  industry: String(industry),
  stocks: 20 + index,
  change1d: Number(ret1m) / 4,
  ret1w: Number(ret1m) / 2,
  ret1m: Number(ret1m),
  ret3m: Number(ret1m) * 1.5,
  above50Pct: 62 - index * 5,
}));

const marketLeader = (
  symbol: string,
  metric: number,
  changePct: number,
): MarketBreadthDto['leaders']['volume'][number] => ({
  symbol,
  name: `${symbol} Limited`,
  industry: 'Industrials',
  metric,
  changePct,
});

const breadth: MarketBreadthDto = {
  universe: 'all',
  session: '2026-10-09',
  builtAt: '2026-10-09T13:00:00.000Z',
  stale: false,
  history,
  industries,
  deliverySpikes: 18,
  leaders: {
    volume: [marketLeader('VOLUMECO', 3.2, 2.1)],
    delivery: [marketLeader('DELIVERYCO', 78.4, 1.6)],
    buildup: [marketLeader('FUTURESCO', 12.3, 1.1)],
    highs: [marketLeader('HIGHCO', 2.8, 3.4)],
    lows: [marketLeader('LOWCO', 2.1, -4.2)],
  },
};

const response: MarketBriefResponse = {
  brief,
  breadth,
  marketRead: {
    label: 'bearish',
    headline:
      'Market participation was bearish. 57% of directionally moving stocks advanced, while 40.3% held above their 200-day EMA; 23 stocks made new 52-week highs versus 43 new lows.',
  },
  personalMovers: [
    {
      instrumentId: 1,
      symbol: 'RELIANCE',
      name: 'Reliance Industries',
      closePaise: 140_250,
      sessionReturn: 1.24,
      watchlists: watchlist,
    },
  ],
  defaultWatchlistId: 7,
};

const user = (role: SessionUser['role']): SessionUser => ({
  email: `${role}@example.test`,
  role,
  profile: { displayName: role === 'admin' ? 'Admin' : 'Investor', avatarUrl: null },
});

function StoryPage({
  data,
  viewerRole,
}: {
  data: MarketBriefResponse;
  viewerRole: SessionUser['role'];
}) {
  return (
    <SessionProvider initial={{ status: 'signed-in', user: user(viewerRole) }}>
      <ToastProvider>
        <MarketBriefView {...data} />
      </ToastProvider>
    </SessionProvider>
  );
}

const meta = {
  title: 'Pages/Market Brief',
  component: MarketBriefView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/today' } },
    a11y: { test: 'error' },
  },
  args: response,
} satisfies Meta<typeof MarketBriefView>;

export default meta;
type Story = StoryObj<typeof meta>;

async function exerciseCoreInteractions(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('heading', { name: 'Market Brief' })).toBeInTheDocument();
  await expect(canvas.queryByRole('heading', { name: 'Strategy research' })).toBeNull();
  await expect(canvas.getByRole('link', { name: 'Nifty 500' })).toHaveAttribute(
    'href',
    '/today?u=nifty500',
  );

  await userEvent.click(canvas.getByRole('button', { name: '1D' }));
  await expect(canvas.getByRole('button', { name: '1D' })).toHaveAttribute('aria-pressed', 'true');

  await userEvent.click(canvas.getByRole('tab', { name: /52W lows/ }));
  await expect(canvas.getByText('LOWCO')).toBeVisible();
}

export const RegularUser: Story = {
  render: (args) => <StoryPage data={args} viewerRole="user" />,
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvasElement }) => exerciseCoreInteractions(canvasElement),
};

export const Mobile: Story = {
  render: (args) => <StoryPage data={args} viewerRole="user" />,
  globals: { viewport: { value: 'mobile', isRotated: false } },
  play: async ({ canvasElement }) => {
    await exerciseCoreInteractions(canvasElement);
    await waitFor(() => {
      const root = document.documentElement;
      expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    });
  },
};

export const Admin: Story = {
  args: { ...response, brief: { ...brief, signalsIncluded: true } },
  render: (args) => <StoryPage data={args} viewerRole="admin" />,
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Strategy research' })).toBeInTheDocument();
    await expect(canvas.getByText(/Admin-only/)).toBeInTheDocument();
  },
};
