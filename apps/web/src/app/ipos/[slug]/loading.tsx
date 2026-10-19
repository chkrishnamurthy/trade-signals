import { LoadingRegion } from '@/components/data-display/loading';
import { IpoDetailSkeleton } from '@/components/ipos/ipo-loading-patterns';
import { IpoSectionHeader } from '@/components/ipos/ipo-section-header';
import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent, PageHeading } from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';
export default function IpoDetailLoading() {
  return (
    <AppShell>
      <PageContainer>
        <IpoSectionHeader section={null} scope="all">
          <PageHeading>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-7 w-72 max-w-full" />
            <Skeleton className="h-4 w-48" />
          </PageHeading>
        </IpoSectionHeader>
        <PageContent className="pt-5">
          <LoadingRegion label="Loading IPO details">
            <IpoDetailSkeleton />
          </LoadingRegion>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
