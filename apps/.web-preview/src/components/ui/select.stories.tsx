import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';

const meta = {
  title: 'Primitives/Select',
  component: Select,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="flex min-h-24 items-start justify-center">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Select defaultValue="20d">
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Timeframe" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="5d">5 days</SelectItem>
        <SelectItem value="20d">20 days</SelectItem>
        <SelectItem value="50d">50 days</SelectItem>
        <SelectSeparator />
        <SelectItem value="200d">200 days</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const Placeholder: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Choose a sector…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="it">IT</SelectItem>
        <SelectItem value="banking">Banking</SelectItem>
        <SelectItem value="energy">Energy</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled defaultValue="20d">
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="20d">20 days</SelectItem>
      </SelectContent>
    </Select>
  ),
};
