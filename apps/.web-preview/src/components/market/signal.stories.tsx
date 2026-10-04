import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { SignalDirection } from '@/lib/dashboard-types';
import {
  SetupTag,
  SignalBadge,
  SignalReason,
  SignalScore,
  SignalStrength,
  TrendIndicator,
  VolumeIndicator,
} from './signal';

/**
 * One vocabulary for the five directions. The wording is descriptive, never
 * instructional — the components say what the indicators read, never what to do.
 * No BUY/SELL/ORDER anywhere. Colour is never the only carrier: each ships a
 * ▲/▼/→ glyph (doubled for the strong variants).
 */
const meta = {
  title: 'Domain/Signal',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const DIRECTIONS: SignalDirection[] = [
  'strong_bullish',
  'bullish',
  'neutral',
  'bearish',
  'strong_bearish',
];

export const Badges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {DIRECTIONS.map((d) => (
        <SignalBadge key={d} direction={d} />
      ))}
    </div>
  ),
};

export const Strength: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-3">
      <SignalStrength strength={82} direction="strong_bullish" />
      <SignalStrength strength={64} direction="bullish" />
      <SignalStrength strength={50} direction="neutral" />
      <SignalStrength strength={28} direction="bearish" />
    </div>
  ),
};

/** Never renders without a breakdown — a score the factors can't explain is barred. */
export const Score: Story = {
  render: () => (
    <div className="w-80 rounded-lg border border-border bg-surface p-4">
      <SignalScore score={78} direction="bullish">
        <ul className="mt-1 flex flex-col gap-1">
          <SignalReason label="Price above 50-day EMA" detail="+1,240" score={12} />
          <SignalReason label="RSI in bullish range (62)" score={8} />
          <SignalReason label="Volume 2.3× average" detail="2.3×" score={6} />
          <SignalReason label="Below 200-day EMA" score={-4} />
          <SignalReason label="MACD flat" score={0} />
        </ul>
      </SignalScore>
    </div>
  ),
};

export const InlineIndicators: Story = {
  render: () => (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-4">
        <TrendIndicator tone="bullish" />
        <TrendIndicator tone="bearish" />
        <TrendIndicator tone="neutral" />
      </div>
      <div className="flex items-center gap-4">
        <VolumeIndicator relativeVolume={2.35} />
        <VolumeIndicator relativeVolume={0.82} />
        <VolumeIndicator relativeVolume={null} />
      </div>
      <div className="flex flex-wrap gap-2">
        <SetupTag>Golden cross</SetupTag>
        <SetupTag>52W breakout</SetupTag>
        <SetupTag>Volume spike</SetupTag>
      </div>
    </div>
  ),
};
