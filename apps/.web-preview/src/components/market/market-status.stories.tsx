import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { MarketPhase } from '@/lib/market-types';
import { DataFreshness, LastUpdated, LiveIndicator, MarketStatus } from './market-status';

/**
 * Session state and data freshness. Phases are the product's own vocabulary, not
 * a provider's status codes. Only `open` gets the live pulse — badging a pre-open
 * or auction price "live" would misrepresent it. `unknown` is deliberately not
 * grey: "we don't know" must not look like "closed".
 */
const meta = {
  title: 'Domain/MarketStatus',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHASES: MarketPhase[] = [
  'open',
  'pre_open',
  'closing_auction',
  'post_close',
  'closed',
  'unknown',
];

export const Phases: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {PHASES.map((phase) => (
        <MarketStatus key={phase} phase={phase} isOpen={phase === 'open'} />
      ))}
    </div>
  ),
};

export const Verbose: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <MarketStatus phase="open" isOpen verbose />
      <MarketStatus phase="closed" isOpen={false} verbose />
    </div>
  ),
};

export const Freshness: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4">
        <LiveIndicator live />
        <LiveIndicator live={false} />
      </div>
      <div className="flex flex-wrap gap-4">
        <DataFreshness state="live" at="2026-09-07T09:45:00Z" />
        <DataFreshness state="cached" at="2026-09-07T09:30:00Z" />
        <DataFreshness state="stale" at="2026-09-07T08:00:00Z" />
        <DataFreshness state="error" at={null} />
      </div>
      <LastUpdated at="2026-09-07T09:45:00Z" />
    </div>
  ),
};
