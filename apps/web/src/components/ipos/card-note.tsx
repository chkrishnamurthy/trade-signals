import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A card's description that WRAPS. The shared `CardDescription` truncates to
 * one line, which is right for a terse caption — but on the IPO pages the
 * description often carries a caveat ("not verified, not a forecast", "read
 * the RHP before investing") that must never be cut off on a phone.
 */
export function CardNote({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('mt-0.5 text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}
