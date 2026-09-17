import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { simulatedToday } from './fixture';
import { OverviewCard } from './overview-card';
import { PaperControlsCard } from './paper-controls-card';
import { RulesCard } from './rules-card';
import { SignalsCard } from './signals-card';
import { TradesCard } from './trades-card';

/** SIMULATED fixtures: the real evaluator and lifecycle run over hand-built candles. */
const today = simulatedToday();
const meta = {
  title: 'Intraday/Cards',
  parameters: { layout: 'padded' },
} satisfies Meta;
export default meta;

export const Overview: StoryObj = {
  render: () => <OverviewCard rules={today.rules} capital="₹5,00,000" />,
};
export const Signals: StoryObj = { render: () => <SignalsCard data={today} /> };
export const SignalsOpeningRange: StoryObj = {
  render: () => (
    <SignalsCard data={simulatedToday({ phase: 'OPENING_RANGE', signals: [], exclusions: [] })} />
  ),
};
export const SignalsEmpty: StoryObj = {
  render: () => <SignalsCard data={simulatedToday({ phase: 'SESSION', signals: [] })} />,
};
export const Trades: StoryObj = { render: () => <TradesCard data={today} /> };
export const TradesEmpty: StoryObj = {
  render: () => (
    <TradesCard
      data={simulatedToday({
        signals: [],
        book: {
          ...today.book,
          tradesToday: 0,
          openTrades: 0,
          realisedNetPaise: 0,
          markNetPaise: 0,
        },
      })}
    />
  ),
};
export const Rules: StoryObj = { render: () => <RulesCard rules={today.rules} /> };
export const PaperControls: StoryObj = { render: () => <PaperControlsCard capital="₹5,00,000" /> };
