import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './alert';

const meta = {
  title: 'Primitives/Alert',
  component: Alert,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    variant: { control: 'select', options: ['default', 'info', 'warning', 'destructive'] },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>Market closed</AlertTitle>
      <AlertDescription>Quotes reflect the last session's close.</AlertDescription>
    </Alert>
  ),
};

/** `warning` is the stale-data tone, `destructive` the failure tone — not decoration. */
export const Variants: Story = {
  render: () => (
    <div className="flex max-w-lg flex-col gap-3">
      <Alert variant="default">
        <AlertTitle>Neutral notice</AlertTitle>
        <AlertDescription>A plain, non-urgent message.</AlertDescription>
      </Alert>
      <Alert variant="info">
        <InfoIcon />
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>End-of-day data updates at 18:30 IST.</AlertDescription>
      </Alert>
      <Alert variant="warning">
        <TriangleAlertIcon />
        <AlertTitle>Data may be stale</AlertTitle>
        <AlertDescription>The market-data token expired; showing cached values.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Failed to load</AlertTitle>
        <AlertDescription>Could not reach the market-data provider.</AlertDescription>
      </Alert>
    </div>
  ),
};
