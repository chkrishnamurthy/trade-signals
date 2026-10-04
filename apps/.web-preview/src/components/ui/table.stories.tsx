import { formatPaise } from '@equitywise/shared';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { cn } from '@/lib/utils';
import { MOCK_STOCKS } from '@/stories/fixtures/market-data';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

const meta = {
  title: 'Primitives/Table',
  component: Table,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `numeric` right-aligns and applies tabular figures — use it for every price. */
export const Default: Story = {
  render: () => (
    <TableContainer className="max-w-2xl rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Name</TableHead>
            <TableHead numeric>Last</TableHead>
            <TableHead numeric>Change %</TableHead>
            <TableHead numeric>RSI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_STOCKS.map((s) => (
            <TableRow key={s.symbol}>
              <TableCell className="font-medium">{s.symbol}</TableCell>
              <TableCell className="text-muted-foreground">{s.name}</TableCell>
              <TableCell numeric>{formatPaise(s.lastPaise)}</TableCell>
              <TableCell
                numeric
                className={cn(
                  s.changePct > 0 && 'text-positive-strong',
                  s.changePct < 0 && 'text-negative-strong',
                )}
              >
                {s.changePct > 0 ? '+' : ''}
                {s.changePct.toFixed(2)}%
              </TableCell>
              <TableCell numeric>{s.rsi.toFixed(1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableCaption>End-of-day values · prices in ₹</TableCaption>
      </Table>
    </TableContainer>
  ),
};

export const SelectedRow: Story = {
  render: () => (
    <TableContainer className="max-w-md rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead numeric>Last</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_STOCKS.slice(0, 3).map((s, i) => (
            <TableRow key={s.symbol} data-state={i === 1 ? 'selected' : undefined}>
              <TableCell className="font-medium">{s.symbol}</TableCell>
              <TableCell numeric>{formatPaise(s.lastPaise)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  ),
};
