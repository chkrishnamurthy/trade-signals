import {
  evaluateVwapSetup,
  paperPerformance,
  pendingProjection,
  vwapMarketContext,
} from '@equitywise/core';
import { type SignalDetail, type SignalList, signalDtoSchema } from '@equitywise/shared';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { strategyFixture } from '../../../../../packages/core/src/vwap-fixture';
import { SignalCard, SignalsPage } from './signals-page';

const fixture = strategyFixture();
const signals = (['BUY', 'SELL'] as const).map((direction, i) =>
  signalDtoSchema.parse({
    dataOrigin: 'SIMULATED',
    id: i + 1,
    instrumentId: i + 1,
    symbol: i ? 'INFY' : 'RELIANCE',
    companyName: i ? 'Infosys Limited' : 'Reliance Industries Limited',
    sector: 'Test fixture',
    strategyVersionId: 1,
    publishedAt: fixture.now,
    expiresAt: fixture.now + 900_000,
    evidence: evaluateVwapSetup(strategyFixture(direction), direction).evidence,
    projection: pendingProjection(fixture.now),
    lastPrice: direction === 'BUY' ? 101560 : 198440,
    quoteAt: fixture.now,
  }),
);
const signal = signals[0];
if (!signal) throw new Error('Missing story fixture');
const list: SignalList = {
  signals,
  total: signals.length,
  asOf: fixture.now,
  scanner: {
    checkedAt: fixture.now,
    phase: 'open',
    requested: 50,
    evaluated: 50,
    published: 2,
    benchmarkReady: true,
    benchmark: vwapMarketContext(fixture.benchmark, fixture.now),
    reasons: {},
    message: 'SIMULATED component review fixtures.',
  },
  watchlists: [],
};
const detail: SignalDetail = {
  signal,
  events: [
    {
      sequence: 1,
      state: 'ENTRY_PENDING',
      effectiveAt: fixture.now,
      recordedAt: fixture.now,
      reason: 'SIMULATED setup generated',
      price: null,
      resolution: 'OBSERVED',
    },
  ],
  bars: fixture.bars.slice(-14),
};
const meta = {
  title: 'Features/Signals',
  component: SignalsPage,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/signals' } },
  },
  beforeEach: (context) => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const scenario = context.parameters.signalScenario;
      if (url.includes('/api/signals')) {
        if (scenario === 'loading')
          return new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
              once: true,
            }),
          );
        if (scenario === 'error')
          return Response.json(
            { error: 'Market data is temporarily unavailable.' },
            { status: 503 },
          );
        if (url.includes('/summary'))
          return Response.json({
            asOf: fixture.now,
            total: scenario === 'empty' ? 0 : 2,
            active: scenario === 'empty' ? 0 : 2,
            pending: scenario === 'empty' ? 0 : 2,
            triggered: 0,
            stopHits: 0,
            closed: 0,
            targetHits: 0,
            papers: [],
            performance: paperPerformance([]),
          });
        if (/\/signals\/\d/.test(url)) return Response.json(detail);
        return Response.json({
          ...list,
          ...(scenario === 'empty' ? { signals: [], total: 0 } : {}),
          scanner: {
            ...list.scanner,
            checkedAt: scenario === 'stale' ? fixture.now : Date.now(),
            phase: scenario === 'closed' ? 'closed' : 'open',
          },
        });
      }
      if (url.startsWith('/api/')) return Response.json({ user: null, watchlists: [] });
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  },
} satisfies Meta<typeof SignalsPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Cards: Story = {};
export const Empty: Story = { parameters: { signalScenario: 'empty' } };
export const Loading: Story = { parameters: { signalScenario: 'loading' } };
export const ErrorState: Story = { parameters: { signalScenario: 'error' } };
export const Stale: Story = { parameters: { signalScenario: 'stale' } };
export const MarketClosed: Story = { parameters: { signalScenario: 'closed' } };
export const Details: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/signals', query: { selected: '1' } } },
  },
};
export const CompactCard: Story = {
  render: () => (
    <div className="max-w-sm p-4">
      <SignalCard signal={signal} now={fixture.now} onInspect={() => {}} />
    </div>
  ),
};
