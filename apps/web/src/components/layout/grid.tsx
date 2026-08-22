import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Dashboard grid.
 *
 * Four named layouts cover every board in the product, so a new page picks one
 * instead of inventing a column count. The breakpoints step up rather than
 * shrinking down: a phone gets one column of full-width cards, and only a wide
 * screen earns the multi-column board.
 */
export function ContentGrid({
  className,
  columns = 'metrics',
  ...props
}: React.ComponentProps<'div'> & {
  /**
   * `metrics` — a row of headline tiles (1 / 2 / 4)
   * `stats`   — a dense strip of supporting numbers (2 / 3 / 6)
   * `split`   — two equal panels (1 / 2)
   * `board`   — a main region plus a narrower rail (1 / 3, main spans 2)
   * `cards`   — a flowing grid of equal cards (1 / 2 / 4)
   */
  columns?: 'metrics' | 'stats' | 'split' | 'board' | 'cards' | undefined;
}) {
  const layout = {
    metrics: 'grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4',
    stats: 'grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6',
    split: 'grid-cols-1 gap-4 lg:grid-cols-2',
    board: 'grid-cols-1 gap-4 xl:grid-cols-3',
    cards: 'grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4',
  }[columns];

  return <div data-slot="content-grid" className={cn('grid', layout, className)} {...props} />;
}

/** The wide half of a `board` grid. */
export function GridMain({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex min-w-0 flex-col gap-4 xl:col-span-2', className)} {...props} />;
}

/** The narrow rail of a `board` grid. */
export function GridRail({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex min-w-0 flex-col gap-4', className)} {...props} />;
}
