import type { ComponentProps, ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** One announcement per loading boundary, outside the busy subtree so it is read
 * immediately. Decorative descendants have no focus targets or financial values. */
export function LoadingRegion({
  children,
  label = 'Loading content',
  className,
}: {
  children: ReactNode;
  label?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div data-slot="loading-region" className={cn('min-w-0', className)}>
      <span role="status" className="sr-only">
        {label}
      </span>
      <div data-slot="loading-visual" aria-busy="true" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

/** Visual-only building blocks: compose inside one LoadingRegion. */
export function SkeletonPanel({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border border-border bg-surface p-4 shadow-subtle',
        className,
      )}
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: lines }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative slots
        <Skeleton key={i} className={cn('h-3 max-w-full', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonToolbar() {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <Skeleton className="h-9 w-full sm:w-56" />
      <Skeleton className="h-9 w-24" />
      <Skeleton className="h-9 w-24" />
      <Skeleton className="ml-auto h-9 w-20" />
    </div>
  );
}

export function SkeletonMetrics({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative slots
        <SkeletonPanel key={i} className="space-y-3">
          <Skeleton className="h-3 w-20 max-w-full" />
          <Skeleton className="h-7 w-24 max-w-full" />
          <Skeleton className="h-2.5 w-28 max-w-full" />
        </SkeletonPanel>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 4, compact = false }: { rows?: number; compact?: boolean }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative slots
          key={i}
          className={cn('flex min-w-0 items-center gap-3', compact ? 'px-2 py-2.5' : 'py-4')}
        >
          <Skeleton className={cn('shrink-0 rounded-md', compact ? 'size-8' : 'size-10')} />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-2.5 w-3/4" />
          </div>
          <Skeleton className="h-4 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({
  rows = 8,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string | undefined;
}) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-surface', className)}>
      {Array.from({ length: rows + 1 }, (_, r) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative slots
          key={r}
          className={cn(
            'flex items-center gap-4 border-b border-border px-4 last:border-0',
            r === 0 ? 'h-10 bg-muted/50' : 'h-14',
          )}
        >
          {Array.from({ length: columns }, (_, c) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative slots
              key={c}
              className={cn(
                'min-w-0 flex-1',
                c === 0 && 'flex-[2]',
                c >= 3 && 'hidden md:block',
                c >= 5 && 'md:hidden lg:block',
              )}
            >
              <Skeleton
                className={cn('h-3', r === 0 ? 'w-3/5' : r % 2 === 0 ? 'w-2/3' : 'w-4/5')}
              />
              {r > 0 && c === 0 && <Skeleton className="mt-2 h-2 w-3/5" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Neutral plot area with axes and grid, never invented trend or performance. */
export function SkeletonChart({ className }: { className?: string | undefined }) {
  return (
    <SkeletonPanel className={cn('flex h-80 flex-col gap-4', className)}>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-36 max-w-full" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex w-7 flex-col justify-between py-1">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-2 w-full" />
          ))}
        </div>
        <div className="flex flex-1 flex-col justify-between border-b border-l border-border py-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-border/60 border-t" />
          ))}
        </div>
      </div>
      <div className="ml-10 flex justify-between">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-2 w-7" />
        ))}
      </div>
    </SkeletonPanel>
  );
}

export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <SkeletonPanel className="space-y-5">
      <Skeleton className="h-4 w-40 max-w-full" />
      {Array.from({ length: fields }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative slots
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className={cn('w-full', i === 1 ? 'h-20' : 'h-10')} />
        </div>
      ))}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-28" />
      </div>
    </SkeletonPanel>
  );
}

// Compatibility exports: existing consumers gain the same treatment without a
// second skeleton implementation. Page compositions use visual-only pieces above.
export function SkeletonRows({
  rows = 5,
  className,
  label = 'Loading items',
}: {
  rows?: number | undefined;
  className?: string | undefined;
  label?: string | undefined;
}) {
  return (
    <LoadingRegion label={label} className={className}>
      <SkeletonList rows={rows} compact />
    </LoadingRegion>
  );
}
export function CardSkeleton({ className }: { className?: string | undefined }) {
  return (
    <LoadingRegion label="Loading card">
      <SkeletonPanel className={cn('min-h-32 space-y-4', className)}>
        <Skeleton className="h-4 w-1/3" />
        <SkeletonText />
      </SkeletonPanel>
    </LoadingRegion>
  );
}
export function ChartSkeleton({ className }: { className?: string | undefined }) {
  return (
    <LoadingRegion label="Loading chart">
      <SkeletonChart className={className} />
    </LoadingRegion>
  );
}
export function TableSkeleton({
  rows = 8,
  columns = 5,
  className,
}: {
  rows?: number | undefined;
  columns?: number | undefined;
  className?: string | undefined;
}) {
  return (
    <LoadingRegion label="Loading table data" className={className}>
      <SkeletonTable rows={rows} columns={columns} />
    </LoadingRegion>
  );
}

/** Compact watchlist summary: one panel, stacked on phones just like SummaryBar. */
export function SkeletonSummary() {
  return (
    <SkeletonPanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn('flex min-w-0 flex-1 flex-col gap-2', i === 4 && 'hidden lg:flex')}
        >
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-24 max-w-full" />
        </div>
      ))}
    </SkeletonPanel>
  );
}

/** Tables that become identity/value cards below their feature breakpoint. */
export function SkeletonResults({
  rows = 6,
  columns = 6,
  breakpoint = 'sm',
}: {
  rows?: number;
  columns?: number;
  breakpoint?: 'sm' | 'lg';
}) {
  return (
    <>
      <div className={breakpoint === 'sm' ? 'hidden sm:block' : 'hidden lg:block'}>
        <SkeletonTable rows={rows} columns={columns} />
      </div>
      <div className={cn('space-y-2', breakpoint === 'sm' ? 'sm:hidden' : 'lg:hidden')}>
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative slots
          <SkeletonPanel key={i} className="space-y-3 p-3">
            <div className="flex justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
            <div className="flex gap-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
          </SkeletonPanel>
        ))}
      </div>
    </>
  );
}
