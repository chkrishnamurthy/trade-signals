import { IntradaySkeleton } from '@/components/intraday/intraday-skeleton';
import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageHeader, PageHeading, PageTitle } from '@/components/layout/page';
export default function Loading() {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Intraday Strategies</PageTitle>
          </PageHeading>
        </PageHeader>
        <IntradaySkeleton />
      </PageContainer>
    </AppShell>
  );
}
