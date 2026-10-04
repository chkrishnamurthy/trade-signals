import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { simulatedToday } from './fixture';
import { OverviewCard } from './overview-card';
import { RulesCard } from './rules-card';
import { SignalsCard } from './signals-card';

/** SIMULATED fixtures: the real evaluator and lifecycle run over hand-built candles. */
const today = simulatedToday();
const meta = {
  title: 'Intraday/Cards',
  parameters: { layout: 'padded' },
} satisfies Meta;
export default meta;

export const Overview: StoryObj = {
  render: () => <OverviewCard rules={today.rules} />,
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
export const Rules: StoryObj = { render: () => <RulesCard rules={today.rules} /> };
