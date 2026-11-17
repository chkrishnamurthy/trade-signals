import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { FLOW_PAGE } from '@/stories/fixtures/pages';
import { FlowView } from './flow-view';

/**
 * Institutional flow: the market tape, the ranked stock table, deals and
 * shareholding, with one feed marked stale.
 */
const meta = {
  title: 'Pages/Institutional flow',
  component: FlowView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/flows' } },
  },
  args: { data: FLOW_PAGE },
} satisfies Meta<typeof FlowView>;

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
