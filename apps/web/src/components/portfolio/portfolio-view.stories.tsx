import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import type { PortfolioDto, PortfolioHoldingDto } from '@/lib/portfolio-types';
import { PortfolioView } from './portfolio-view';

/**
 * The portfolio overview inside the real application frame, at the widths it
 * has to hold: a phone (375), a tablet (768) and a desktop.
 *
 * The figures are deliberately long — a six-digit loss with its percent, a
 * long company name — because those are what clipped on a phone before the
 * header and the summary cards were given a mobile layout.
 */
function holding(
  instrumentId: number,
  symbol: string,
  name: string,
  shares: number,
  avgCostPaise: number,
  ltpPaise: number,
  dayChangeRatio: number,
): PortfolioHoldingDto {
  const costPaise = shares * avgCostPaise;
  const valuePaise = shares * ltpPaise;
  return {
    instrumentId,
    symbol,
    name,
    shares,
    costPaise,
    avgCostPaise,
    ltpPaise,
    priceSource: 'close',
    priceAsOf: '2026-11-16T10:00:00.000Z',
    valuePaise,
    gainPaise: valuePaise - costPaise,
    gainRatio: (valuePaise - costPaise) / costPaise,
    dayChangePaise: Math.round(valuePaise * dayChangeRatio),
    dayChangeRatio,
    weight: null,
    adjustments: [],
    historyGapBefore: null,
  };
}

const raw = [
  holding(1, 'JIOFIN', 'Jio Financial Services', 350, 23_251, 22_600, -0.0066),
  holding(2, 'HDFCBANK', 'HDFC Bank', 90, 78_011, 81_650, 0.0084),
  holding(3, 'TMPV', 'Tata Motors Passenger Vehicles', 174, 40_280, 26_240, -0.087),
  holding(4, 'HINDUNILVR', 'Hindustan Unilever', 22, 2_41_000, 2_36_450, 0.0031),
  holding(5, 'SWIGGY', 'Swiggy', 180, 41_200, 19_070, 0.0187),
];
const valuePaise = raw.reduce((sum, h) => sum + (h.valuePaise ?? 0), 0);
const costPaise = raw.reduce((sum, h) => sum + h.costPaise, 0);
const dayChangePaise = raw.reduce((sum, h) => sum + (h.dayChangePaise ?? 0), 0);
const holdings = raw.map((h) => ({ ...h, weight: (h.valuePaise ?? 0) / valuePaise }));

const portfolio: PortfolioDto = {
  holdings,
  entries: [],
  entryCount: holdings.length,
  entryLimit: 500,
  totals: {
    valuePaise,
    costPaise,
    pricedCostPaise: costPaise,
    gainPaise: valuePaise - costPaise,
    gainRatio: (valuePaise - costPaise) / costPaise,
    dayChangePaise,
    dayChangeRatio: dayChangePaise / valuePaise,
    unpriced: 0,
  },
  pricesAsOf: '2026-11-16T10:00:00.000Z',
  pricesStale: false,
  problems: [],
  upcoming: [],
  returns: null,
  hasRemovals: false,
};

const meta = {
  title: 'Pages/Portfolio',
  component: PortfolioView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/portfolio' } },
  },
  args: { portfolio, fifoNoteSeen: true },
} satisfies Meta<typeof PortfolioView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No figure may be cut off and the page may not scroll sideways. */
const holdsTogether = async () => {
  await waitFor(() => {
    const root = document.documentElement;
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  });
};

export const Desktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: holdsTogether,
};

export const Tablet: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  play: holdsTogether,
};

/** One header row: the title, "Add shares" and a menu holding the rest. */
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  play: holdsTogether,
};

/** Nothing added yet: the onboarding card and the privacy notes. */
export const MobileEmpty: Story = {
  args: {
    portfolio: { ...portfolio, holdings: [], entryCount: 0, pricesAsOf: null },
  },
  globals: { viewport: { value: 'mobile', isRotated: false } },
  play: holdsTogether,
};
