import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '@/components/ui/button';
import {
  CardSkeleton,
  ConnectionError,
  DataUnavailable,
  EmptyState,
  ErrorState,
  InlineError,
  MarketClosed,
  SkeletonRows,
  TableSkeleton,
} from './states';

/**
 * One implementation each of empty / error / loading. The error variants
 * distinguish "we have no data" from "we have data and it may be wrong" — a
 * financial UI must never silently show a stale number as if it were current.
 */
const meta = {
  title: 'Domain/States',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="w-96 rounded-lg border border-border bg-surface">{children}</div>;
}

export const Empty: Story = {
  render: () => (
    <Frame>
      <EmptyState
        title="No stocks yet"
        description="Search above to add your first stock to this watchlist."
        action={<Button size="sm">Add a stock</Button>}
      />
    </Frame>
  ),
};

export const Errored: Story = {
  render: () => (
    <Frame>
      <ErrorState
        description="We couldn't load this panel."
        detail="500: provider_timeout"
        onRetry={() => {}}
      />
    </Frame>
  ),
};

/** "No data" vs "possibly-wrong data" — the distinction the whole file exists for. */
export const NotAvailableVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Frame>
        <DataUnavailable what="RSI" reason="The exchange did not supply this for the session." />
      </Frame>
      <Frame>
        <ConnectionError onRetry={() => {}} detail="ECONNREFUSED" />
      </Frame>
      <Frame>
        <MarketClosed description="NSE is closed. Quotes resume at 09:15 IST." onRetry={() => {}} />
      </Frame>
    </div>
  ),
};

export const Inline: Story = {
  render: () => <InlineError>Failed to save order</InlineError>,
};

export const Loading: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="w-96">
        <SkeletonRows rows={4} />
      </div>
      <CardSkeleton className="w-96" />
      <div className="w-full max-w-2xl rounded-lg border border-border">
        <TableSkeleton rows={5} columns={5} />
      </div>
    </div>
  ),
};
