import type { Route } from 'next';
import type * as React from 'react';
import { Suspense } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent } from '@/components/layout/page';
import { IPO_SCOPES, type IpoScope, type IpoSectionId } from '@/lib/ipo-routes';
import type { IpoFeedStatusDto } from '@/lib/ipo-types';
import { IpoFeeds } from './ipo-feeds';
import { RememberIpoReturn } from './ipo-return';
import { IpoSectionHeader } from './ipo-section-header';

/**
 * The frame of every IPO section tab: the shared header with this tab active,
 * the feed alert, and the page's own content. It remembers the page as the way
 * back from an issue.
 */
export function IpoSectionPage({
  section,
  scope,
  scopeHref,
  description,
  asOf,
  feeds,
  rememberLabel,
  children,
}: {
  section: IpoSectionId;
  scope: IpoScope;
  /** This page's address for a scope, its own filters kept. */
  scopeHref: (scope: IpoScope) => Route;
  description: React.ReactNode;
  asOf?: string | null | undefined;
  feeds: readonly IpoFeedStatusDto[];
  rememberLabel: string;
  children: React.ReactNode;
}) {
  const scopeHrefs = Object.fromEntries(IPO_SCOPES.map((s) => [s, scopeHref(s)])) as Record<
    IpoScope,
    Route
  >;
  return (
    <AppShell>
      <Suspense fallback={null}>
        <RememberIpoReturn label={rememberLabel} />
      </Suspense>
      <PageContainer>
        <IpoSectionHeader
          section={section}
          scope={scope}
          scopeHrefs={scopeHrefs}
          asOf={asOf}
          description={description}
        />
        <PageContent className="gap-5 pt-5">
          <IpoFeeds feeds={feeds} showAsOf={false} />
          {children}
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
