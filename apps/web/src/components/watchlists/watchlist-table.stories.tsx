import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '@/components/ui/button';
import { DEFAULT_COLUMN_IDS } from '@/lib/watchlist-columns';
import {
  WATCHLIST_LISTS,
  WATCHLIST_ROWS,
  WATCHLIST_ROWS_MULTI_EXCHANGE,
} from '@/stories/fixtures/watchlist';
import { WatchlistTable } from './watchlist-table';

/**
 * The watchlist table — renders through the shared `DataTable`, adding the
 * registry-resolved column set, the per-row action menu, and the expandable
 * row-detail. Sorting is controlled (rows arrive pre-sorted, because the sort is
 * persisted per watchlist). Composes the numeric, identity and signal domain
 * components via the cell registry.
 */
const meta = {
  title: 'Features/Watchlist/Table',
  component: WatchlistTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    columnIds: DEFAULT_COLUMN_IDS.slice(1),
    sort: [{ columnId: 'changePercent', direction: 'desc' }],
    otherLists: WATCHLIST_LISTS.slice(1),
    hasFilters: false,
    isLive: true,
    onSortChange: () => {},
    onRemove: () => {},
    onOpenDetail: () => {},
    onAddToList: () => {},
    onRetry: () => {},
  },
  decorators: [
    (Story) => (
      <div className="rounded-lg border border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WatchlistTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A gainer (with signal), a loser, an unchanged name, and a just-added, unquoted row. */
export const Ready: Story = {
  args: { rows: WATCHLIST_ROWS, status: 'ready' },
};

/**
 * At 375px the pinned Stock column freezes while the rest of the table scrolls
 * horizontally, so Change% stays reachable without losing the ticker — and an
 * expanded row's panel is held to the viewport width rather than riding that
 * scroll. Scroll the table sideways and expand a row to see both.
 */
export const Mobile: Story = {
  args: { rows: WATCHLIST_ROWS, status: 'ready' },
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: { layout: 'fullscreen' },
};

/**
 * One company on both exchanges is two rows, each with its own price; a
 * BSE-only trade-for-trade name carries the low-liquidity warning.
 */
export const MultiExchange: Story = {
  args: { rows: WATCHLIST_ROWS_MULTI_EXCHANGE, status: 'ready' },
};

export const MultiExchangeMobile: Story = {
  args: { rows: WATCHLIST_ROWS_MULTI_EXCHANGE, status: 'ready' },
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: { layout: 'fullscreen' },
};

export const Loading: Story = {
  args: { rows: [], status: 'loading' },
};

export const Errored: Story = {
  args: { rows: [], status: 'error', errorMessage: 'Could not load quotes for this watchlist.' },
};

export const Empty: Story = {
  args: {
    rows: [],
    status: 'ready',
    emptyAction: <Button size="sm">Add a stock</Button>,
  },
};

/** Same empty slot, but the copy changes when filters are what's hiding rows. */
export const EmptyWithFilters: Story = {
  args: { rows: [], status: 'ready', hasFilters: true },
};
