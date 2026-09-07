import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PlusIcon } from 'lucide-react';
import { Button } from './button';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'outline', 'ghost', 'link', 'destructive'],
    },
    size: { control: 'select', options: ['sm', 'default', 'lg', 'icon', 'icon-sm'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    asChild: { table: { disable: true } },
  },
  args: { children: 'Add to watchlist' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} variant="default">
        Default
      </Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="outline">
        Outline
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
      <Button {...args} variant="link">
        Link
      </Button>
      <Button {...args} variant="destructive">
        Destructive
      </Button>
    </div>
  ),
  args: { children: undefined },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="default">
        Default
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
      <Button {...args} size="icon" aria-label="Add">
        <PlusIcon />
      </Button>
      <Button {...args} size="icon-sm" aria-label="Add">
        <PlusIcon />
      </Button>
    </div>
  ),
  args: { children: undefined },
};

/** Built-in `loading` sets `aria-busy`, disables the button and shows a spinner. */
export const Loading: Story = { args: { loading: true } };

export const Disabled: Story = { args: { disabled: true } };

export const WithIcon: Story = {
  args: { children: undefined },
  render: (args) => (
    <Button {...args}>
      <PlusIcon /> Add stock
    </Button>
  ),
};
