import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type * as React from 'react';
import type { IndexSnapshotDto, IndexStripDto } from '@/lib/market-types';
import type { IndexStripState } from '@/lib/use-index-strip';
import { IndexCell, IndexCellSkeleton } from './index-cell';
import { IndexStripView } from './index-strip';

/**
 * The market indices strip — the 36px ticker line `AppShell` renders under the
 * top bar on every page. All figures here are SIMULATED fixtures, not quotes.
 */
const meta = {
  title: 'Domain/IndexStrip',
  component: IndexStripView,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof IndexStripView>;

export default meta;
type Story = StoryObj<typeof meta>;

function index(
  symbol: string,
  name: string,
  ltp: number,
  previousClose: number,
  extra: Partial<IndexSnapshotDto> = {},
): IndexSnapshotDto {
  const change = ltp - previousClose;
  return {
    symbol,
    name,
    exchange: 'NSE',
    display: 'index',
    ltp,
    change,
    changePercent: (change / previousClose) * 100,
    open: previousClose + Math.round(change * 0.2),
    high: Math.max(ltp, previousClose) + Math.round(Math.abs(change) * 0.3),
    low: Math.min(ltp, previousClose) - Math.round(Math.abs(change) * 0.1),
    previousClose,
    at: '2026-09-18T09:02:07.000Z',
    ...extra,
  };
}

const NIFTY = index('NIFTY50', 'NIFTY 50', 25_312_40, 25_169_55);
const SENSEX = index('SENSEX', 'SENSEX', 82_415_70, 82_109_25, { exchange: 'BSE' });
const BANK = index('NIFTYBANK', 'BANK NIFTY', 55_612_90, 55_834_10);
const FIN = index('FINNIFTY', 'FIN NIFTY', 26_187_90, 26_120_40);
const MIDCAP = index('NIFTYMIDCAP100', 'MIDCAP 100', 58_920_45, 58_611_20);
const IT = index('NIFTYIT', 'NIFTY IT', 41_205_10, 41_598_75);
const VIX = index('INDIAVIX', 'INDIA VIX', 12_89, 13_42, { display: 'volatility' });

const LIVE: IndexStripDto = {
  indices: [NIFTY, SENSEX, BANK, FIN, MIDCAP, IT, VIX],
  market: { isOpen: true, phase: 'open' },
  asOf: '2026-09-18T09:02:10.000Z',
};

/** A fake top bar, so the strip's sticky offset and translucency read as they do in the app. */
function Frame({ children, tall = false }: { children: React.ReactNode; tall?: boolean }) {
  return (
    <div className="-m-4 bg-background">
      <header className="sticky top-0 z-40 flex h-14 items-center border-border border-b bg-surface/85 px-6 font-semibold backdrop-blur">
        EquityWise
        <span className="ml-6 text-muted-foreground text-sm">
          Market Brief · My watchlists · Announcements
        </span>
      </header>
      {children}
      <div className="mx-auto max-w-[1800px] px-6 py-4">
        <div className="text-muted-foreground text-xs">My watchlists</div>
        <h1 className="font-semibold text-xl">Nifty 50 names</h1>
        <p className="text-muted-foreground text-sm">
          Live prices and daily technical readings for the names on this list.
        </p>
        {tall && (
          <div className="mt-4 flex flex-col gap-2">
            {Array.from({ length: 40 }, (_, i) => `row-${i}`).map((key) => (
              <div key={key} className="h-9 rounded-md border border-border bg-surface" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const baseArgs = {
  state: { status: 'ready', data: LIVE } as IndexStripState,
  liveState: 'streaming' as const,
};

/** A live session under the top bar, with the page title below. One line; the row scrolls sideways when seven do not fit. */
export const Live: Story = {
  args: baseArgs,
  render: (args) => (
    <Frame>
      <IndexStripView state={args.state} liveState={args.liveState} />
    </Frame>
  ),
};

/** Scroll the page: the strip stays stuck under the top bar; the page title scrolls away. */
export const Sticky: Story = {
  args: baseArgs,
  parameters: { layout: 'fullscreen' },
  render: (args) => (
    <Frame tall>
      <IndexStripView state={args.state} liveState={args.liveState} />
    </Frame>
  ),
};

/** The socket is not live; the hub is polling REST. "Live" is never claimed here. */
export const Polling: Story = {
  args: { ...baseArgs, liveState: 'polling' },
  render: (args) => (
    <Frame>
      <IndexStripView state={args.state} liveState={args.liveState} />
    </Frame>
  ),
};

export const PreOpen: Story = {
  args: {
    ...baseArgs,
    state: {
      status: 'ready',
      data: {
        ...LIVE,
        market: { isOpen: false, phase: 'pre_open' },
        indices: LIVE.indices.map((i) => ({
          ...i,
          high: null,
          low: null,
        })),
      },
    },
    liveState: 'polling',
  },
  render: (args) => (
    <Frame>
      <IndexStripView state={args.state} liveState={args.liveState} />
    </Frame>
  ),
};

export const AtClose: Story = {
  args: {
    ...baseArgs,
    state: { status: 'ready', data: { ...LIVE, market: { isOpen: false, phase: 'closed' } } },
    liveState: null,
  },
  render: (args) => (
    <Frame>
      <IndexStripView state={args.state} liveState={args.liveState} />
    </Frame>
  ),
};

/** The provider is down; the last good snapshot stands, and says so. */
export const Delayed: Story = {
  args: {
    ...baseArgs,
    state: { status: 'ready', data: { ...LIVE, stale: { reason: 'UPSTREAM' } } },
    liveState: null,
  },
  render: (args) => (
    <Frame>
      <IndexStripView state={args.state} liveState={args.liveState} />
    </Frame>
  ),
};

export const Loading: Story = {
  args: { ...baseArgs, state: { status: 'loading' }, liveState: null },
  render: (args) => (
    <Frame>
      <IndexStripView state={args.state} liveState={args.liveState} />
    </Frame>
  ),
};

export const Unavailable: Story = {
  args: {
    ...baseArgs,
    state: {
      status: 'error',
      error: {
        error: 'Not configured.',
        remedy: 'Connect a market-data provider.',
        code: 'NOT_CONFIGURED',
      },
    },
    liveState: null,
  },
  render: (args) => (
    <Frame>
      <IndexStripView state={args.state} liveState={args.liveState} />
    </Frame>
  ),
};

/** Every cell state in one row: up, down, flat, VIX down (green), VIX up (red), stale, loading. */
export const Cells: Story = {
  args: baseArgs,
  render: () => (
    <div className="flex items-center overflow-x-auto">
      <IndexCell index={NIFTY} />
      <IndexCell index={BANK} />
      <IndexCell index={{ ...NIFTY, ltp: NIFTY.previousClose ?? 0, change: 0, changePercent: 0 }} />
      <IndexCell index={VIX} />
      <IndexCell index={index('INDIAVIX', 'INDIA VIX', 14_17, 13_42, { display: 'volatility' })} />
      <IndexCell index={NIFTY} stale />
      <IndexCellSkeleton />
    </div>
  ),
};

/** The phone layout: percent only, one-word status. */
export const Phone: Story = {
  args: baseArgs,
  globals: { viewport: { value: 'mobile1' } },
  render: (args) => (
    <div className="w-[360px]">
      <Frame>
        <IndexStripView state={args.state} liveState={args.liveState} />
      </Frame>
    </div>
  ),
};
