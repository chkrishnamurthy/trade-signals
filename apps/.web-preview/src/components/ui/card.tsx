import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Card — the one panel shell in the product.
 *
 * Compositional rather than prop-driven (`<Card><CardHeader>…`), so a panel
 * that needs a toolbar, a footer or a bare body composes rather than adding a
 * boolean. `CardToolbar` is the slot every header action belongs in.
 */
function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      data-slot="card"
      className={cn(
        'flex min-w-0 flex-col rounded-lg border border-border bg-surface text-surface-foreground shadow-subtle',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      data-slot="card-header"
      className={cn(
        'flex items-start justify-between gap-3 border-b border-border px-4 py-3',
        className,
      )}
      {...props}
    />
  );
}

function CardHeading({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-heading" className={cn('min-w-0', className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="card-title"
      className={cn('truncate text-sm font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('mt-0.5 truncate text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

/** Header-right slot: filters, sort toggles, "view all" links. */
function CardToolbar({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-toolbar"
      className={cn('flex shrink-0 items-center gap-1', className)}
      {...props}
    />
  );
}

interface CardContentProps extends React.ComponentProps<'div'> {
  /** Drops the padding for cards whose body is a list or a table. */
  flush?: boolean | undefined;
}

function CardContent({ className, flush = false, ...props }: CardContentProps) {
  return (
    <div
      data-slot="card-content"
      className={cn('min-h-0 flex-1', flush ? '' : 'p-4', className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'footer'>) {
  return (
    <footer
      data-slot="card-footer"
      className={cn(
        'flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardHeading,
  CardTitle,
  CardToolbar,
};
