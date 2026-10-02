import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent, PageHeader, PageHeading } from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';

const TILES = ['a', 'b', 'c', 'd'] as const;

export default function IpoDetailLoading() {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-7 w-72 max-w-full" />
            <Skeleton className="h-4 w-48" />
          </PageHeading>
        </PageHeader>
        <PageContent>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {TILES.map((t) => (
              <Skeleton key={t} className="h-14 w-full rounded-md" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Skeleton className="h-72 w-full rounded-lg" />
              <Skeleton className="h-56 w-full rounded-lg" />
            </div>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-64 w-full rounded-lg" />
              <Skeleton className="h-48 w-full rounded-lg" />
            </div>
          </div>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
