import { IpoSectionHeader } from '@/components/ipos/ipo-section-header';
import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent } from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';

const STAGES = ['a', 'b', 'c', 'd', 'e'] as const;
const CARDS = ['a', 'b'] as const;

/** The Overview while it loads: the section's header and tabs at once, then its shape. */
export default function IposLoading() {
  return (
    <AppShell>
      <PageContainer>
        <IpoSectionHeader section="overview" scope="all" />
        <PageContent className="gap-6 pt-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {STAGES.map((s) => (
              <Skeleton key={s} className="h-28 w-full rounded-lg" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid gap-3 sm:grid-cols-2">
              {CARDS.map((c) => (
                <Skeleton key={c} className="h-80 w-full rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-80 w-full rounded-lg" />
          </div>
          <Skeleton className="h-96 w-full rounded-lg" />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
