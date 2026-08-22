import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Stock identity — ticker over company name.
 *
 * The ticker is the primary key a trader scans for, so it always wins the
 * visual weight and the name truncates first.
 */
export function StockIdentity({
  symbol,
  name,
  size = 'md',
  className,
  children,
}: {
  symbol: string;
  name?: string | null | undefined;
  size?: 'sm' | 'md' | 'lg' | undefined;
  className?: string | undefined;
  /** Badges shown inline after the ticker. */
  children?: React.ReactNode | undefined;
}) {
  const symbolClass = {
    sm: 'text-xs font-medium',
    md: 'text-sm font-medium',
    lg: 'text-lg font-semibold tracking-tight',
  }[size];

  return (
    <span className={cn('flex min-w-0 flex-col', className)}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn('truncate', symbolClass)}>{symbol}</span>
        {children}
      </span>
      {name !== null && name !== undefined && name !== '' && (
        <span className="truncate text-xs text-muted-foreground">{name}</span>
      )}
    </span>
  );
}

/**
 * Monogram stand-in for a company logo.
 *
 * No logo source exists for NSE equities in this system, and inventing one
 * would mean shipping an asset that may not belong to the company. Initials
 * are honest and deterministic.
 */
export function StockAvatar({
  symbol,
  className,
}: {
  symbol: string;
  className?: string | undefined;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-md bg-muted text-[0.6875rem] font-semibold text-muted-foreground',
        className,
      )}
    >
      {symbol.slice(0, 2)}
    </span>
  );
}
