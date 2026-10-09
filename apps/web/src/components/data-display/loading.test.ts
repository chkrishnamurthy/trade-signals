import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable } from './data-table';
import { LoadingRegion, SkeletonForm, SkeletonMetrics, SkeletonTable } from './loading';

describe('loading accessibility and refresh contract', () => {
  it('announces a composed boundary once and keeps placeholders out of the accessibility tree', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingRegion, {
        label: 'Loading research',
        // biome-ignore lint/correctness/noChildrenProp: required prop in a non-JSX .ts render test
        children: [
          createElement(SkeletonMetrics, { key: 'metrics' }),
          createElement(SkeletonTable, { key: 'table' }),
        ],
      }),
    );
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('Loading research');
    expect(html).toContain('aria-busy="true" aria-hidden="true"');
    expect(html).not.toMatch(/<(button|input|a)\b/);
  });

  it('form placeholders cannot accept focus or be submitted', () => {
    const html = renderToStaticMarkup(createElement(SkeletonForm));
    expect(html).not.toMatch(/<(form|input|button|select|textarea)\b/);
    expect(html).toContain('data-slot="skeleton"');
  });

  it('keeps existing table data and column headers visible during refresh', () => {
    const html = renderToStaticMarkup(
      createElement(DataTable<{ name: string }>, {
        data: [{ name: 'Existing row' }],
        columns: [{ id: 'name', header: 'Stock', cell: (row) => row.name }],
        getRowId: (row) => row.name,
        status: 'loading',
      }),
    );
    expect(html).toContain('Existing row');
    expect(html).toContain('Stock');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('data-slot="skeleton"');
  });

  it('does not show an empty state before the first table response', () => {
    const html = renderToStaticMarkup(
      createElement(DataTable<{ name: string }>, {
        data: [],
        columns: [{ id: 'name', header: 'Stock', cell: (row) => row.name }],
        getRowId: (row) => row.name,
        status: 'loading',
        emptyTitle: 'No stocks',
      }),
    );
    expect(html).toContain('Loading table data');
    expect(html).not.toContain('No stocks');
  });
});
