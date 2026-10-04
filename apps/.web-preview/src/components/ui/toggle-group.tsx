'use client';

import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Segmented control.
 *
 * Used for every "pick exactly one of a short list" control in the product —
 * chart timeframes, signal direction filters, theme. Radix gives it roving
 * focus and correct `aria-pressed`/`radiogroup` semantics for free.
 */
function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn('inline-flex w-fit items-center gap-0.5 rounded-md bg-muted p-0.5', className)}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-sm px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors',
        'hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
        'data-[state=on]:bg-surface data-[state=on]:text-foreground data-[state=on]:shadow-subtle',
        '[&_svg:not([class*=size-])]:size-3.5 [&_svg]:pointer-events-none',
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
