'use client';

import { LayoutGridIcon, LineChartIcon, SlidersHorizontalIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/layout/brand';
import { StockSearch } from '@/components/market/stock-search';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export function PublicHeader({ signedIn = false }: { signedIn?: boolean }) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Brand showWordmark={true} />
          </Link>

          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-muted-foreground">
            <Link
              href="/stocks"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <LineChartIcon className="size-4" />
              Stocks
            </Link>
            <Link
              href="/screener"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <SlidersHorizontalIcon className="size-4" />
              Screener
            </Link>
            <Link
              href="/sectors"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <LayoutGridIcon className="size-4" />
              Sectors
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-40 sm:w-60 lg:w-72">
            <StockSearch
              onSelect={(symbol) => {
                router.push(`/stocks/${symbol.toLowerCase()}` as Route);
              }}
            />
          </div>

          <ThemeToggle />

          {signedIn ? (
            <Button asChild size="sm" variant="default">
              <Link href="/watchlists">Watchlists</Link>
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="ghost">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild size="sm" variant="default" className="hidden sm:inline-flex">
                <Link href="/signup">Get Started</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
