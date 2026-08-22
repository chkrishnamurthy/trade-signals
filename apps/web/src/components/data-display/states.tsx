import { AlertTriangleIcon, InboxIcon, RefreshCwIcon, WifiOffIcon } from 'lucide-react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * Empty, error and loading states.
 *
 * One implementation each, for the whole product. A screener with no matches
 * and a watchlist with no entries are the same shape of moment and should look
 * like it.
 *
 * The error variants distinguish "we have no data" from "we have data and it
 * may be wrong". Financial UIs must never silently show a stale number as if it
 * were current, so the copy always names which situation the user is in.
 */

interface EmptyStateProps {
  title: string;
  description?: string | undefined;
  icon?: React.ReactNode | undefined;
  action?: React.ReactNode | undefined;
  className?: string | undefined;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex h-full min-h-24 flex-col items-center justify-center gap-1 px-4 py-8 text-center',
        className,
      )}
    >
      <span className="mb-1 text-subtle-foreground [&_svg]:size-5" aria-hidden>
        {icon ?? <InboxIcon />}
      </span>
      <Text variant="label">{title}</Text>
      {description !== undefined && (
        <Text variant="caption" className="max-w-xs text-balance">
          {description}
        </Text>
      )}
      {action !== undefined && <div className="mt-3">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string | undefined;
  description?: string | undefined;
  /** Verbatim upstream text — the remedy, a status line. Rendered monospace. */
  detail?: string | undefined;
  onRetry?: (() => void) | undefined;
  icon?: React.ReactNode | undefined;
  className?: string | undefined;
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  detail,
  onRetry,
  icon,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex h-full min-h-24 flex-col items-center justify-center gap-1.5 px-4 py-8 text-center',
        className,
      )}
    >
      <span className="mb-1 text-destructive [&_svg]:size-5" aria-hidden>
        {icon ?? <AlertTriangleIcon />}
      </span>
      <Text variant="label">{title}</Text>
      {description !== undefined && (
        <Text variant="caption" className="max-w-sm text-balance">
          {description}
        </Text>
      )}
      {detail !== undefined && (
        <code className="mt-1 max-w-sm rounded-md bg-muted px-2 py-1.5 text-left font-mono text-xs text-muted-foreground">
          {detail}
        </code>
      )}
      {onRetry !== undefined && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-3">
          <RefreshCwIcon />
          Try again
        </Button>
      )}
    </div>
  );
}

/** The field exists but the exchange has not supplied it for this session. */
export function DataUnavailable({
  what,
  reason,
  className,
}: {
  what: string;
  reason?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <EmptyState
      className={className}
      icon={<AlertTriangleIcon className="text-warning" />}
      title={`${what} unavailable`}
      description={reason ?? 'This has not been supplied for the current session.'}
    />
  );
}

export function ConnectionError({
  onRetry,
  detail,
  className,
}: {
  onRetry?: (() => void) | undefined;
  detail?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <ErrorState
      className={className}
      icon={<WifiOffIcon />}
      title="Market data source unreachable"
      description="Nothing is being shown rather than something possibly wrong."
      detail={detail}
      onRetry={onRetry}
    />
  );
}

/** Error inside a row or a field, where a full state block would break layout. */
export function InlineError({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs text-destructive', className)}
      role="alert"
    >
      <AlertTriangleIcon className="size-3" aria-hidden />
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Loading
 *
 * Skeletons rather than spinners: a skeleton holds the layout it is about to
 * become, so the page does not jump when data lands.
 * -------------------------------------------------------------------------*/

export function SkeletonRows({
  rows = 5,
  className,
}: {
  rows?: number | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn('space-y-2', className)} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton, never reordered
        <Skeleton key={i} className="h-8" />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string | undefined }) {
  return <Skeleton className={cn('h-32 rounded-lg', className)} aria-busy="true" />;
}

export function ChartSkeleton({ className }: { className?: string | undefined }) {
  return <Skeleton className={cn('h-80 rounded-lg', className)} aria-busy="true" />;
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
    <div className={cn('w-full', className)} aria-busy="true">
      {Array.from({ length: rows }, (_, r) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton, never reordered
          key={r}
          className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0"
        >
          {Array.from({ length: columns }, (_, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton, never reordered
            <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'w-28' : 'flex-1')} />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading table data</span>
    </div>
  );
}

/** Placeholder for a single value inside otherwise-loaded content. */
export function InlineSkeleton({ className }: { className?: string | undefined }) {
  return <Skeleton className={cn('inline-block h-3.5 w-14 align-middle', className)} aria-hidden />;
}
