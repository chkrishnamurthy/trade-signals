import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { IndicatorValue, PercentChange, Price } from '@/components/market/numeric';
import { StockIdentity } from '@/components/market/stock-identity';
import { MOCK_STOCKS, type MockStock } from '@/stories/fixtures/market-data';
import { DataTable, type DataTableColumn } from './data-table';

/**
 * Hand-rolled table: sort, hide, paginate, select. Responsiveness is per-column
 * (`hideBelow`) — on a phone you drop the least important columns, never shrink
 * the price. Composes the numeric + identity domain components.
 */
const meta = {
  title: 'Domain/DataTable',
  component: DataTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { data: [], columns: [], getRowId: () => '' },
} satisfies Meta<typeof DataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const columns: DataTableColumn<MockStock>[] = [
  {
    id: 'symbol',
    header: 'Stock',
    cell: (r) => <StockIdentity symbol={r.symbol} name={r.name} />,
    sortValue: (r) => r.symbol,
  },
  {
    id: 'last',
    header: 'Last',
    numeric: true,
    cell: (r) => <Price paise={r.lastPaise} />,
    sortValue: (r) => r.lastPaise,
  },
  {
    id: 'change',
    header: 'Change %',
    numeric: true,
    cell: (r) => <PercentChange value={r.changePct} />,
    sortValue: (r) => r.changePct,
  },
  {
    id: 'rsi',
    header: 'RSI',
    numeric: true,
    hideBelow: 'sm',
    cell: (r) => <IndicatorValue value={r.rsi} />,
    sortValue: (r) => r.rsi,
  },
];

export const Ready: Story = {
  render: () => (
    <div className="max-w-2xl rounded-lg border border-border">
      <DataTable
        data={MOCK_STOCKS}
        columns={columns}
        getRowId={(r) => r.symbol}
        initialSort={{ columnId: 'change', direction: 'desc' }}
        caption="Sorted by day change · click a header to re-sort"
      />
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="max-w-2xl rounded-lg border border-border">
      <DataTable data={[]} columns={columns} getRowId={(r) => r.symbol} status="loading" />
    </div>
  ),
};

export const ErrorStatus: Story = {
  render: () => (
    <div className="max-w-2xl rounded-lg border border-border">
      <DataTable
        data={[]}
        columns={columns}
        getRowId={(r) => r.symbol}
        status="error"
        errorMessage="Could not load quotes."
        onRetry={() => {}}
      />
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <div className="max-w-2xl rounded-lg border border-border">
      <DataTable
        data={[]}
        columns={columns}
        getRowId={(r) => r.symbol}
        emptyTitle="No stocks match"
        emptyDescription="Adjust the filters to see results."
      />
    </div>
  ),
};

export const WithSelection: Story = {
  render: function Render() {
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(['TCS']));
    return (
      <div className="max-w-2xl rounded-lg border border-border">
        <DataTable
          data={MOCK_STOCKS}
          columns={columns}
          getRowId={(r) => r.symbol}
          selection={{ selected, onChange: setSelected }}
        />
      </div>
    );
  },
};
