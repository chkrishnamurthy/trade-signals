import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SAVED_VIEWS, WATCHLIST_LAYOUT } from '@/stories/fixtures/watchlist';
import { QuickViews } from './quick-views';

/**
 * One-click view presets, plus the user's own saved configurations. A quick view
 * changes columns/sort/filters — never which stocks are in the list. Views whose
 * data this app lacks render disabled with the reason, never hidden.
 */
const meta = {
  title: 'Features/Watchlist/QuickViews',
  component: QuickViews,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    activeId: null,
    savedViews: SAVED_VIEWS,
    layout: WATCHLIST_LAYOUT,
    onApply: () => {},
    onApplySaved: () => {},
    onSave: async () => ({ ok: true }),
    onDeleteSaved: () => {},
  },
} satisfies Meta<typeof QuickViews>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoSavedViews: Story = {
  args: { savedViews: [] },
};
