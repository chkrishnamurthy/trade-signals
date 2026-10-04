import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BoldIcon, ItalicIcon, UnderlineIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

const meta = {
  title: 'Primitives/ToggleGroup',
  component: ToggleGroup,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  // Root requires `type`; the render fns set their own, this only satisfies types.
  args: { type: 'single' },
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pick exactly one of a short list — chart timeframes, direction filters, theme. */
export const Single: Story = {
  render: () => (
    <ToggleGroup type="single" defaultValue="1d" aria-label="Timeframe">
      <ToggleGroupItem value="1d">1D</ToggleGroupItem>
      <ToggleGroupItem value="1w">1W</ToggleGroupItem>
      <ToggleGroupItem value="1m">1M</ToggleGroupItem>
      <ToggleGroupItem value="1y">1Y</ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Multiple: Story = {
  render: () => (
    <ToggleGroup type="multiple" defaultValue={['bold']} aria-label="Text style">
      <ToggleGroupItem value="bold" aria-label="Bold">
        <BoldIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Italic">
        <ItalicIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Underline">
        <UnderlineIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};
