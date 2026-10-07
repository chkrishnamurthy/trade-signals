import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Label } from './label';
import { Switch } from './switch';

const meta = {
  title: 'Primitives/Switch',
  component: Switch,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  // A bare control needs a name; real forms pair it with a <Label>.
  args: { 'aria-label': 'Example setting' },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = { args: { defaultChecked: true } };

export const Disabled: Story = { args: { disabled: true } };

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="realtime" defaultChecked />
      <Label htmlFor="realtime">Live quotes</Label>
    </div>
  ),
};
