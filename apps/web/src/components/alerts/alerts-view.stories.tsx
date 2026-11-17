import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { ALERTS_OVERVIEW } from '@/stories/fixtures/pages';
import { AlertsView } from './alerts-view';

/**
 * Alerts: the create form, three rules (one paused) and the recent triggers,
 * one of them not yet acknowledged.
 */
const meta = {
  title: 'Pages/Alerts',
  component: AlertsView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/alerts' } },
  },
  args: { overview: ALERTS_OVERVIEW },
} satisfies Meta<typeof AlertsView>;

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
