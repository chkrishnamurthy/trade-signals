import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { IndexLevel, PercentChange, Price, PriceChange } from '@/components/market/numeric';
import { Sparkline } from '@/components/market/sparkline';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DefinitionGrid, DefinitionRow, MetricCard, StatTile } from './metric-card';

/**
 * One headline figure with its supporting detail. Composition, not props: the
 * `value` slot takes whichever financial number component is right, so the card
 * never needs to know about paise, percentages or crores.
 */
const meta = {
  title: 'Domain/MetricCard',
  component: MetricCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  args: { label: 'Metric', value: null },
} satisfies Meta<typeof MetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <MetricCard
      className="w-72"
      label="NIFTY 50"
      hint="The National Stock Exchange's benchmark index of 50 large-cap stocks."
      value={<IndexLevel paise={1864255} size="xl" />}
      change={<PriceChange paise={26640} percent={1.43} />}
      aside={<Sparkline values={[100, 101, 103, 102, 106, 108]} />}
    />
  ),
};

export const StatTiles: Story = {
  render: () => (
    <div className="grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Advancing" value="1,284" />
      <StatTile label="Declining" value="612" />
      <StatTile label="52W highs" value="88" hint="Stocks at a fresh 52-week high today." />
      <StatTile label="Adv/Dec" value={<PercentChange value={2.1} />} />
    </div>
  ),
};

export const Definitions: Story = {
  render: () => (
    <div className="w-80 rounded-lg border border-border bg-surface p-4">
      <DefinitionGrid columns={1}>
        <DefinitionRow label="Open" value={<Price paise={294100} />} />
        <DefinitionRow label="High" value={<Price paise={299050} />} />
        <DefinitionRow label="Low" value={<Price paise={293200} />} />
        <DefinitionRow label="Prev close" value={<Price paise={294340} />} />
      </DefinitionGrid>
    </div>
  ),
};
