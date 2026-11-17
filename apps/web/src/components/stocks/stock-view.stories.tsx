import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { ToastProvider } from '@/components/ui/toast';
import { STOCK_PAGE } from '@/stories/fixtures/pages';
import { StockView } from './stock-view';

/**
 * One stock in full: header, ratio board, what stands out, chart and the
 * evidence tabs. A long company name and a long deal counterparty are in the
 * data on purpose.
 */
const meta = {
  title: 'Pages/Stock',
  component: StockView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/stocks/TATACONSUM' } },
  },
  args: { data: STOCK_PAGE, backHref: null },
  // The ratio board reports its saves through a toast (root layout in the app).
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
} satisfies Meta<typeof StockView>;

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
