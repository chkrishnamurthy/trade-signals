'use client';

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
import { cn } from '@/lib/utils';
import { Brand } from './brand';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

const COLLAPSE_KEY = 'signal.nav.collapsed';

/**
 * The application frame.
 *
 * Sidebar, topbar and main region. Every route renders inside this, so a new
 * page inherits navigation, session state and theming without wiring anything.
 *
 * On `lg` and up the sidebar is a permanent column; below that it becomes a
 * Sheet, which gives it a focus trap and Escape-to-close for free rather than
 * a hand-rolled overlay.
 */
export function AppShell({
  children,
  topbar,
  className,
}: {
  children: React.ReactNode;
  /** Contents of the topbar's page slot — search, market status, freshness. */
  topbar?: React.ReactNode | undefined;
  className?: string | undefined;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Read after mount: the server has no access to this preference, and
  // rendering a guess would produce a hydration mismatch on every load.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // Storage can be unavailable (private mode, blocked cookies). Expanded
      // is the safe default — the labels are the discoverable state.
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Preference simply does not persist; the session still works.
      }
      return next;
    });
  }, []);

  return (
    <TooltipProvider>
      <div className={cn('flex min-h-dvh bg-background', className)}>
        <aside
          className={cn(
            'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] lg:flex',
            collapsed ? 'w-14' : 'w-56',
          )}
        >
          <div
            className={cn(
              'flex h-12 shrink-0 items-center border-b border-border px-3',
              collapsed && 'justify-center px-0',
            )}
          >
            <Brand showWordmark={!collapsed} />
          </div>
          <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        </aside>

        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <SheetHeader className="h-12 items-center py-0">
              <SheetTitle className="text-sm">
                <Brand />
              </SheetTitle>
              <SheetDescription className="sr-only">
                Sections of the Signal application
              </SheetDescription>
            </SheetHeader>
            <Sidebar collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenNavigation={() => setDrawerOpen(true)}>{topbar}</Topbar>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
