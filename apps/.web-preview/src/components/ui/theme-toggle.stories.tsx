import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ThemeToggle } from './theme-toggle';

/**
 * Light / System / Dark switch. It drives the *real* theme system (writes the
 * preference and toggles `.dark` on <html>), so clicking here changes the whole
 * Storybook canvas — the same mechanism as the toolbar theme switch.
 */
const meta = {
  title: 'Primitives/ThemeToggle',
  component: ThemeToggle,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
