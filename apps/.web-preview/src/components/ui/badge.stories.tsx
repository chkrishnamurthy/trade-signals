import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Badge } from './badge';

const meta = {
  title: 'Primitives/Badge',
  component: Badge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'secondary',
        'outline',
        'bullish',
        'bearish',
        'neutral',
        'warning',
        'destructive',
      ],
    },
    size: { control: 'select', options: ['sm', 'default', 'lg'] },
    asChild: { table: { disable: true } },
  },
  args: { children: 'Breakout' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The financial tones live on the badge so a pill and a chip can't drift apart. */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="bullish">▲ Bullish</Badge>
      <Badge variant="bearish">▼ Bearish</Badge>
      <Badge variant="neutral">→ Neutral</Badge>
      <Badge variant="warning">Stale</Badge>
      <Badge variant="destructive">Error</Badge>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge size="sm" variant="bullish">
        Small
      </Badge>
      <Badge size="default" variant="bullish">
        Default
      </Badge>
      <Badge size="lg" variant="bullish">
        Large
      </Badge>
    </div>
  ),
};
