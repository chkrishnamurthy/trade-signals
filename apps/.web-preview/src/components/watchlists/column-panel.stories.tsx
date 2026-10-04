import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DEFAULT_COLUMN_IDS } from '@/lib/watchlist-columns';
import { ColumnPanel } from './column-panel';

/**
 * Customize columns — a two-half Sheet: pick which columns (grouped, searchable)
 * on the left, order the chosen ones (draggable, with keyboard equivalents) on
 * the right. Columns with no data source render disabled with the reason.
 */
const meta = {
  title: 'Features/Watchlist/ColumnPanel',
  component: ColumnPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    columnIds: DEFAULT_COLUMN_IDS.slice(1),
    onChange: () => {},
  },
} satisfies Meta<typeof ColumnPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MinimalColumns: Story = {
  args: { columnIds: ['ltp', 'changePercent'] },
};
