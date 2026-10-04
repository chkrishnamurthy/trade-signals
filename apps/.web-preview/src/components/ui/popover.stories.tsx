import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Switch } from './switch';

const meta = {
  title: 'Primitives/Popover',
  component: Popover,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="flex min-h-64 items-start justify-center pt-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">Column settings</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Visible columns</p>
          <div className="flex items-center justify-between">
            <Label htmlFor="c-rsi">RSI</Label>
            <Switch id="c-rsi" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="c-atr">ATR</Label>
            <Switch id="c-atr" />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};
