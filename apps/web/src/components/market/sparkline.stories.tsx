import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Sparkline } from './sparkline';

/**
 * Hand-rolled inline SVG — no charting library. Tone is derived from first-to-last,
 * not the last two points: a series that dipped and recovered is up, and colouring
 * by the final tick would contradict the change figure beside it.
 */
const meta = {
  title: 'Domain/Sparkline',
  component: Sparkline,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { values: [] },
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

const UP = [100, 102, 101, 104, 103, 108, 112, 115];
const DOWN = [115, 112, 113, 108, 106, 104, 101, 98];
const DIP_RECOVER = [100, 96, 92, 95, 99, 103, 106]; // ends up → bullish

export const Trends: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="flex flex-col items-center gap-1">
        <Sparkline values={UP} />
        <span className="text-2xs text-subtle-foreground">up</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Sparkline values={DOWN} />
        <span className="text-2xs text-subtle-foreground">down</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Sparkline values={DIP_RECOVER} />
        <span className="text-2xs text-subtle-foreground">dipped, recovered → up</span>
      </div>
    </div>
  ),
};

export const Filled: Story = {
  render: () => <Sparkline values={UP} fill width={160} height={44} />,
};

/** Fewer than two points renders a blank spacer, not a broken chart. */
export const NotEnoughData: Story = {
  render: () => (
    <div className="rounded-md border border-dashed border-border p-1">
      <Sparkline values={[100]} />
    </div>
  ),
};
