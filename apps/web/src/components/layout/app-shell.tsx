'use client';

import { MenuIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type * as React from 'react';
import { useCallback, useState } from 'react';
import { UserMenu } from '@/components/auth/user-menu';
import { StockSearch } from '@/components/market/stock-search';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NAVIGATION, type ReadyNavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { Brand } from './brand';

/**
 * The application frame.
 *
 * A single horizontal command bar sits on top of every signed-in route, with a
 * main region beneath it. This replaced the collapsing icon rail: the product
 * is a place people come to read the market, not an operator's console, so the
 * chrome reads like a consumer app — a wordmark, a row of named destinations, a
 * search box and the account — rather than a dashboard sidebar.
 *
 * Every route renders inside this, so a new page inherits navigation, session
 * state and theming without wiring anything. On `lg` and up the destinations
 * live in the bar; below that they move into a Sheet, which brings a focus trap
 * and Escape-to-close for free.
 */
export function AppShell({
  children,
  onSearchSelect,
  className,
}: {
  children: React.ReactNode;
  /**
   * Where a header search hit goes. Defaults to the watchlists page; a page
   * with its own detail surface passes a handler so searching does not bounce
   * the user off the screen they are on.
   */
  onSearchSelect?: ((symbol: string) => void) | undefined;
  className?: string | undefined;
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSearchSelect = useCallback(
    (symbol: string) => {
      if (onSearchSelect !== undefined) {
        onSearchSelect(symbol);
        return;
      }
      router.push(`/watchlists?symbol=${encodeURIComponent(symbol)}`);
    },
    [onSearchSelect, router],
  );

  return (
    <TooltipProvider>
      <div className={cn('flex min-h-dvh flex-col bg-background', className)}>
        <header className="sticky top-0 z-40 border-border border-b bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
          <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-2 px-4 sm:gap-4 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDrawerOpen(true)}
              className="shrink-0 lg:hidden"
              aria-label="Open navigation"
            >
              <MenuIcon />
            </Button>

            <Brand href="/today" className="shrink-0" />

            {/* Primary destinations. A single row of names — the whole point of
                the redesign — so the app announces where you can go instead of
                hiding it behind icons. */}
            <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
              {PRIMARY_NAV.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
              <div className="w-36 sm:w-52 lg:w-64">
                <StockSearch onSelect={handleSearchSelect} />
              </div>
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>

        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="h-14 items-start justify-center border-border border-b px-4 py-0">
              <SheetTitle className="text-sm">
                <Brand href="/today" />
              </SheetTitle>
              <SheetDescription className="sr-only">
                Sections of the EquityWise application
              </SheetDescription>
            </SheetHeader>
            <nav aria-label="Primary" className="flex flex-col gap-1 p-3">
              {PRIMARY_NAV.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  variant="drawer"
                  onNavigate={() => setDrawerOpen(false)}
                />
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </TooltipProvider>
  );
}

/**
 * A single destination in the bar (or the mobile drawer).
 *
 * A route is active when the current path is it or sits beneath it, so a stock
 * detail opened from the watchlist still lights the Watchlists tab.
 */
function NavLink({
  item,
  variant = 'bar',
  onNavigate,
}: {
  item: ReadyNavItem;
  variant?: 'bar' | 'drawer';
  onNavigate?: (() => void) | undefined;
}) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md font-medium transition-colors',
        variant === 'drawer' ? 'px-3 py-2.5 text-sm' : 'px-3 py-1.5 text-sm',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}

/**
 * The bar's destinations, flattened from the navigation model. The Account
 * group is excluded — the profile lives in the user menu, not the primary bar.
 */
const PRIMARY_NAV: readonly ReadyNavItem[] = NAVIGATION.flatMap((group) =>
  group.label === 'Account' ? [] : group.items,
).filter((item): item is ReadyNavItem => item.status === 'ready');
