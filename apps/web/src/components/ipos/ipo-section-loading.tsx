import { LoadingRegion } from '@/components/data-display/loading';
import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent } from '@/components/layout/page';
import type { IpoSectionId } from '@/lib/ipo-routes';
import { IpoSectionSkeleton } from './ipo-loading-patterns';
import { IpoSectionHeader } from './ipo-section-header';
export function IpoSectionLoading({ section }: { section: IpoSectionId }) {
  return (
    <AppShell>
      <PageContainer>
        <IpoSectionHeader section={section} scope="all" />
        <PageContent className="pt-5">
          <LoadingRegion label={`Loading IPO ${section}`}>
            <IpoSectionSkeleton section={section} />
          </LoadingRegion>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
