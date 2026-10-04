import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Sparkline } from '@/components/market/sparkline';
import { ChartContainer, ChartLegendItem, ChartToolbar } from './chart-container';

/**
 * Chart chrome — the shared frame around hand-drawn SVG charts: header, timeframe
 * control, legend. Chart colours come from `--chart-*` and tone tokens, never
 * literals, so a chart re-themes with the app.
 */
const meta = {
  title: 'Domain/ChartContainer',
  component: ChartContainer,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ChartContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

const SERIES = [100, 102, 101, 105, 104, 108, 112, 110, 115, 118];
const TIMEFRAMES = ['1D', '1W', '1M', '1Y'] as const;

export const Default: Story = {
  render: function Render() {
    const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>('1M');
    return (
      <div className="w-[28rem]">
        <ChartContainer
          title="RELIANCE"
          subtitle="Reliance Industries · daily close"
          toolbar={<ChartToolbar options={TIMEFRAMES} value={tf} onChange={setTf} />}
          legend={
            <>
              <ChartLegendItem tone="bullish">Close</ChartLegendItem>
              <ChartLegendItem swatch="var(--chart-2)">50-day EMA</ChartLegendItem>
            </>
          }
        >
          <Sparkline values={SERIES} width={420} height={140} fill className="h-40 w-full" />
        </ChartContainer>
      </div>
    );
  },
};

export const Bare: Story = {
  render: () => (
    <div className="w-[28rem]">
      <ChartContainer>
        <Sparkline values={SERIES} width={420} height={120} className="h-32 w-full" />
      </ChartContainer>
    </div>
  ),
};
