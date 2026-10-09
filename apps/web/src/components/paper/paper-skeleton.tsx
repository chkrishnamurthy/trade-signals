import {
  LoadingRegion,
  SkeletonForm,
  SkeletonMetrics,
  SkeletonTable,
} from '@/components/data-display/loading';

export function PaperSkeleton() {
  return (
    <LoadingRegion label="Loading paper trading">
      <div className="space-y-4">
        <SkeletonForm fields={2} />
        <SkeletonMetrics />
        <SkeletonTable columns={7} rows={5} />
      </div>
    </LoadingRegion>
  );
}
