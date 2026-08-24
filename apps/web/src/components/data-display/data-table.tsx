'use client';

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, SettingsIcon } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, TableSkeleton } from './states';

/**
 * The one financial data table.
 *
 * NIFTY 50, the screener, signals, watchlists, IPOs and movers all render
 * through this. Five separate table implementations is how a product ends up
 * with five different ideas of what a sorted column looks like.
 *
 * Deliberately hand-rolled rather than wrapping a table library: the feature
 * set here is sort, hide, paginate and select, and a dependency that brings a
 * hundred more would be the larger thing to maintain.
 *
 * Responsiveness is per-column (`hideBelow`) rather than a separate mobile
 * component. Financial columns are not equally important, and the answer on a
 * phone is to drop the least important ones — never to shrink the price.
 */

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  /** Right-aligns and applies tabular figures. Every price column wants this. */
  numeric?: boolean | undefined;
  cell: (row: Row) => ReactNode;
  /**
   * Sort key. Returning `null` sends the row to the bottom in both directions —
   * missing data is not "smallest", it is absent.
   */
  sortValue?: ((row: Row) => number | string | null) | undefined;
  /** Below this breakpoint the column is dropped rather than squeezed. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl' | undefined;
  /** Excluded from the column-visibility menu when false. */
  hideable?: boolean | undefined;
  headerClassName?: string | undefined;
  cellClassName?: string | undefined;
}

const HIDE_BELOW_CLASS: Record<NonNullable<DataTableColumn<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

export interface DataTableProps<Row> {
  data: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  getRowId: (row: Row) => string;

  status?: 'ready' | 'loading' | 'error' | undefined;
  errorMessage?: string | undefined;
  onRetry?: (() => void) | undefined;

  emptyTitle?: string | undefined;
  emptyDescription?: string | undefined;
  emptyAction?: ReactNode | undefined;

  initialSort?: { columnId: string; direction: 'asc' | 'desc' } | undefined;
  /**
   * Controlled multi-column sort.
   *
   * Supplying this hands sorting to the caller: the table renders the
   * indicators and reports clicks, and the caller decides what the new order
   * is. That is what a watchlist needs, because its sort is persisted and has
   * to survive a reload — state the table cannot own.
   *
   * `additive` is true when the click was shift-modified, which is the only
   * way a second sort column can be reached from the keyboard or the mouse.
   * Omit both and the table keeps its own single-column sort as before.
   */
  sort?: readonly { columnId: string; direction: 'asc' | 'desc' }[] | undefined;
  onSortChange?: ((columnId: string, additive: boolean) => void) | undefined;
  /** Trailing per-row cell, pinned to the right. For a row's action menu. */
  rowActions?: ((row: Row) => ReactNode) | undefined;
  stickyHeader?: boolean | undefined;
  /** Omit for no pagination — the common case for a 50-row index. */
  pageSize?: number | undefined;
  onRowClick?: ((row: Row) => void) | undefined;
  selection?:
    | {
        selected: ReadonlySet<string>;
        onChange: (next: ReadonlySet<string>) => void;
      }
    | undefined;
  /** Shows the column-visibility menu. Off by default: most tables do not need it. */
  columnVisibility?: boolean | undefined;
  caption?: string | undefined;
  className?: string | undefined;
}

export function DataTable<Row>({
  data,
  columns,
  getRowId,
  status = 'ready',
  errorMessage,
  onRetry,
  emptyTitle = 'No results',
  emptyDescription,
  emptyAction,
  initialSort,
  sort: controlledSort,
  onSortChange,
  rowActions,
  stickyHeader = false,
  pageSize,
  onRowClick,
  selection,
  columnVisibility = false,
  caption,
  className,
}: DataTableProps<Row>) {
  const [internalSort, setSort] = useState(initialSort ?? null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [page, setPage] = useState(0);

  // One shape for both modes, so the header renders from a single source.
  const isControlled = controlledSort !== undefined;
  const sortRules = isControlled ? controlledSort : internalSort === null ? [] : [internalSort];

  const visibleColumns = useMemo(
    () => columns.filter((column) => !hidden.has(column.id)),
    [columns, hidden],
  );

  const sorted = useMemo(() => {
    // Controlled: the caller sorted before handing the rows over. Re-sorting
    // here would silently drop every rule after the first.
    if (isControlled) return data;
    const sort = internalSort;
    if (sort === null) return data;
    const column = columns.find((c) => c.id === sort.columnId);
    if (column?.sortValue === undefined) return data;
    const read = column.sortValue;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const left: number | string | null = read(a);
      const right: number | string | null = read(b);
      // Missing data sinks in both directions rather than pretending to be zero.
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left).localeCompare(String(right)) * factor;
      }
      return (left - right) * factor;
    });
  }, [data, columns, internalSort, isControlled]);

  const pageCount = pageSize === undefined ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const rows = useMemo(
    () =>
      pageSize === undefined
        ? sorted
        : sorted.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [sorted, pageSize, safePage],
  );

  const toggleSort = useCallback(
    (columnId: string, additive: boolean) => {
      if (onSortChange !== undefined) {
        onSortChange(columnId, additive);
        return;
      }
      setSort((current) => {
        if (current === null || current.columnId !== columnId) {
          return { columnId, direction: 'desc' };
        }
        // Third click clears the sort and restores the feed's own ordering,
        // which for movers and signals is itself meaningful.
        return current.direction === 'desc' ? { columnId, direction: 'asc' } : null;
      });
    },
    [onSortChange],
  );

  const allSelected =
    selection !== undefined &&
    rows.length > 0 &&
    rows.every((r) => selection.selected.has(getRowId(r)));

  const toggleAll = useCallback(() => {
    if (selection === undefined) return;
    const next = new Set(selection.selected);
    if (allSelected) {
      for (const row of rows) next.delete(getRowId(row));
    } else {
      for (const row of rows) next.add(getRowId(row));
    }
    selection.onChange(next);
  }, [selection, rows, allSelected, getRowId]);

  if (status === 'loading') {
    return (
      <TableSkeleton
        rows={pageSize ?? 8}
        columns={visibleColumns.length + (rowActions === undefined ? 0 : 1)}
        className={className}
      />
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        className={className}
        title="Could not load this table"
        description={errorMessage}
        onRetry={onRetry}
      />
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        className={className}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {columnVisibility && (
        <div className="flex justify-end px-3 py-1.5">
          <ColumnVisibilityMenu columns={columns} hidden={hidden} onChange={setHidden} />
        </div>
      )}

      <TableContainer>
        <Table>
          {caption !== undefined && <caption className="sr-only">{caption}</caption>}
          <TableHeader sticky={stickyHeader}>
            <TableRow className="hover:bg-transparent">
              {selection !== undefined && (
                <TableHead className="w-8 pr-0">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all rows on this page"
                  />
                </TableHead>
              )}
              {visibleColumns.map((column) => {
                const sortable = column.sortValue !== undefined;
                const ruleIndex = sortRules.findIndex((rule) => rule.columnId === column.id);
                const rule = ruleIndex === -1 ? undefined : sortRules[ruleIndex];
                const active = rule !== undefined;
                return (
                  <TableHead
                    key={column.id}
                    numeric={column.numeric === true}
                    className={cn(
                      column.hideBelow !== undefined && HIDE_BELOW_CLASS[column.hideBelow],
                      column.headerClassName,
                    )}
                    aria-sort={
                      active ? (rule.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={(event) => toggleSort(column.id, event.shiftKey)}
                        title={
                          active
                            ? `Sorted ${rule.direction === 'asc' ? 'ascending' : 'descending'}. Shift-click to add a tie-breaker.`
                            : 'Sort. Shift-click to add as a tie-breaker.'
                        }
                        className={cn(
                          'inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground',
                          active && 'text-foreground',
                          column.numeric === true && 'flex-row-reverse',
                        )}
                      >
                        {column.header}
                        {active ? (
                          rule.direction === 'asc' ? (
                            <ArrowUpIcon className="size-3" aria-hidden />
                          ) : (
                            <ArrowDownIcon className="size-3" aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDownIcon className="size-3 opacity-40" aria-hidden />
                        )}
                        {/* Only worth showing once a second rule exists — a lone
                            "1" next to the arrow is noise. */}
                        {active && sortRules.length > 1 && (
                          <span className="text-[0.625rem] tabular-nums text-muted-foreground">
                            {ruleIndex + 1}
                          </span>
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                );
              })}
              {rowActions !== undefined && (
                <TableHead className="w-10 pl-0">
                  <span className="sr-only">Row actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((row) => {
              const id = getRowId(row);
              const isSelected = selection?.selected.has(id) === true;
              return (
                <TableRow
                  key={id}
                  data-state={isSelected ? 'selected' : undefined}
                  className={onRowClick !== undefined ? 'cursor-pointer' : undefined}
                  onClick={onRowClick === undefined ? undefined : () => onRowClick(row)}
                >
                  {selection !== undefined && (
                    <TableCell className="w-8 pr-0" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          const next = new Set(selection.selected);
                          if (checked === true) next.add(id);
                          else next.delete(id);
                          selection.onChange(next);
                        }}
                        aria-label={`Select ${id}`}
                      />
                    </TableCell>
                  )}
                  {visibleColumns.map((column) => (
                    <TableCell
                      key={column.id}
                      numeric={column.numeric === true}
                      className={cn(
                        column.hideBelow !== undefined && HIDE_BELOW_CLASS[column.hideBelow],
                        column.cellClassName,
                      )}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                  {rowActions !== undefined && (
                    <TableCell className="w-10 pl-0" onClick={(event) => event.stopPropagation()}>
                      {rowActions(row)}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {pageSize !== undefined && pageCount > 1 && (
        <Pagination
          page={safePage}
          pageCount={pageCount}
          total={sorted.length}
          onChange={setPage}
        />
      )}
    </div>
  );
}

function ColumnVisibilityMenu<Row>({
  columns,
  hidden,
  onChange,
}: {
  columns: readonly DataTableColumn<Row>[];
  hidden: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <SettingsIcon />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns
          .filter((column) => column.hideable !== false)
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={!hidden.has(column.id)}
              onCheckedChange={(checked) => {
                const next = new Set(hidden);
                if (checked) next.delete(column.id);
                else next.add(column.id);
                onChange(next);
              }}
            >
              {column.header}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
      <span className="text-xs text-muted-foreground">
        Page {page + 1} of {pageCount} · {total} rows
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount - 1}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
