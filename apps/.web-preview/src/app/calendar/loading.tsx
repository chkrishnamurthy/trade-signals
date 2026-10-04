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

const CARDS = ['today', 'results', 'actions', 'watchlist'] as const;
const ROWS = ['one', 'two', 'three'] as const;

export default function MarketCalendarLoading() {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Market Calendar</PageTitle>
            <PageDescription>
              Track results, corporate actions, holidays, and events that may affect your watchlist.
            </PageDescription>
          </PageHeading>
        </PageHeader>
        <PageContent>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CARDS.map((card) => (
              <Skeleton key={card} className="h-24 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-10 rounded-md" />
          <div className="space-y-6">
            {ROWS.map((row) => (
              <div key={row} className="grid gap-2.5 lg:grid-cols-[6rem_minmax(0,1fr)] lg:gap-4">
                <div className="flex gap-2 lg:block">
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-7 w-12 lg:mt-2" />
                </div>
                <Skeleton className="h-32 rounded-lg" />
              </div>
            ))}
          </div>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
