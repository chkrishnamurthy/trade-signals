import { LoadingRegion } from '@/components/data-display/loading';
import { IpoOverviewSkeleton } from '@/components/ipos/ipo-loading-patterns';
import { IpoSectionHeader } from '@/components/ipos/ipo-section-header';
import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent } from '@/components/layout/page';
export default function IposLoading() {
  return (
    <AppShell>
      <PageContainer>
        <IpoSectionHeader section="overview" scope="all" />
        <PageContent className="pt-5">
          <LoadingRegion label="Loading IPO overview">
            <IpoOverviewSkeleton />
          </LoadingRegion>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
