import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { FilterPanel } from './filter-panel';

/**
 * The filters popover: direction, the sectors present in the list, and the
 * exchange when there is more than one.
 */
const meta = {
  title: 'Features/Watchlist/FilterPanel',
  component: FilterPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    sectors: ['Energy', 'IT', 'FMCG', 'Consumer'],
    exchanges: ['NSE'],
    onChange: () => {},
    onClear: () => {},
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-[34rem] items-start">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FilterPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoFilters: Story = {
  args: { filters: {} },
};

/** The trigger shows a count badge when filters are active. */
export const WithActiveFilters: Story = {
  args: {
    filters: {
      direction: 'advancing',
      sectors: ['IT'],
    },
  },
};

/**
 * Mobile (375px): a list spanning many sectors is capped and scrolls INSIDE the
 * popover rather than growing past the screen and spilling over the page.
 * Regression guard for the `ScrollArea` viewport clamp (the panel's height cap
 * must reach Radix's scroller, not just the Root).
 */
export const Mobile: Story = {
  args: {
    ...WithActiveFilters.args,
    sectors: Array.from({ length: 40 }, (_, i) => `Sector ${i + 1}`),
  },
  globals: { viewport: { value: 'mobile', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /filters/i }));

    // Radix renders the popover in a portal, outside canvasElement.
    const viewport = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (el === null) throw new Error('filters panel did not open');
      return el;
    });

    // Content overflows its cap → it scrolls inside itself, and the cap keeps the
    // scroller within the screen rather than letting it grow past the viewport.
    await expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    await expect(viewport.clientHeight).toBeLessThanOrEqual(window.innerHeight);
  },
};
