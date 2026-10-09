import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageHeader, PageHeading, PageTitle } from '@/components/layout/page';
import { PaperSkeleton } from '@/components/paper/paper-skeleton';
export default function Loading() {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Paper Trading</PageTitle>
          </PageHeading>
        </PageHeader>
        <PaperSkeleton />
      </PageContainer>
    </AppShell>
  );
}
