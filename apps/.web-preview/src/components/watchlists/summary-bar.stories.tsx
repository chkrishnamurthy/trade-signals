import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WATCHLIST_PERFORMANCE } from '@/stories/fixtures/watchlist';
import { SummaryBar } from './summary-bar';

/**
 * How a watchlist is doing, in one strip — count + breadth bar, average move,
 * best/worst movers, turnover. The "No quote" stat only appears when non-zero.
 */
const meta = {
  title: 'Features/Watchlist/SummaryBar',
  component: SummaryBar,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SummaryBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { performance: WATCHLIST_PERFORMANCE, filtered: false },
};

export const Filtered: Story = {
  args: { performance: WATCHLIST_PERFORMANCE, filtered: true },
};

/** No unquoted rows → the "No quote" stat is omitted rather than showing "0". */
export const AllQuoted: Story = {
  args: {
    performance: { ...WATCHLIST_PERFORMANCE, unquoted: 0, total: 3 },
    filtered: false,
  },
};
