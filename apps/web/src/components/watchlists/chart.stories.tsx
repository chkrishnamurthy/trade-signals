import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketChart } from './chart';

/**
 * The price chart with its hover tooltip: a pill above the plot at the cursor
 * carrying the candle's close and time, a dashed crosshair and a dot on the
 * line. Candle data is stubbed at the fetch boundary so the story is
 * deterministic and needs no market-data provider.
 */

/** Five sessions of synthetic 5-minute candles around ₹365, in paise. */
function candles(): { t: number; o: number; h: number; l: number; c: number; v: number }[] {
  const out = [];
  let close = 36_320;
  const start = Date.UTC(2026, 8, 7, 3, 45); // Mon 7 Sept 09:15 IST
  for (let day = 0; day < 5; day++) {
    for (let i = 0; i < 75; i++) {
      const t = start + day * 86_400_000 + i * 300_000;
      const drift = Math.sin((day * 75 + i) / 9) * 90 + Math.cos(i / 4) * 40;
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

const meta = {
  title: 'Features/Watchlist/MarketChart',
  component: MarketChart,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { symbol: 'TATAPOWER', title: 'Tata Power', previousClose: 36_330 },
  decorators: [
    (Story) => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes('/api/history/')) return original(input, init);
        const body = { symbol: 'TATAPOWER', name: 'Tata Power', resolution: '5m', bars: candles() };
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
