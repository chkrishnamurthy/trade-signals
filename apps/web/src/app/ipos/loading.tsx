import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';

const TILES = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const MODULES = ['a', 'b', 'c', 'd'] as const;

export default function IposLoading() {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>IPO dashboard</PageTitle>
          </PageHeading>
        </PageHeader>
        <PageContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
            {TILES.map((t) => (
              <Skeleton key={t} className="h-[5.25rem] w-full rounded-lg" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {MODULES.map((m) => (
              <Skeleton key={m} className="h-80 w-full rounded-lg" />
            ))}
          </div>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
