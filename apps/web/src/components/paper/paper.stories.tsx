import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ActivityList } from './activity-card';
import { ControlsCard } from './controls-card';
import {
  simulatedActivity,
  simulatedOverview,
  simulatedPerformance,
  simulatedTradesPage,
} from './fixture';
import { HistoryCard } from './history-card';
import { OpenTradesCard } from './open-trades-card';
import { StateBanners } from './paper-dashboard';
import { PaperStatus } from './paper-status-card';
import { PerformanceReport } from './performance-card';
import { SummaryCards } from './summary-cards';

/** SIMULATED fixtures: the real paper engine run over the worked example. */
const overview = simulatedOverview();
const off = simulatedOverview({
  settings: { ...overview.settings, enabled: false, enabledAt: null },
  openTrades: [],
  today: {
    ...overview.today,
    open: 0,
    trades: 0,
    netPaise: 0,
    realisedPaise: 0,
    unrealisedPaise: 0,
  },
});
const meta = {
  title: 'Paper trading/Cards',
  parameters: { layout: 'padded' },
} satisfies Meta;
export default meta;

const noop = () => undefined;
export const ControlsOn: StoryObj = {
  render: () => <ControlsCard data={overview} onChanged={noop} />,
};
export const ControlsOff: StoryObj = { render: () => <ControlsCard data={off} onChanged={noop} /> };
export const ControlsPaused: StoryObj = {
  render: () => (
    <ControlsCard
      data={simulatedOverview({ settings: { ...overview.settings, entriesPaused: true } })}
      onChanged={noop}
    />
  ),
};
export const Summary: StoryObj = { render: () => <SummaryCards data={overview} /> };
export const OpenTrades: StoryObj = { render: () => <OpenTradesCard data={overview} /> };
export const OpenTradesEmpty: StoryObj = {
  render: () => <OpenTradesCard data={simulatedOverview({ openTrades: [] })} />,
};
export const OpenTradesMarketClosed: StoryObj = {
  render: () => <OpenTradesCard data={simulatedOverview({ openTrades: [], phase: 'CLOSED' })} />,
};
export const Activity: StoryObj = { render: () => <ActivityList data={simulatedActivity()} /> };
export const History: StoryObj = { render: () => <HistoryCard initial={simulatedTradesPage()} /> };
export const Performance: StoryObj = {
  render: () => <PerformanceReport report={simulatedPerformance()} />,
};
export const StatusOnIntraday: StoryObj = { render: () => <PaperStatus data={overview} /> };
export const StatusOffOnIntraday: StoryObj = { render: () => <PaperStatus data={off} /> };
export const BannersFeedStale: StoryObj = {
  render: () => (
    <StateBanners
      data={simulatedOverview({
        feed: { ...overview.feed, mode: 'STALE', workerDelayed: true },
      })}
    />
  ),
};
export const BannersHalted: StoryObj = {
  render: () => (
    <StateBanners
      data={simulatedOverview({
        halts: [
          {
            id: 1,
            at: overview.serverNow - 60_000,
            kind: 'DAILY_LOSS_HALT',
            detail: {},
            resolvedAt: null,
          },
        ],
      })}
    />
  ),
};
export const BannersHoliday: StoryObj = {
  render: () => (
    <StateBanners
      data={simulatedOverview({
        phase: 'CLOSED',
        session: { ...overview.session, kind: 'HOLIDAY', note: 'Dussehra' },
      })}
    />
  ),
};
