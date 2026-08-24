'use client';

import { useRouter } from 'next/navigation';
import type * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import { applyNavState, currentNavState, writeStoredNavState } from '@/lib/nav-rail';
import { MarketTickerProvider } from '@/lib/use-market-ticker';
import { cn } from '@/lib/utils';
import { Brand } from './brand';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/**
 * The application frame.
 *
 * Sidebar, topbar and main region. Every route renders inside this, so a new
 * page inherits navigation, session state, theming and the market ticker
 * without wiring anything.
 *
 * The ticker feed is provided HERE rather than by the topbar, so that there is
 * one poller per tab and a page can read the same snapshot the header is
 * showing instead of opening a second one.
 *
 * On `lg` and up the sidebar is a permanent column; below that it becomes a
 * Sheet, which gives it a focus trap and Escape-to-close for free rather than
 * a hand-rolled overlay.
 *
 * The column's open/closed state lives on <html>, not in React — the blocking
 * script in the layout has already restored it by the time this mounts, and
 * writing it back here would repaint a frame late. What React keeps is a copy
 * for the toggle's accessible name, synced after mount.
 */
export function AppShell({
  children,
  onSearchSelect,
  className,
}: {
  children: React.ReactNode;
  /**
   * Where a header search hit goes.
   *
   * Defaults to the stocks page, which already has a detail drawer and now
   * opens it from `?symbol=`. Pages that can show the stock without navigating
   * — the dashboard has the same drawer in place — pass their own handler so
   * searching does not bounce the user off the screen they are on.
   */
  onSearchSelect?: ((symbol: string) => void) | undefined;
  className?: string | undefined;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSearchSelect = useCallback(
    (symbol: string) => {
      if (onSearchSelect !== undefined) {
        onSearchSelect(symbol);
        return;
      }
      router.push(`/stocks?symbol=${encodeURIComponent(symbol)}`);
    },
    [onSearchSelect, router],
  );

  // The attribute is the truth. Read it once, so `aria-expanded` agrees with
  // what is on screen; the server rendered the optimistic value because it has
  // no way to know, and correcting it in an effect avoids a hydration error.
  useEffect(() => {
    setCollapsed(currentNavState() === 'collapsed');
  }, []);

  const toggleCollapsed = useCallback(() => {
    const next = currentNavState() === 'collapsed' ? 'expanded' : 'collapsed';
    applyNavState(next);
    writeStoredNavState(next);
    setCollapsed(next === 'collapsed');
  }, []);

  // Ctrl/⌘ B, the shortcut every editor with a side panel uses. Ignored while
  // the caret is in a field, so it never eats a keystroke meant for a search
  // box or a note.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'b' && event.key !== 'B') return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey || event.shiftKey) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      }

      event.preventDefault();
      toggleCollapsed();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleCollapsed]);

  return (
    <TooltipProvider>
      <MarketTickerProvider>
        <div className={cn('flex min-h-dvh bg-background', className)}>
          {/* `data-nav-rail` is what scopes the collapse styling to this column:
            the same Sidebar inside the mobile Sheet is outside it and stays
            expanded whatever the rail is doing. */}
          <aside
            data-nav-rail
            className="sticky top-0 hidden h-dvh shrink-0 flex-col overflow-x-clip border-r border-border bg-surface lg:flex"
          >
            {/* pl-4 is not arbitrary: it centres the 24px monogram on 28px,
              exactly where the 40px icon slots below centre their icons, so
              the whole left column reads as one line in the collapsed rail. */}
            <div className="flex h-12 shrink-0 items-center border-b border-border pl-4">
              <Brand />
            </div>
            <Sidebar
              id="primary-navigation"
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
            />
          </aside>

          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="h-12 items-center py-0">
                <SheetTitle className="text-sm">
                  <Brand />
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Sections of the WealthOS application
                </SheetDescription>
              </SheetHeader>
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              onOpenNavigation={() => setDrawerOpen(true)}
              onSearchSelect={handleSearchSelect}
            />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>
      </MarketTickerProvider>
    </TooltipProvider>
  );
}
