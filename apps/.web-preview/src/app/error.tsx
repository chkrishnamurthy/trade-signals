'use client';

import { AlertTriangleIcon, ArrowLeftIcon, RotateCcwIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected errors for audit trail
    console.error('[AppError]', error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mx-auto max-w-md space-y-6">
        <div className="inline-flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangleIcon className="size-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            We encountered an unexpected error processing this request. Our systems have logged this
            event.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button onClick={() => reset()} variant="default" className="gap-2">
            <RotateCcwIcon className="size-4" />
            Try again
          </Button>

          <Button asChild variant="outline">
            <Link href="/" className="gap-2">
              <ArrowLeftIcon className="size-4" />
              Return Home
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
