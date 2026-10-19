import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LIST_PAGE } from '@/stories/fixtures/ipos';
import { IpoListView } from './ipo-list-view';

/**
 * The master table (`/ipos/all`). A table from `lg`, compact
 * blocks below. Check at Mobile (375), Tablet and Desktop (1440), both themes.
 */
const meta = {
  title: 'IPOs/IpoListView',
  component: IpoListView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/ipos/all' } },
  },
  args: { data: LIST_PAGE },
} satisfies Meta<typeof IpoListView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
};

/** Filtered to a status with no match. */
export const FilteredEmpty: Story = {
  args: {
    data: {
      ...LIST_PAGE,
      filters: { ...LIST_PAGE.filters, status: 'upcoming' },
      rows: [],
      total: 0,
    },
  },
};

/** Every year at once, on the second of several pages. */
export const AllYearsPaged: Story = {
  args: {
    data: { ...LIST_PAGE, filters: { ...LIST_PAGE.filters, year: null }, total: 120, page: 2 },
  },
};
