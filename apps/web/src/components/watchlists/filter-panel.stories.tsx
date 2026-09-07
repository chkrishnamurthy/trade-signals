import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FilterPanel } from './filter-panel';

/**
 * The filters popover. Range inputs are typed in DISPLAY units (₹ for a price)
 * and read their label/unit from the column registry. Columns with no data
 * source render disabled with the reason.
 */
const meta = {
  title: 'Features/Watchlist/FilterPanel',
  component: FilterPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    sectors: ['Energy', 'IT', 'FMCG', 'Consumer'],
    exchanges: ['NSE'],
    onChange: () => {},
    onClear: () => {},
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-[34rem] items-start">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FilterPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoFilters: Story = {
  args: { filters: {} },
};

/** The trigger shows a count badge when filters are active. */
export const WithActiveFilters: Story = {
  args: {
    filters: {
      direction: 'advancing',
      ranges: { rsi14: { min: 50, max: null }, ltp: { min: 100000, max: null } },
      flags: [],
      sectors: ['IT'],
    },
  },
};
