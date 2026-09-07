import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

const meta = {
  title: 'Primitives/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="flex min-h-24 items-center justify-center">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>RSI over 70 — potentially overbought</TooltipContent>
    </Tooltip>
  ),
};

/** Rendered already open so the content is visible in the catalogue. */
export const Open: Story = {
  render: () => (
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Button variant="outline">Trigger</Button>
      </TooltipTrigger>
      <TooltipContent>Wraps at 16rem for a longer explanatory note.</TooltipContent>
    </Tooltip>
  ),
};
