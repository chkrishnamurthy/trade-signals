'use client';

import { ExternalLinkIcon, StarIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { EmptyState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageDescription,
  PageDisclaimer,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import type { AnnouncementDto, AnnouncementsPageDto } from '@/lib/disclosure-types';
import { CategoryChips, FreshnessBanner, formatDateTimeIst, ScopeToggle } from './parts';

/**
 * Corporate Announcements page (`/announcements`).
 *
 * A chronological feed of official exchange filings, filterable to the names the
 * user follows and by category. Data is server-rendered; controls only flip URL
 * query params and let the server re-render — no client data fetching.
 */
export function AnnouncementsView({
  data,
  activeCategories,
}: {
  data: AnnouncementsPageDto;
  activeCategories: readonly string[];
}) {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Announcements</PageTitle>
            <PageDescription>
              Official corporate filings published by the exchanges.
            </PageDescription>
          </PageHeading>
          <ScopeToggle watchlistOnly={data.watchlistOnly} hasWatchlists={data.hasWatchlists} />
        </PageHeader>

        <PageContent>
          <FreshnessBanner
            status={data.status}
            latestLabel={data.latestAt === null ? null : formatDateTimeIst(data.latestAt)}
          />

          <CategoryChips categories={data.categories} active={activeCategories} />

          {data.rows.length === 0 ? (
            <EmptyState
              title={
                data.watchlistOnly ? 'No filings for your watchlist' : 'No announcements found'
              }
              description="Try clearing filters, or check back after the next ingestion pass."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {data.rows.map((row) => (
                <AnnouncementCard key={row.id} row={row} />
              ))}
            </ul>
          )}

          <Pagination total={data.total} page={data.page} pageSize={data.pageSize} />

          <PageDisclaimer>{data.disclaimer}</PageDisclaimer>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}

function AnnouncementCard({ row }: { row: AnnouncementDto }) {
  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-2 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs font-medium text-foreground">{row.symbol}</span>
            <Text as="span" variant="caption" className="min-w-0 truncate">
              {row.companyName}
            </Text>
            {row.onWatchlist && (
              <StarIcon
                aria-label="On your watchlist"
                className="size-3.5 fill-warning text-warning"
              />
            )}
            {row.category !== null && (
              <Badge variant="secondary" size="sm" className="ml-auto font-normal">
                {row.category}
              </Badge>
            )}
          </div>

          <Text as="h2" variant="label" className="text-pretty">
            {row.headline}
          </Text>

          {row.detail !== null && row.detail !== row.headline && (
            <Text as="p" variant="caption" className="line-clamp-3">
              {row.detail}
            </Text>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <time className="text-subtle-foreground text-2xs" dateTime={row.announcedAt}>
              {formatDateTimeIst(row.announcedAt)} IST
            </time>
            {row.attachmentUrl !== null && (
              <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
                <a href={row.attachmentUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon aria-hidden />
                  View filing
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function Pagination({ total, page, pageSize }: { total: number; page: number; pageSize: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const goTo = useCallback(
    (next: number) => {
      const search = new URLSearchParams(params.toString());
      if (next <= 1) search.delete('page');
      else search.set('page', String(next));
      router.push(`${pathname}?${search.toString()}`);
    },
    [params, pathname, router],
  );

  if (lastPage <= 1) return null;

  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Pagination">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
        Previous
      </Button>
      <Text variant="caption">
        Page {page} of {lastPage}
      </Text>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= lastPage}
        onClick={() => goTo(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
