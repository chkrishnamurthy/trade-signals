import { ArrowLeftIcon, CompassIcon, ListIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Page Not Found (404) — EquityWise',
  description: 'The requested page or stock could not be found on EquityWise.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mx-auto max-w-md space-y-6">
        <div className="inline-flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CompassIcon className="size-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            404 — Page Not Found
          </h1>
          <p className="text-sm text-muted-foreground">
            The page you are looking for does not exist or may have been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button asChild variant="default">
            <Link href="/" className="gap-2">
              <ArrowLeftIcon className="size-4" />
              Return Home
            </Link>
          </Button>

          <Button asChild variant="outline">
            <Link href="/watchlists" className="gap-2">
              <ListIcon className="size-4" />
              My Watchlists
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
