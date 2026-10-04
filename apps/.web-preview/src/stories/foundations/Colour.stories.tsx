import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Ground, SwatchGrid } from './_swatch';

/**
 * The colour token layer, read live from `globals.css`. Toggle the theme in the
 * toolbar to verify every ramp in both light and dark.
 */
const meta = {
  title: 'Foundations/Colour',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Surfaces: Story = {
  render: () => (
    <Ground>
      <SwatchGrid
        title="Surface planes — background < sunken < surface < raised"
        vars={[
          ['--background'],
          ['--surface-sunken'],
          ['--surface'],
          ['--surface-raised'],
          ['--muted'],
          ['--secondary'],
        ]}
      />
      <SwatchGrid
        title="Text ramp"
        vars={[['--foreground'], ['--muted-foreground'], ['--subtle-foreground']]}
      />
      <SwatchGrid
        title="Lines & focus"
        vars={[['--border'], ['--border-strong'], ['--input'], ['--ring']]}
      />
    </Ground>
  ),
};

export const Brand: Story = {
  render: () => (
    <Ground>
      <SwatchGrid
        title="Brand — primary is also the bullish hue (Groww teal-green)"
        vars={[['--primary'], ['--primary-foreground'], ['--accent'], ['--accent-foreground']]}
      />
    </Ground>
  ),
};

export const Status: Story = {
  render: () => (
    <Ground>
      <SwatchGrid
        title="Destructive"
        vars={[
          ['--destructive'],
          ['--destructive-foreground'],
          ['--destructive-soft'],
          ['--destructive-line'],
        ]}
      />
      <SwatchGrid title="Success" vars={[['--success'], ['--success-foreground']]} />
      <SwatchGrid
        title="Warning"
        vars={[['--warning'], ['--warning-foreground'], ['--warning-soft'], ['--warning-line']]}
      />
      <SwatchGrid title="Info" vars={[['--info'], ['--info-foreground']]} />
    </Ground>
  ),
};

export const Financial: Story = {
  render: () => (
    <Ground>
      <SwatchGrid
        title="Bullish — accent / strong / soft / line"
        vars={[['--bullish'], ['--bullish-strong'], ['--bullish-soft'], ['--bullish-line']]}
      />
      <SwatchGrid
        title="Bearish — accent / strong / soft / line"
        vars={[['--bearish'], ['--bearish-strong'], ['--bearish-soft'], ['--bearish-line']]}
      />
      <SwatchGrid
        title="Neutral — accent / strong / soft / line"
        vars={[['--neutral'], ['--neutral-strong'], ['--neutral-soft'], ['--neutral-line']]}
      />
      <SwatchGrid
        title="Signed aliases — may diverge from bullish/bearish later (VIX, drawdown)"
        vars={[['--positive'], ['--positive-strong'], ['--negative'], ['--negative-strong']]}
      />
    </Ground>
  ),
};

export const MarketSession: Story = {
  render: () => (
    <Ground>
      <SwatchGrid
        title="Session state — 'unknown' is deliberately not grey"
        vars={[['--market-open'], ['--market-pre'], ['--market-closed'], ['--market-unknown']]}
      />
    </Ground>
  ),
};

export const Charts: Story = {
  render: () => (
    <Ground>
      <SwatchGrid
        title="Categorical series — 1 is the primary series"
        vars={[
          ['--chart-1'],
          ['--chart-2'],
          ['--chart-3'],
          ['--chart-4'],
          ['--chart-5'],
          ['--chart-grid'],
          ['--chart-axis'],
        ]}
      />
    </Ground>
  ),
};
