import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Table primitives.
 *
 * Deliberately unopinionated about data: sorting, filtering and column
 * visibility live in `data-display/data-table`, which composes these. Anything
 * that needs a plain table (a two-column metrics grid, a docs example) uses
 * these directly and still matches the screener row-for-row.
 *
 * `TableContainer` owns the horizontal scroll so a wide table never widens the
 * page — the single most common responsive break in a financial UI.
 */
function TableContainer({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="table-container"
      className={cn('relative w-full overflow-x-auto', className)}
      {...props}
    />
  );
}

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <table
      data-slot="table"
      className={cn('w-full caption-bottom border-collapse text-sm', className)}
      {...props}
    />
  );
}

interface TableHeaderProps extends React.ComponentProps<'thead'> {
  /** Keeps the header visible while a long result set scrolls. */
  sticky?: boolean | undefined;
}

function TableHeader({ className, sticky = false, ...props }: TableHeaderProps) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        '[&_tr]:border-b [&_tr]:border-border',
        sticky && 'sticky top-0 z-10 bg-surface',
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t border-border bg-muted/50 font-medium', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border transition-colors last:border-0',
        'hover:bg-accent/60 focus-within:bg-accent/60 data-[state=selected]:bg-accent',
        className,
      )}
      {...props}
    />
  );
}

interface TableHeadProps extends React.ComponentProps<'th'> {
  /** Right-aligns the column. Use it for every price and every count. */
  numeric?: boolean | undefined;
}

function TableHead({ className, numeric = false, ...props }: TableHeadProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-8 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
        numeric && 'text-right',
        className,
      )}
      {...props}
    />
  );
}

interface TableCellProps extends React.ComponentProps<'td'> {
  /** Right-aligns and applies tabular figures. */
  numeric?: boolean | undefined;
}

function TableCell({ className, numeric = false, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'px-3 py-2 align-middle whitespace-nowrap',
        numeric && 'figure text-right',
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-3 text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
