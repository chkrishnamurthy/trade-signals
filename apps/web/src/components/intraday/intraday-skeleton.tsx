import {
  LoadingRegion,
  SkeletonMetrics,
  SkeletonPanel,
  SkeletonTable,
  SkeletonText,
} from '@/components/data-display/loading';
import { Skeleton } from '@/components/ui/skeleton';

export function IntradaySkeleton() {
  return (
    <LoadingRegion label="Loading intraday strategies">
      <div className="space-y-4">
        <SkeletonPanel className="space-y-4">
          <Skeleton className="h-4 w-40" />
          <SkeletonText lines={2} />
        </SkeletonPanel>
        <SkeletonPanel className="space-y-4">
          <Skeleton className="h-5 w-56 max-w-full" />
          <SkeletonMetrics count={3} className="lg:grid-cols-3" />
        </SkeletonPanel>
        <SkeletonTable columns={7} rows={5} />
        <SkeletonPanel className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <SkeletonText lines={4} />
        </SkeletonPanel>
      </div>
    </LoadingRegion>
  );
}
