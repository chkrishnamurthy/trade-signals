import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WATCHLIST_LISTS } from '@/stories/fixtures/watchlist';
import { WatchlistTabs } from './watchlist-tabs';

/**
 * The watchlist selector, as a horizontal strip. Management (rename, default,
 * reorder, delete) lives behind a menu on the ACTIVE tab only. Reorder is a drag,
 * with keyboard "Move left/right" in the menu.
 */
const meta = {
  title: 'Features/Watchlist/Tabs',
  component: WatchlistTabs,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    lists: WATCHLIST_LISTS,
    activeId: 1,
    loading: false,
    onSelect: () => {},
    onCreate: async () => ({ ok: true }),
    onRename: async () => ({ ok: true }),
    onDelete: () => {},
    onPickTemplate: async () => true,
    creatingTemplateId: null,
    onMakeDefault: () => {},
    onReorder: () => {},
  },
} satisfies Meta<typeof WatchlistTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: { loading: true },
};

export const SingleList: Story = {
  args: { lists: WATCHLIST_LISTS.slice(0, 1) },
};
