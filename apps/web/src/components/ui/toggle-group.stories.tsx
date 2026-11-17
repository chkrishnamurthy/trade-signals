import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BoldIcon, ItalicIcon, UnderlineIcon } from 'lucide-react';
import { useState } from 'react';
import { SegmentedControl, ToggleGroup, ToggleGroupItem } from './toggle-group';

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

/**
 * `SegmentedControl` — the same switch as data. Use it for every one-of-a-few
 * choice; a click on the selected option never clears it, and a disabled option
 * says why on hover. On a touch screen the items grow to 36px.
 */
export const Segmented: Story = {
  render: () => {
    const [range, setRange] = useState<'1Y' | '3Y' | 'All'>('1Y');
    return (
      <SegmentedControl
        aria-label="Range"
        value={range}
        onValueChange={setRange}
        options={[
          { value: '1Y', label: '1Y' },
          { value: '3Y', label: '3Y', disabled: true, title: 'Needs three years of history' },
          { value: 'All', label: 'All' },
        ]}
      />
    );
  },
};
