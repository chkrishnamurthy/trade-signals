'use client';

import { SearchIcon, XIcon } from 'lucide-react';
import type * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Filtering shell.
 *
 * The screener, the signals list, the IPO calendar and the watchlist all filter
 * the same way, so they share the bar, the chips and the clear-all. What each
 * page supplies is the controls; what it never supplies is the arrangement.
 *
 * Active filters are shown as removable chips rather than only as control
 * state, because a filtered empty result must explain itself: "no matches" is
 * alarming, "no matches for these four filters" is actionable.
 */
export function FilterBar({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="filter-bar"
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface FilterGroupProps extends React.ComponentProps<'div'> {
  label?: string | undefined;
}

/** A labelled cluster of related controls inside the bar. */
export function FilterGroup({ label, className, children, ...props }: FilterGroupProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)} {...props}>
      {label !== undefined && (
        <span className="text-xs whitespace-nowrap text-muted-foreground">{label}</span>
      )}
      {children}
    </div>
  );
}

export function ActiveFilters({
  filters,
  onRemove,
  onClear,
  className,
}: {
  filters: readonly { readonly id: string; readonly label: string }[];
  onRemove: (id: string) => void;
  onClear?: (() => void) | undefined;
  className?: string | undefined;
}) {
  if (filters.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {filters.map((filter) => (
        <Badge key={filter.id} variant="secondary" className="gap-1 pr-1">
          {filter.label}
          <button
            type="button"
            onClick={() => onRemove(filter.id)}
            className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="size-3" aria-hidden />
            <span className="sr-only">Remove filter {filter.label}</span>
          </button>
        </Badge>
      ))}
      {onClear !== undefined && filters.length > 1 && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear all
        </Button>
      )}
    </div>
  );
}

interface SearchInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

/**
 * Search input with the magnifier and a clear affordance.
 *
 * Controlled — debouncing belongs to the caller, which is the only place that
 * knows whether the query hits a local array or the network.
 */
export function SearchInput({
  value,
  onValueChange,
  placeholder = 'Search…',
  className,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className="pl-8 [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value !== '' && (
        <button
          type="button"
          onClick={() => onValueChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm text-subtle-foreground transition-colors hover:text-foreground"
        >
          <XIcon className="size-3.5" aria-hidden />
          <span className="sr-only">Clear search</span>
        </button>
      )}
    </div>
  );
}
