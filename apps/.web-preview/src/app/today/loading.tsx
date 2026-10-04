import { CardSkeleton } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';

const STAT_SLOTS = ['index', 'adv', 'dec', 'unch', 'ma20', 'ma50', 'newbull', 'newbear'] as const;

/** The suspense fallback while the server assembles the brief. */
export default function TodayLoading() {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Daily Market Brief</PageTitle>
            <PageDescription>
              Technical summary of the latest completed NSE session.
            </PageDescription>
          </PageHeading>
        </PageHeader>
        <PageContent>
          <Skeleton className="h-6 w-80" />
          <CardSkeleton />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {STAT_SLOTS.map((slot) => (
              <Skeleton key={slot} className="h-20 w-full rounded-md" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
