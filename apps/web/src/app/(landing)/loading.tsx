import {
  LoadingRegion,
  SkeletonMetrics,
  SkeletonPanel,
  SkeletonText,
} from '@/components/data-display/loading';
import { PublicFrame } from '@/components/layout/public-page';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <PublicFrame>
      <LoadingRegion label="Loading EquityWise">
        <section className="border-border border-b bg-surface">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,0.9fr)] lg:px-8">
            <div className="space-y-6">
              <Skeleton className="h-6 w-44 rounded-full" />
              <div className="space-y-3">
                <Skeleton className="h-10 w-full max-w-xl sm:h-12" />
                <Skeleton className="h-10 w-4/5 max-w-lg sm:h-12" />
              </div>
              <SkeletonText lines={3} />
              <div className="flex flex-wrap gap-3">
                <Skeleton className="h-11 w-40" />
                <Skeleton className="h-11 w-32" />
              </div>
            </div>
            <SkeletonPanel className="space-y-5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <SkeletonMetrics count={3} className="grid-cols-3 lg:grid-cols-3" />
              <Skeleton className="h-36 w-full" />
            </SkeletonPanel>
          </div>
        </section>

        <section className="mx-auto max-w-6xl space-y-10 px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl space-y-3 text-center">
            <Skeleton className="mx-auto h-7 w-64 max-w-full" />
            <SkeletonText lines={2} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <SkeletonPanel key={item} className="space-y-4">
                <Skeleton className="size-10 rounded-lg" />
                <Skeleton className="h-5 w-2/3" />
                <SkeletonText lines={3} />
              </SkeletonPanel>
            ))}
          </div>
        </section>
      </LoadingRegion>
    </PublicFrame>
  );
}
