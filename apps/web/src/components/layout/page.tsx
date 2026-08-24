import type { Route } from 'next';
import Link from 'next/link';
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

/**
 * The page header.
 *
 * Four parts in a fixed order — breadcrumb, title, description, actions — so a
 * user landing on any route reads where they are, what the page is for and what
 * they can do here in the same three places every time.
 *
 * It stays deliberately short. These are data screens; every row of pixels the
 * header takes is a row of the table the user actually came for. That budget is
 * why the description is one sentence and why the "not advice" line lives in
 * `PageDisclaimer` at the foot of the page rather than being restated up here.
 */
export function PageHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      data-slot="page-header"
      className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pb-3', className)}
      {...props}
    />
  );
}

/**
 * The text column. `min-w-0` is load-bearing: without it a long watchlist name
 * pushes the actions off the right edge instead of truncating.
 */
export function PageHeading({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-heading"
      className={cn('flex min-w-0 flex-1 flex-col gap-1', className)}
      {...props}
    />
  );
}

/**
 * Header actions, primary rightmost.
 *
 * `shrink-0` and the wrap on the header mean these drop to their own line on a
 * narrow screen rather than squeezing the title.
 */
export function PageActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-actions"
      className={cn('flex shrink-0 flex-wrap items-center gap-2', className)}
      {...props}
    />
  );
}

export interface Crumb {
  readonly label: string;
  readonly href: Route;
}

/**
 * Ancestors of the current page, and only the ancestors.
 *
 * The current page is the `<h1>` directly below, so repeating it here would
 * spend a line saying what the next line already says. Rendered only where a
 * route actually sits under another one.
 */
export function PageBreadcrumb({
  trail,
  className,
}: {
  trail: readonly Crumb[];
  className?: string | undefined;
}) {
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" data-slot="page-breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-muted-foreground text-xs">
        {trail.map((crumb, index) => (
          <li key={crumb.href} className="flex min-w-0 items-center gap-1">
            {index > 0 && (
              <span aria-hidden className="text-subtle-foreground">
                /
              </span>
            )}
            <Link
              href={crumb.href}
              className="truncate underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {crumb.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageTitle({ className, ...props }: React.ComponentProps<'h1'>) {
  return <Text as="h1" variant="page-title" className={cn('truncate', className)} {...props} />;
}

export function PageDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <Text
      as="p"
      variant="secondary"
      className={cn('max-w-2xl text-balance', className)}
      {...props}
    />
  );
}

/**
 * The standing disclaimer, at the foot of every page.
 *
 * One sentence, one place. It used to be a clause tacked onto four different
 * header descriptions, which both cost a wrapped line at the top of the densest
 * screens and left the dashboard, stocks and watchlists pages with no footer
 * statement at all. Pages with something more specific to say pass it as
 * children, appended to the standing line.
 */
export const DISCLAIMER =
  'Technical-analysis decision support, not investment advice. Orders, if any, are placed elsewhere.';

export function PageDisclaimer({
  children,
  className,
}: {
  children?: React.ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <p data-slot="page-disclaimer" className={cn('text-subtle-foreground text-xs', className)}>
      {DISCLAIMER}
      {children === undefined ? null : <> {children}</>}
    </p>
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
