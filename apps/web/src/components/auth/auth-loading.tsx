import { LoadingRegion, SkeletonText } from '@/components/data-display/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthCard } from './auth-card';

export function AuthLoading({ title, fields = 2 }: { title: string; fields?: number }) {
  return (
    <AuthCard title={title}>
      <LoadingRegion label={`Loading ${title.toLowerCase()}`}>
        <div className="space-y-5">
          {Array.from({ length: fields }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative slots
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-full" />
          <SkeletonText lines={2} />
        </div>
      </LoadingRegion>
    </AuthCard>
  );
}
