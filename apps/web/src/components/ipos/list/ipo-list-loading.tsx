import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';

const TILES = ['a', 'b', 'c', 'd'] as const;
const PILLS = ['a', 'b', 'c', 'd', 'e'] as const;
const ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

/** The board list while it loads: the header, the summary tiles, the filters and table rows. */
export function IpoListLoading() {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>IPOs</PageTitle>
          </PageHeading>
        </PageHeader>
        <PageContent>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            {TILES.map((t) => (
              <Skeleton key={t} className="h-[6.5rem] rounded-lg" />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PILLS.map((p) => (
              <Skeleton key={p} className="h-9 w-20 rounded-full" />
            ))}
          </div>
          <div className="flex flex-col gap-px overflow-hidden rounded-lg border border-border">
            {ROWS.map((r) => (
              <Skeleton key={r} className="h-14 w-full rounded-none" />
            ))}
          </div>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
