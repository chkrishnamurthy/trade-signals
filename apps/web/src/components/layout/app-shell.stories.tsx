import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { AppShell } from './app-shell';
import { PageDescription, PageHeader, PageHeading, PageTitle } from './page';

/**
 * The signed-in application frame: sticky top bar (destinations from `lg`),
 * indices strip, footer, and the bottom tab bar + "More" drawer below `lg`.
 * Spec: docs/planning/navigation-redesign-plan.md.
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
      <PageHeader className="px-4 py-4 sm:px-6">
        <PageHeading>
          <PageTitle>My watchlists</PageTitle>
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

/** Guards the one failure every header redesign has had: a row wider than the screen. */
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

/** A page inside the Markets menu: the menu trigger carries the underline. */
export const InsideMarketsMenu: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/ipos/calendar' } } },
  globals: { viewport: { value: 'desktop', isRotated: false } },
};

/** Tablet (768px): destinations in the bottom tab bar, market pill in the top bar. */
export const Tablet: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  play: noSidewaysScroll,
};

/** Mobile (375px): bottom tab bar, search fills the top bar. */
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  play: noSidewaysScroll,
};
