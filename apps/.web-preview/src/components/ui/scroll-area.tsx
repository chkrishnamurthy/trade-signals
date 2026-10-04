'use client';

import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import type * as React from 'react';
import { cn } from '@/lib/utils';

interface ScrollAreaProps extends React.ComponentProps<typeof ScrollAreaPrimitive.Root> {
  viewportClassName?: string | undefined;
}

function ScrollArea({ className, children, viewportClassName, ...props }: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative', className)}
      {...props}
    >
      {/* `max-h-[inherit]` is load-bearing: a caller puts the height cap on the
          Root (e.g. `max-h-[70vh]`), but Radix's *Viewport* is the scroller, and a
          plain `h-full` viewport resolves to the content height against a Root that
          has only a max-height — so it renders full-size and never scrolls, spilling
          the panel over the page. Inheriting the Root's max-height caps the viewport
          itself, so it clamps and scrolls. A caller needing a different cap on the
          viewport still overrides via `viewportClassName`. */}
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          'size-full max-h-[inherit] rounded-[inherit] outline-none',
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'flex touch-none p-px transition-colors select-none',
        orientation === 'vertical' && 'h-full w-2 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-2 flex-col border-t border-t-transparent',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border-strong" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
