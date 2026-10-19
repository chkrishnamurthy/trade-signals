import {
  SkeletonChart,
  SkeletonList,
  SkeletonMetrics,
  SkeletonPanel,
  SkeletonResults,
  SkeletonTable,
  SkeletonText,
  SkeletonToolbar,
} from '@/components/data-display/loading';
import { Skeleton } from '@/components/ui/skeleton';
import type { IpoSectionId } from '@/lib/ipo-routes';

export function IpoOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonMetrics count={5} className="gap-2 sm:grid-cols-3 lg:grid-cols-5" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <SkeletonPanel key={i} className="space-y-5">
              <div className="flex gap-3">
                <Skeleton className="size-12" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
              <SkeletonText />
              <SkeletonList rows={3} compact />
            </SkeletonPanel>
          ))}
        </div>
        <SkeletonPanel>
          <Skeleton className="h-4 w-32" />
          <SkeletonList rows={5} compact />
        </SkeletonPanel>
      </div>
      <SkeletonTable columns={6} rows={6} />
    </div>
  );
}
export function IpoListSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonMetrics className="xl:grid-cols-4" />
      <SkeletonToolbar />
      <SkeletonResults columns={7} breakpoint="lg" />
    </div>
  );
}
export function IpoSectionSkeleton({ section }: { section: IpoSectionId }) {
  return (
    <div className="space-y-5">
      <SkeletonMetrics count={section === 'pipeline' ? 3 : 4} />
      <SkeletonToolbar />
      {section === 'calendar' ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <SkeletonPanel key={i}>
              <Skeleton className="h-4 w-24" />
              <SkeletonList rows={2} />
            </SkeletonPanel>
          ))}
        </div>
      ) : (
        <SkeletonTable columns={section === 'gmp' ? 7 : 6} />
      )}
    </div>
  );
}
export function IpoDetailSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonMetrics />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SkeletonPanel className="space-y-5">
            <Skeleton className="h-5 w-40" />
            <SkeletonText lines={4} />
            <SkeletonMetrics />
          </SkeletonPanel>
          <SkeletonTable rows={4} columns={4} />
          <SkeletonChart className="h-64" />
        </div>
        <div className="space-y-4">
          <SkeletonPanel>
            <Skeleton className="h-4 w-32" />
            <SkeletonList rows={5} compact />
          </SkeletonPanel>
          <SkeletonPanel className="space-y-4">
            <Skeleton className="h-4 w-28" />
            <SkeletonText />
          </SkeletonPanel>
        </div>
      </div>
    </div>
  );
}
