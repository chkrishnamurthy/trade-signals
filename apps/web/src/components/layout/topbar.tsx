'use client';

import { MenuIcon } from 'lucide-react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import { Brand } from './brand';

/**
 * Application topbar.
 *
 * Fixed contents on the outside — navigation trigger and brand on the left,
 * theme on the right — and a single page-supplied slot between them. Pages get
 * to add search and session state without being able to move the furniture.
 */
export function Topbar({
  onOpenNavigation,
  children,
  className,
}: {
  onOpenNavigation: () => void;
  /** Page-supplied: search, market status, last-updated. */
  children?: React.ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface/85 px-3 backdrop-blur sm:px-4',
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenNavigation}
        className="lg:hidden"
        aria-label="Open navigation"
      >
        <MenuIcon />
      </Button>

      <Brand className="lg:hidden" showWordmark={false} />

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}
