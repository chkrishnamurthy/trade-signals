'use client';

import { UserButton } from '@clerk/nextjs';
import { MenuIcon } from 'lucide-react';
import { LastUpdated } from '@/components/market/market-status';
import { MarketSentimentPill, MarketTicker } from '@/components/market/market-ticker';
import { StockSearch } from '@/components/market/stock-search';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useMarketTicker } from '@/lib/use-market-ticker';
import { cn } from '@/lib/utils';
import { Brand } from './brand';

/**
 * The market command bar.
 *
 * One row, 48px, on every route. Reading left to right it answers: where am I,
 * what am I looking for, is the market open, what is it doing, and how fresh is
 * that. The session state and the index strip used to be passed in per page,
 * which meant a user on `/watchlists` could not see either without navigating
 * back to the dashboard.
 *
 * What drops as the viewport narrows is ordered by how much it is worth:
 *
 *   < 2xl   sentiment goes — it is a summary of numbers still on screen
 *   < xl    the freshness stamp goes; the popovers still carry it
 *   < sm    the brand goes, since the menu button already identifies the app,
 *           and the search field narrows
 *
 * The session badge and the index strip never drop at any width. They are the
 * reason the bar exists, they live in one scroller, and it absorbs the pressure
 * by scrolling rather than by shrinking the type below a readable size.
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
  const feed = useMarketTicker();

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

      {/* flex-1 + min-w-0 is what makes the strip the part that absorbs the
          remaining width and scrolls, instead of pushing the controls off the
          right edge. */}
      <MarketTicker className="flex-1" />

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <MarketSentimentPill className="hidden 2xl:inline-flex" />
        {feed.status === 'ready' && (
          <LastUpdated at={feed.data.fetchedAt} className="hidden xl:inline-flex" />
        )}
        <ThemeToggle />
        <UserButton appearance={{ elements: { avatarBox: 'size-7' } }} />
      </div>
    </header>
  );
}
