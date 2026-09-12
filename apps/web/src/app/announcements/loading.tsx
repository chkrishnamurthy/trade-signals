import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';

const ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export default function AnnouncementsLoading() {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Announcements</PageTitle>
          </PageHeading>
        </PageHeader>
        <PageContent>
          {ROWS.map((row) => (
            <Skeleton key={row} className="h-24 w-full rounded-lg" />
          ))}
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
