import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'Primitives/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { placeholder: 'Search NSE stocks…' },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="symbol">Symbol</Label>
      <Input id="symbol" {...args} />
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true, value: 'RELIANCE' } };

/** `aria-invalid` switches the border to the destructive tone. */
export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: 'not a symbol' },
};

export const Types: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Input type="text" placeholder="text" />
      <Input type="email" placeholder="email@example.com" />
      <Input type="password" placeholder="password" />
      <Input type="number" placeholder="0" />
    </div>
  ),
};
