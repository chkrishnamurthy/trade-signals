import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketChart } from './chart';

/**
 * The price chart with its hover tooltip: a pill above the plot at the cursor
 * carrying the candle's close and time, a dashed crosshair and a dot on the
 * line. Candle data is stubbed at the fetch boundary so the story is
 * deterministic and needs no market-data provider.
 */

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

const SESSION_OPEN = Date.UTC(2026, 8, 7, 3, 45); // Mon 7 Sept 09:15 IST
const SESSION_LENGTH_MS = 375 * 60_000;

/**
 * Synthetic candles around ₹365, in paise: `days` sessions of `perDay`
 * candles each, `minutes` apart. A full session is 375 one-minute candles.
 */
function candles(days: number, perDay: number, minutes: number): Candle[] {
  const out: Candle[] = [];
  let close = 36_320;
  const start = SESSION_OPEN;
  const cycle = 45 / minutes;
  for (let day = 0; day < days; day++) {
    for (let i = 0; i < perDay; i++) {
      const t = start + day * 86_400_000 + i * minutes * 60_000;
      const drift = Math.sin((day * perDay + i) / cycle) * 90 + Math.cos(i / (cycle / 2.25)) * 40;
      const open = close;
      close = Math.round(36_320 + drift + day * 60);
      out.push({
        t,
        o: open,
        h: Math.max(open, close) + 15,
        l: Math.min(open, close) - 15,
        v: 4_000 + Math.round(Math.abs(drift) * 20),
        c: close,
      });
    }
  }
  return out;
}

const session = { open: SESSION_OPEN, close: SESSION_OPEN + SESSION_LENGTH_MS };

const meta = {
  title: 'Features/Watchlist/MarketChart',
  component: MarketChart,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    // The 1D response: a completed session by default, so the line runs the
    // full 09:15-15:30 width. Stories override `oneDay` for other states.
    oneDay: { session, bars: candles(1, 375, 1) },
  },
  args: { symbol: 'TATAPOWER', title: 'Tata Power', previousClose: 36_330 },
  decorators: [
    /**
     * Stubs `/api/history/`. The 1D timeframe answers with a single session
     * and its fixed window, as the route does; every other timeframe answers
     * with the multi-session series.
     */
    (Story, context) => {
      const original = window.fetch;
      const oneDay = context.parameters.oneDay as object;
      window.fetch = async (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes('/api/history/')) return original(input, init);
        const body = url.includes('tf=1D')
          ? { symbol: 'TATAPOWER', name: 'Tata Power', resolution: '1m', ...oneDay }
          : {
              symbol: 'TATAPOWER',
              name: 'Tata Power',
              resolution: '15m',
              bars: candles(5, 25, 15),
            };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };
      return (
        <div className="max-w-3xl">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof MarketChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = { args: { compact: true } };

/**
 * Mid-session: only the candles formed so far exist, and they occupy the part
 * of the session that has elapsed — 09:15 to about 10:00 here. The rest of the
 * plot stays empty, with the previous-close line and hour gridlines running
 * across it, so a live session reads as live rather than as a finished day
 * stretched to fill the width.
 */
export const LiveSession: Story = {
  parameters: { oneDay: { session, bars: candles(1, 45, 1) } },
};
