import type * as React from 'react';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * Page structure primitives.
 *
 * Every route composes the same four pieces — container, header, sections,
 * content — so page-to-page navigation never changes where the title sits or
 * how wide the content runs.
 *
 * The max width is generous (1800px) because this is a data product read on
 * large monitors; on a 32-inch display, capping content at 1280px wastes half
 * the screen a trader deliberately bought.
 */
export function PageContainer({
  className,
  width = 'wide',
  ...props
}: React.ComponentProps<'div'> & { width?: 'wide' | 'narrow' | 'prose' }) {
  const widthClass = {
    wide: 'max-w-[1800px]',
    narrow: 'max-w-5xl',
    prose: 'max-w-3xl',
  }[width];

  return (
    <div
      data-slot="page-container"
      className={cn('mx-auto w-full px-4 py-4 sm:px-6', widthClass, className)}
      {...props}
    />
  );
}

export function PageHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      data-slot="page-header"
      className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pb-4', className)}
      {...props}
    />
  );
}

export function PageTitle({ className, ...props }: React.ComponentProps<'h1'>) {
  return <Text as="h1" variant="page-title" className={className} {...props} />;
}

export function PageDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <Text
      as="p"
      variant="secondary"
      className={cn('mt-1 max-w-2xl text-balance', className)}
      {...props}
    />
  );
}

/** Right-hand slot of the page header: filters, export, refresh. */
export function PageActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-actions"
      className={cn('flex shrink-0 flex-wrap items-center gap-2', className)}
      {...props}
    />
  );
}

/** Vertical rhythm between the blocks of a page. One gap value, everywhere. */
export function PageContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="page-content" className={cn('flex flex-col gap-4', className)} {...props} />
  );
}

export function Section({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section data-slot="section" className={cn('flex flex-col gap-3', className)} {...props} />
  );
}

export function SectionHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="section-header"
      className={cn('flex items-baseline justify-between gap-3', className)}
      {...props}
    />
  );
}

export function SectionTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <Text as="h2" variant="section-title" className={className} {...props} />;
}

export function SectionDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <Text as="p" variant="caption" className={className} {...props} />;
}
