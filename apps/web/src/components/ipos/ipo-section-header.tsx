import type { Route } from 'next';
import Link from 'next/link';
import type * as React from 'react';
import {
  PageActions,
  PageBreadcrumb,
  PageDescription,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { istDayTime } from '@/lib/ipo-format';
import { IPO_SECTIONS, type IpoScope, type IpoSectionId, ipoHref } from '@/lib/ipo-routes';
import { cn } from '@/lib/utils';
import { ActiveTabIntoView } from './active-tab-into-view';
import { ScopeSwitch } from './scope-switch';

/**
 * The header every IPO page shares (plan §10.0): the section's name, the board
 * scope, and a tab per section. The tab row is the answer to "what else is
 * here?" and the active tab to "where am I?", on every page of the section —
 * the Overview, the master table and each issue alike. Tabs keep the board
 * scope; the scope switch keeps the page's own filters.
 */
export function IpoSectionHeader({
  section,
  scope,
  scopeHrefs,
  description,
  asOf,
  counts = {},
  trail,
  children,
}: {
  /** The active tab; null on an issue page, which belongs to no one tab. */
  section: IpoSectionId | null;
  scope: IpoScope;
  /** Where each scope leads from this page; omitted on an issue page. */
  scopeHrefs?: Readonly<Record<IpoScope, Route>> | undefined;
  description?: React.ReactNode;
  /** When the exchange data was last read (ISO); null before the first read. */
  asOf?: string | null | undefined;
  /** A figure beside a tab's name: the master table's issue count. */
  counts?: Partial<Record<IpoSectionId, number>>;
  /** Crumbs above the title; the section's own pages pass none. */
  trail?: readonly { href: Route; label: string }[] | undefined;
  /** Replaces the title block: the issue page puts its own heading here. */
  children?: React.ReactNode;
}) {
  const tabs = (
    <nav
      id="ipo-section-tabs"
      aria-label="IPO sections"
      className="-mx-4 flex gap-1 overflow-x-auto border-border border-b px-4 sm:mx-0 sm:px-0"
    >
      {IPO_SECTIONS.map((s) => {
        const on = s.id === section;
        const count = counts[s.id];
        return (
          <Link
            key={s.id}
            href={ipoHref(s.path, scope)}
            aria-current={on ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors',
              on
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {s.label}
            {count !== undefined && (
              <span className="figure rounded-full bg-muted px-1.5 text-2xs text-muted-foreground">
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <header className="flex flex-col gap-3">
      {/* An issue page puts the tabs first: the section, then the issue inside it. */}
      {children !== undefined && tabs}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        {children ?? (
          <PageHeading>
            {trail !== undefined && <PageBreadcrumb trail={trail} />}
            <PageTitle>IPOs</PageTitle>
            {description !== undefined && (
              // On a phone the tab says where you are; the sentence would push the content down.
              <PageDescription className="hidden sm:block">{description}</PageDescription>
            )}
          </PageHeading>
        )}
        {scopeHrefs !== undefined && (
          <PageActions className="w-full flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
            <ScopeSwitch active={scope} hrefs={scopeHrefs} />
            {asOf !== undefined && (
              <span className="text-2xs text-muted-foreground">
                {asOf === null
                  ? 'Exchange data not collected yet'
                  : `Exchange data as of ${istDayTime(asOf)} IST`}
              </span>
            )}
          </PageActions>
        )}
      </div>
      {children === undefined && tabs}
      <ActiveTabIntoView navId="ipo-section-tabs" />
    </header>
  );
}
