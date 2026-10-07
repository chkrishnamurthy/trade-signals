'use client';

import { AlertTriangleIcon, RotateCcwIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Brand } from '@/components/layout/brand';
import { Button } from '@/components/ui/button';
import { HOME_HREF } from '@/lib/navigation';
import { useSession } from '@/lib/use-session';

/**
 * The last-resort error page for a route without its own `error.tsx`.
 *
 * Deliberately NOT wrapped in AppShell: if the failure came from the app frame
 * itself, rendering it again here would fail again. A plain header with the
 * mark, a retry, and a way home that matches the visitor — the Market brief
 * when signed in, the home page otherwise.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const session = useSession();
  const signedIn = session.status === 'signed-in';

  useEffect(() => {
    // Log unexpected errors for audit trail
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 items-center border-border border-b bg-surface px-4 sm:px-6">
        <Brand href={signedIn ? HOME_HREF : '/'} />
      </header>
      <main
        id="main-content"
        className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center"
      >
        <div className="mx-auto max-w-md space-y-6">
          <div className="inline-flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangleIcon className="size-7" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h1 className="font-semibold text-2xl text-foreground tracking-tight sm:text-3xl">
              Something went wrong
            </h1>
            <p className="text-muted-foreground text-sm">
              This page could not be loaded. The error has been logged. Try again, or go back to
              where you started.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
            <Button onClick={() => reset()} variant="default" className="gap-2">
              <RotateCcwIcon className="size-4" />
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link href={signedIn ? HOME_HREF : '/'}>
                {signedIn ? 'Go to Market brief' : 'Go to the home page'}
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
