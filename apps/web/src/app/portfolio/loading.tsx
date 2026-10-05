import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';

const TILES = ['value', 'today', 'gain', 'paid'] as const;
const ROWS = ['one', 'two', 'three', 'four'] as const;

export default function PortfolioLoading() {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>My portfolio</PageTitle>
          </PageHeading>
        </PageHeader>
        <PageContent>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {TILES.map((tile) => (
              <Skeleton key={tile} className="h-28 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-10 rounded-md" />
          <div className="space-y-2">
            {ROWS.map((row) => (
              <Skeleton key={row} className="h-14 rounded-lg" />
            ))}
          </div>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
