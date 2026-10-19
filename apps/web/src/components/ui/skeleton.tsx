import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Decorative shape; its containing LoadingRegion owns the accessible status. */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      {...props}
      aria-hidden="true"
      data-slot="skeleton"
      className={cn('skeleton-shape rounded-md bg-border/50', className)}
    />
  );
}

export { Skeleton };
