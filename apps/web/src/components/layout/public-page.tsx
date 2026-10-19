import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { JsonLd } from '@/components/seo/json-ld';
import { generateBreadcrumbSchema } from '@/lib/seo/schema';
import { cn } from '@/lib/utils';

/**
 * The frame every public page shares: header, one `main` the skip link lands
 * on, footer. Width (`max-w-6xl`) matches the header and the landing page, so
 * the edges line up from page to page.
 */
export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <PublicHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

/**
 * A public reading page — About, Methodology, Data sources, the legal pages.
 *
 * One `h1`, a breadcrumb (also emitted as BreadcrumbList structured data), an
 * optional "last updated" line, and a readable measure for the body. Body
 * sections use `<PublicSection>` so headings and spacing stay uniform.
 */
export function PublicArticle({
  path,
  crumb,
  title,
  intro,
  updated,
  children,
}: {
  /** The page's own path, for the breadcrumb schema. */
  path: string;
  /** Short name in the breadcrumb. */
  crumb: string;
  title: string;
  intro?: React.ReactNode;
  /** "October 2026" — shown on legal pages. */
  updated?: string;
  children: React.ReactNode;
}) {
  const schema = generateBreadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: crumb, path },
  ]);
  return (
    <PublicFrame>
      <JsonLd schema={schema} />
      <div className="border-border border-b bg-surface">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-10 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb">
            <ol className="m-0 flex list-none items-center gap-1.5 p-0 text-muted-foreground text-xs">
              <li>
                <Link
                  href="/"
                  className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
                >
                  Home
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRightIcon className="size-3.5" />
              </li>
              <li aria-current="page" className="font-medium text-foreground">
                {crumb}
              </li>
            </ol>
          </nav>
          <h1 className="m-0 mt-6 max-w-3xl text-balance font-bold font-display text-3xl tracking-tight sm:text-4xl">
            {title}
          </h1>
          {intro !== undefined && (
            <p className="m-0 mt-3 max-w-2xl text-pretty text-lg text-muted-foreground leading-relaxed">
              {intro}
            </p>
          )}
          {updated !== undefined && (
            <p className="m-0 mt-3 text-muted-foreground text-sm">Last updated: {updated}</p>
          )}
        </div>
      </div>
      <article className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 text-[0.95rem] text-muted-foreground leading-relaxed sm:px-6 lg:px-8">
        {children}
      </article>
    </PublicFrame>
  );
}

/** One headed section of a public article. */
export function PublicSection({
  title,
  id,
  children,
  className,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId =
    id ??
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return (
    <section
      aria-labelledby={headingId}
      className={cn('flex scroll-mt-20 flex-col gap-3', className)}
    >
      <h2 id={headingId} className="m-0 font-bold text-foreground text-xl tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A plain bulleted list in article style. */
export function PublicList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="m-0 flex list-disc flex-col gap-2 pl-5 marker:text-border-strong">{children}</ul>
  );
}
