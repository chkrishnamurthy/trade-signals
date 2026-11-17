import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { ANNOUNCEMENTS_PAGE } from '@/stories/fixtures/pages';
import { AnnouncementsView } from './announcements-view';

/**
 * Announcements with filings on the page, including a very long headline and
 * a company listed only on BSE.
 */
const meta = {
  title: 'Pages/Announcements',
  component: AnnouncementsView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/announcements' } },
  },
  args: { data: ANNOUNCEMENTS_PAGE, activeCategories: [] },
} satisfies Meta<typeof AnnouncementsView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The page may not scroll sideways at any width. */
const noSidewaysScroll = async () => {
  await waitFor(() => {
    const root = document.documentElement;
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  });
};

export const Desktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: noSidewaysScroll,
};

export const Tablet: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  play: noSidewaysScroll,
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  play: noSidewaysScroll,
};
