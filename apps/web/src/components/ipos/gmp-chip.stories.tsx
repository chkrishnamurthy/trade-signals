import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GmpChip } from './gmp-chip';

/**
 * The compact, always-labelled GMP. There is no variant without the
 * "Unofficial" badge — that is the point of the component.
 */
const meta = {
  title: 'IPOs/GmpChip',
  component: GmpChip,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  args: {
    gmp: {
      official: false,
      latestPaise: 2_000,
      percentOfUpperBand: 9.09,
      observedAt: '2026-10-02T01:32:00.000Z',
      sourceName: 'InvestorGain',
      sourceUrl: 'https://www.investorgain.com/gmp/vishal-nirmiti-ipo/1602/',
      stale: false,
    },
  },
} satisfies Meta<typeof GmpChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Premium: Story = {};
export const Discount: Story = {
  args: { gmp: { ...meta.args.gmp, latestPaise: -500, percentOfUpperBand: -1.64 } },
};
export const NoQuote: Story = {
  args: { gmp: { ...meta.args.gmp, latestPaise: null, percentOfUpperBand: null } },
};
export const Stale: Story = {
  args: { gmp: { ...meta.args.gmp, stale: true, observedAt: '2026-09-29T01:32:00.000Z' } },
};
