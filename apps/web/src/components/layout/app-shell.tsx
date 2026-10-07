'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import type * as React from 'react';
import { useCallback } from 'react';
import { IndexStripView } from '@/components/market/index-strip';
import { TooltipProvider } from '@/components/ui/tooltip';
import { stockHref } from '@/lib/screener-format';
import { useIndexStrip } from '@/lib/use-index-strip';
import { useSession } from '@/lib/use-session';
import { cn } from '@/lib/utils';
import { AppFooter } from './app-footer';
import { MobileNav } from './mobile-nav';
import { Navbar } from './navbar';

/**
 * The application frame for every signed-in route
 * (`docs/planning/navigation-redesign-plan.md`).
 *
 *   skip link
 *   Navbar          sticky, 56px — brand, destinations (≥ lg), search, status, account
 *   indices strip   sticky, 36px — rendered once, here (docs/reference/market-indices-strip.md)
 *   main            the page; its own header scrolls away with it
 *   AppFooter       not-advice line + help & legal links
 *   MobileNav       fixed bottom tab bar + "More" drawer (< lg)
 *
 * It owns the single `useIndexStrip()` subscription and hands the snapshot to
 * both the strip and the bar's market-status pill, so they cannot disagree.
 * It owns the session too, for the admin-only "Lab" menu.
 */
export function AppShell({
  children,
  onSearchSelect,
  className,
}: {
  children: React.ReactNode;
  /**
   * Where a header search hit goes. Defaults to the stock page — the same
   * place on every route. A page that can show the stock in place passes a
   * handler so searching does not bounce the user off the screen they are on.
   */
  onSearchSelect?: ((symbol: string) => void) | undefined;
  className?: string | undefined;
}) {
  const router = useRouter();
  const strip = useIndexStrip();
  const session = useSession();
  const isAdmin = session.status === 'signed-in' && session.user.role === 'admin';

  const handleSearchSelect = useCallback(
    (symbol: string) => {
      if (onSearchSelect !== undefined) {
        onSearchSelect(symbol);
        return;
      }
      router.push(stockHref(symbol) as Route);
    },
    [onSearchSelect, router],
  );

  return (
    <TooltipProvider>
      <div className={cn('flex min-h-dvh flex-col bg-background', className)}>
        <a
          href="#main-content"
          className="sr-only rounded-md bg-foreground font-medium text-background text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:outline-2 focus:outline-ring focus:outline-solid focus:outline-offset-2"
        >
          Skip to content
        </a>

        <Navbar onSearchSelect={handleSearchSelect} strip={strip} isAdmin={isAdmin} />
        <IndexStripView state={strip.state} liveState={strip.liveState} />

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </main>

        {/* Clears the fixed tab bar below lg so it never covers the footer. */}
        <AppFooter className="pb-(--bottom-chrome)" />
        <MobileNav isAdmin={isAdmin} />
      </div>
    </TooltipProvider>
  );
}
