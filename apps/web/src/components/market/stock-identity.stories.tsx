import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SignalBadge } from './signal';
import { StockAvatar, StockIdentity } from './stock-identity';

/**
 * Ticker over company name. The ticker is the primary key a trader scans for, so
 * it wins the visual weight and the name truncates first.
 */
const meta = {
  title: 'Domain/StockIdentity',
  component: StockIdentity,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { symbol: 'RELIANCE' },
} satisfies Meta<typeof StockIdentity>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <StockIdentity size="sm" symbol="RELIANCE" name="Reliance Industries" />
      <StockIdentity size="md" symbol="RELIANCE" name="Reliance Industries" />
      <StockIdentity size="lg" symbol="RELIANCE" name="Reliance Industries" />
    </div>
  ),
};

export const WithAvatarAndBadge: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <StockAvatar symbol="HDFCBANK" />
      <StockIdentity symbol="HDFCBANK" name="HDFC Bank">
        <SignalBadge direction="bullish" compact />
      </StockIdentity>
    </div>
  ),
};

/** The name truncates inside a narrow container; the ticker never does. */
export const Truncation: Story = {
  render: () => (
    <div className="w-40 rounded-md border border-border p-2">
      <StockIdentity symbol="BAJFINANCE" name="Bajaj Finance Limited (very long registered name)" />
    </div>
  ),
};

export const NoName: Story = {
  render: () => <StockIdentity symbol="INFY" />,
};
