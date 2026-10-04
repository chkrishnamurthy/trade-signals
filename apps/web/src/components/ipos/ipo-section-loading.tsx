import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent } from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';
import type { IpoSectionId } from '@/lib/ipo-routes';
import { IpoSectionHeader } from './ipo-section-header';

const BLOCKS = ['a', 'b', 'c'] as const;

/** A section tab while it loads: the header and tabs at once, then the page's shape. */
export function IpoSectionLoading({ section }: { section: IpoSectionId }) {
  return (
    <AppShell>
      <PageContainer>
        <IpoSectionHeader section={section} scope="all" />
        <PageContent className="gap-5 pt-5">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {BLOCKS.map((b) => (
              <Skeleton key={b} className="h-24 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-lg" />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
