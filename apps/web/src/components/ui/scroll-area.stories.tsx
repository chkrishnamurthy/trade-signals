import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MOCK_STOCKS } from '@/stories/fixtures/market-data';
import { ScrollArea } from './scroll-area';

const meta = {
  title: 'Primitives/ScrollArea',
  component: ScrollArea,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROWS = Array.from({ length: 6 }, () => MOCK_STOCKS).flat();

export const Vertical: Story = {
  render: () => (
    <ScrollArea className="h-48 w-64 rounded-lg border border-border">
      <ul className="divide-y divide-border text-sm">
        {ROWS.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: repeated fixture list
          <li key={`${s.symbol}-${i}`} className="px-3 py-2">
            {s.symbol}
          </li>
        ))}
      </ul>
    </ScrollArea>
  ),
};
