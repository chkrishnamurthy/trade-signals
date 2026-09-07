import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Separator } from './separator';

const meta = {
  title: 'Primitives/Separator',
  component: Separator,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-64 text-sm">
      <p>Momentum</p>
      <Separator className="my-3" />
      <p>Breakouts</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-6 items-center gap-3 text-sm">
      <span>NSE</span>
      <Separator orientation="vertical" />
      <span>EOD</span>
      <Separator orientation="vertical" />
      <span>IST</span>
    </div>
  ),
};
