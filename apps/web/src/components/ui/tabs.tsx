'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Two looks, one component.
 *  - `line` (default): text tabs on a rule, the active one underlined in the brand colour.
 *    For switching between sections of a page. Scrolls sideways on a phone, never wraps.
 *  - `pill`: a small raised switch for choosing between close alternatives (a view, a range).
 */
type TabsVariant = 'line' | 'pill';

const VariantContext = React.createContext<TabsVariant>('line');

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-3', className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  variant = 'line',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  return (
    <VariantContext.Provider value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(
          variant === 'line'
            ? 'flex w-full items-end gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'inline-flex w-fit items-center gap-0.5 rounded-md bg-muted p-0.5 text-muted-foreground',
          className,
        )}
        {...props}
      />
    </VariantContext.Provider>
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(VariantContext);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring',
        '[&_svg:not([class*=size-])]:size-3.5 [&_svg]:pointer-events-none',
        variant === 'line'
          ? [
              'relative h-11 shrink-0 px-3.5 text-sm text-muted-foreground hover:text-foreground',
              'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors',
              'data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:after:bg-primary',
            ]
          : [
              'h-7 flex-1 rounded-sm px-2.5 text-xs hover:text-foreground',
              'data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-subtle',
            ],
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        'flex-1 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
