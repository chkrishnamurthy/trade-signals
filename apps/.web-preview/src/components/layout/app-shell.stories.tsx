import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { AppShell } from './app-shell';
import { PageDescription, PageHeader, PageHeading, PageTitle } from './page';

/**
 * The signed-in application frame: sticky header with navigation, search,
 * theme and account, plus the drawer that replaces the nav below `lg`.
 */
const meta = {
  title: 'Layout/AppShell',
  component: AppShell,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/watchlists' } },
  },
  args: {
    children: (
      <PageHeader>
        <PageHeading>
          <PageTitle>My watchlist</PageTitle>
          <PageDescription>
            Live prices and daily technical readings for the names on this list.
          </PageDescription>
        </PageHeading>
      </PageHeader>
    ),
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
};

/**
 * Mobile (375px): the header must fit the viewport. Every item in it once
 * refused to shrink, so the row outran the screen, widened the document and
 * put the whole page on a sideways scroll. Regression guard for that.
 */
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  play: async () => {
    await waitFor(() => {
      const root = document.documentElement;
      expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    });
  },
};
