import { LoadingRegion } from '@/components/data-display/loading';
import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent } from '@/components/layout/page';
import { IpoListSkeleton } from '../ipo-loading-patterns';
import { IpoSectionHeader } from '../ipo-section-header';
export function IpoListLoading() {
  return (
    <AppShell>
      <PageContainer>
        <IpoSectionHeader section="all" scope="all" />
        <PageContent className="pt-5">
          <LoadingRegion label="Loading IPO list">
            <IpoListSkeleton />
          </LoadingRegion>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
