'use client';

import { MenuIcon } from 'lucide-react';
import { UserMenu } from '@/components/auth/user-menu';
import { StockSearch } from '@/components/market/stock-search';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import { Brand } from './brand';

/**
 * The command bar.
 *
 * One row, 48px, on every route: where am I, what am I looking for, and the
 * session controls. What drops as the viewport narrows is the brand (< sm),
 * since the menu button already identifies the app.
 */
export function Topbar({
  onOpenNavigation,
  onSearchSelect,
  className,
}: {
  onOpenNavigation: () => void;
  /** Where a search hit goes. Pages with their own detail surface override it. */
  onSearchSelect: (symbol: string) => void;
  className?: string | undefined;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-border border-b bg-surface/85 px-3 backdrop-blur sm:gap-3 sm:px-4',
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenNavigation}
        className="shrink-0 lg:hidden"
        aria-label="Open navigation"
      >
        <MenuIcon />
      </Button>

      <Brand className="hidden shrink-0 sm:flex lg:hidden" showWordmark={false} />

      <div className="w-32 shrink-0 sm:w-44 lg:w-60">
        <StockSearch onSelect={onSearchSelect} />
      </div>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
