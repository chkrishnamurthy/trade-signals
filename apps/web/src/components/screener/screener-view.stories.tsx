import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import {
  SCREENER_COUNTS,
  SCREENER_INITIAL,
  SCREENER_META,
  SCREENER_RESULT,
} from '@/stories/fixtures/pages';
import { ScreenerView } from './screener-view';

/**
 * The screener inside the application frame, with a preset applied and five
 * matches. On a phone the results are cards and the condition builder opens in
 * a bottom sheet.
 */
const meta = {
  title: 'Pages/Screener',
  component: ScreenerView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/screener' } },
  },
  args: {
    meta: SCREENER_META,
    initial: SCREENER_INITIAL,
    initialResult: SCREENER_RESULT,
    initialCounts: SCREENER_COUNTS,
    initialSaved: [],
  },
} satisfies Meta<typeof ScreenerView>;

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
