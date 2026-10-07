import { CompassIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { Button } from '@/components/ui/button';
import { HOME_HREF } from '@/lib/navigation';
import { getSessionUser } from '@/server/auth/require-user';

export const metadata: Metadata = {
  title: 'Page Not Found (404) — EquityWise',
  description: 'The requested page or stock could not be found on EquityWise.',
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * 404 — inside the app frame for a signed-in user (a mistyped stock or a
 * removed watchlist should not cost them their navigation), inside the public
 * frame for everyone else. A failing session check falls back to the public
 * frame rather than turning a 404 into a 500.
 */
export default async function NotFound() {
  const signedIn = await getSessionUser()
    .then((user) => user !== null)
    .catch(() => false);

  const body = (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mx-auto max-w-md space-y-6">
        <div className="inline-flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CompassIcon className="size-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="font-semibold text-3xl text-foreground tracking-tight sm:text-4xl">
            Page not found
          </h1>
          <p className="text-muted-foreground text-sm">
            The page or stock you are looking for does not exist, or it has moved.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
          <Button asChild variant="default">
            <Link href={signedIn ? HOME_HREF : '/'}>
              {signedIn ? 'Go to Market brief' : 'Go to the home page'}
            </Link>
          </Button>
          {signedIn && (
            <Button asChild variant="outline">
              <Link href="/watchlists">Open Watchlists</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (signedIn) return <AppShell>{body}</AppShell>;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <PublicHeader signedIn={false} />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {body}
      </main>
      <PublicFooter />
    </div>
  );
}
