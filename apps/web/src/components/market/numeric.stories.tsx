import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  IndicatorValue,
  MarketCap,
  Percent,
  PercentChange,
  Price,
  PriceChange,
  Ratio,
  Volume,
} from './numeric';

/**
 * Every number the user reads comes through here — one decimal policy, one
 * Indian-numbering policy, one em-dash for missing data, tabular figures
 * everywhere. All inputs are integer paise. Three states, always: loading →
 * skeleton, `null` → em dash ("not available"), otherwise → the value.
 */
const meta = {
  title: 'Domain/Numeric',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 border-b border-border py-2">
      <code className="w-40 shrink-0 text-2xs text-subtle-foreground">{label}</code>
      <span>{children}</span>
    </div>
  );
}

export const Kinds: Story = {
  render: () => (
    <div className="max-w-xl">
      <Row label="Price (paise)">
        <Price paise={298550} />
      </Row>
      <Row label="Price bare (dense)">
        <Price paise={298550} bare />
      </Row>
      <Row label="PercentChange +">
        <PercentChange value={1.43} />
      </Row>
      <Row label="PercentChange −">
        <PercentChange value={-2.78} />
      </Row>
      <Row label="PercentChange 0">
        <PercentChange value={0} />
      </Row>
      <Row label="PriceChange (abs + %)">
        <PriceChange paise={4210} percent={1.43} />
      </Row>
      <Row label="IndicatorValue (RSI)">
        <IndicatorValue value={62.4} />
      </Row>
      <Row label="Percent (unsigned)">
        <Percent value={18.6} />
      </Row>
      <Row label="Ratio (rel. volume)">
        <Ratio value={2.3} />
      </Row>
      <Row label="Volume (shares)">
        <Volume shares={4_820_000} />
      </Row>
      <Row label="MarketCap (paise)">
        <MarketCap paise={2019000000000000} />
      </Row>
    </div>
  ),
};

/** `null` is an em dash announced as "not available" — never rendered as zero. */
export const MissingAndLoading: Story = {
  render: () => (
    <div className="max-w-xl">
      <Row label="null → not available">
        <Price paise={null} />
      </Row>
      <Row label="loading → skeleton">
        <Price paise={298550} loading />
      </Row>
      <Row label="loading (xl)">
        <Price paise={298550} size="xl" loading />
      </Row>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-baseline gap-6">
      {(['xs', 'sm', 'md', 'lg', 'xl', 'display'] as const).map((size) => (
        <div key={size} className="flex flex-col items-start gap-1">
          <Price paise={298550} size={size} />
          <code className="text-2xs text-subtle-foreground">{size}</code>
        </div>
      ))}
    </div>
  ),
};
