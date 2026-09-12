import { ArrowLeftIcon, CompassIcon, SearchIcon, SlidersHorizontalIcon } from 'lucide-react';
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
            The page, stock symbol, or analysis you are looking for does not exist or may have been
            moved.
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
            <Link href="/stocks" className="gap-2">
              <SearchIcon className="size-4" />
              Explore Stocks
            </Link>
          </Button>

          <Button asChild variant="ghost">
            <Link href="/screener" className="gap-2">
              <SlidersHorizontalIcon className="size-4" />
              Stock Screener
            </Link>
          </Button>
        </div>

        <div className="border-t border-border pt-6 text-xs text-muted-foreground">
          <p>
            Looking for a specific stock? Check our{' '}
            <Link href="/stocks" className="text-foreground underline underline-offset-4">
              NSE Stock Directory
            </Link>{' '}
            or explore{' '}
            <Link href="/sectors" className="text-foreground underline underline-offset-4">
              Market Sectors
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
