import { CardSkeleton } from '@/components/data-display/loading';
export default function Loading() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <CardSkeleton className="min-h-48" />
      </div>
    </main>
  );
}
