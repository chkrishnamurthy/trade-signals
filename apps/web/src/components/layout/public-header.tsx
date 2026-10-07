'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserMenu } from '@/components/auth/user-menu';
import { Brand } from '@/components/layout/brand';
import { StockSearch } from '@/components/market/stock-search';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { stockHref } from '@/lib/screener-format';

export function PublicHeader({ signedIn = false }: { signedIn?: boolean }) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Brand href="/" showWordmark={true} />
        </div>

        <div className="flex items-center gap-3">
          {/* Signed out, every search result would end at the sign-in page (no
              stock page is public yet), so the box is offered to members only. */}
          {signedIn && (
            <div className="hidden w-60 sm:block lg:w-72">
              <StockSearch
                onSelect={(symbol) => {
                  router.push(stockHref(symbol) as Route);
                }}
              />
            </div>
          )}

          <ThemeToggle />

          {signedIn ? (
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="default">
                <Link href="/today">Open app</Link>
              </Button>
              <UserMenu />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="ghost">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" variant="default" className="hidden sm:inline-flex">
                <Link href="/signup">Create free account</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
