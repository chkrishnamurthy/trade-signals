'use client';

import { MenuIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { UserMenu } from '@/components/auth/user-menu';
import { Brand } from '@/components/layout/brand';
import { NavMenu } from '@/components/layout/nav-menu';
import { StockSearch } from '@/components/market/stock-search';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { HOME_HREF, isItemActive, LANDING_SECTIONS, LEARN_GROUP } from '@/lib/navigation';
import { stockHref } from '@/lib/screener-format';
import { useSession, useSignupOpen } from '@/lib/use-session';
import { cn } from '@/lib/utils';

/**
 * Header for public pages — the landing page, About, Methodology, legal.
 * Plan: docs/planning/landing-and-public-navigation-plan.md §4.
 *
 * Signed out: the landing page's sections, a Learn menu, "Sign in" and one
 * filled "Create free account" (only while sign-up is open). No stock search:
 * no stock page is public, so every result would end at a sign-in wall.
 *
 * Signed in (the landing itself redirects to the Market brief): the Learn
 * menu, stock search, "Open Market brief" and the account menu. The landing
 * sections are left out — `/` sends a signed-in visitor to the app, so links
 * to its sections would not land where they say.
 *
 * Same height (`--nav-bar-height`) and the same slots as the app's top bar, so
 * nothing moves across the sign-in boundary. The session comes from the server
 * (SessionProvider in the root layout), so the right controls paint first time.
 */

const FOCUS =
  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring';
const NAV_LINK = cn(
  FOCUS,
  'rounded-md px-2.5 py-1.5 font-medium text-muted-foreground text-sm transition-colors hover:bg-accent/60 hover:text-foreground',
);
/** `primary-strong` keeps white text at 5.3:1 (plain `primary` is 4.1:1). */
const PRIMARY = cn(
  FOCUS,
  'inline-flex h-9 items-center justify-center rounded-lg bg-primary-strong px-3.5 font-semibold text-primary-foreground text-sm transition-colors hover:bg-primary-strong/90',
);
const QUIET = cn(
  FOCUS,
  'inline-flex h-9 items-center justify-center rounded-lg px-3 font-semibold text-foreground text-sm transition-colors hover:bg-accent',
);

export function PublicHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const signupOpen = useSignupOpen();
  const signedIn = session.status === 'signed-in';
  // "Not known yet" is rare (the server answers first); render the signed-out
  // controls' footprint invisibly rather than flash the wrong ones.
  const pending = session.status === 'loading';

  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  /** A landing section chosen in the phone menu, scrolled to once it has closed. */
  const pendingSection = useRef<string | null>(null);

  const onLanding = pathname === '/';

  return (
    <header className="sticky top-0 z-40 w-full border-border border-b bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-foreground font-medium text-background text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:outline-2 focus:outline-solid focus:outline-offset-2 focus:outline-ring"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-(--nav-bar-height) max-w-6xl items-center gap-4 px-4 sm:px-6 lg:gap-6 lg:px-8">
        <Brand href={signedIn ? HOME_HREF : '/'} showWordmark={true} className="shrink-0" />

        <nav aria-label="Main" className="hidden h-full items-center gap-0.5 lg:flex">
          {!signedIn &&
            LANDING_SECTIONS.map((section) => (
              <a key={section.id} href={`/#${section.id}`} className={NAV_LINK}>
                {section.label}
              </a>
            ))}
          <NavMenu group={LEARN_GROUP} />
        </nav>

        <div className={cn('ml-auto flex min-w-0 items-center gap-2', pending && 'invisible')}>
          {signedIn ? (
            <>
              <StockSearch
                stocksOnly
                shortcut
                onSelect={(symbol) => router.push(stockHref(symbol) as Route)}
                className="hidden w-56 md:block xl:w-64"
              />
              <Link href={HOME_HREF} className={cn(PRIMARY, 'hidden sm:inline-flex')}>
                Open Market brief
              </Link>
              <UserMenu />
            </>
          ) : (
            <>
              <Link href="/login" className={QUIET}>
                Sign in
              </Link>
              {signupOpen && (
                <Link href="/signup" className={cn(PRIMARY, 'hidden sm:inline-flex')}>
                  Create free account
                </Link>
              )}
            </>
          )}
          <button
            ref={menuButton}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className={cn(
              FOCUS,
              'grid size-10 shrink-0 place-items-center rounded-lg border border-border text-foreground hover:bg-accent lg:hidden',
            )}
          >
            <MenuIcon className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-sm"
          onCloseAutoFocus={(event) => {
            // The sheet has no Radix trigger, so say where focus goes back to.
            event.preventDefault();
            const sectionId = pendingSection.current;
            pendingSection.current = null;
            const target = sectionId === null ? null : document.getElementById(sectionId);
            if (target !== null) {
              // Scroll only once the sheet has released the page's scroll lock,
              // then move focus to the section so keyboard and screen-reader
              // users land where they asked to go.
              window.history.pushState(null, '', `#${sectionId}`);
              target.scrollIntoView({ block: 'start' });
              const heading = target.querySelector<HTMLElement>('h2') ?? target;
              heading.setAttribute('tabindex', '-1');
              heading.focus({ preventScroll: true });
              return;
            }
            menuButton.current?.focus();
          }}
        >
          <SheetHeader className="border-border border-b px-5 py-4">
            <SheetTitle className="text-base">Menu</SheetTitle>
            <SheetDescription className="sr-only">
              {signedIn ? 'Help pages and your account' : 'Sections and help pages of EquityWise'}
            </SheetDescription>
          </SheetHeader>
          <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-3">
            {!signedIn && (
              <ul className="m-0 flex list-none flex-col p-0">
                {LANDING_SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`/#${section.id}`}
                      onClick={(event) => {
                        if (onLanding) {
                          // Same page: close first, scroll after (see onCloseAutoFocus).
                          event.preventDefault();
                          pendingSection.current = section.id;
                        }
                        setMenuOpen(false);
                      }}
                      className={cn(
                        FOCUS,
                        'flex min-h-12 items-center rounded-lg px-3 font-semibold text-base hover:bg-accent',
                      )}
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <h2 className="m-0 mt-4 px-3 pb-1 font-medium text-muted-foreground text-sm first:mt-0">
              {LEARN_GROUP.label}
            </h2>
            <ul className="m-0 flex list-none flex-col p-0">
              {LEARN_GROUP.items.map((item) =>
                item.status === 'ready' ? (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={isItemActive(item, pathname) ? 'page' : undefined}
                      className={cn(
                        FOCUS,
                        'flex min-h-12 items-center rounded-lg px-3 text-base hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-semibold',
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                ) : null,
              )}
            </ul>
          </nav>
          <div className="flex gap-3 border-border border-t px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {signedIn ? (
              <Link
                href={HOME_HREF}
                onClick={() => setMenuOpen(false)}
                className={cn(PRIMARY, 'h-12 flex-1 text-base')}
              >
                Open Market brief
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    FOCUS,
                    'inline-flex h-12 flex-1 items-center justify-center rounded-lg border border-border-strong font-semibold',
                  )}
                >
                  Sign in
                </Link>
                {signupOpen && (
                  <Link
                    href="/signup"
                    onClick={() => setMenuOpen(false)}
                    className={cn(PRIMARY, 'h-12 flex-[2] text-base')}
                  >
                    Create free account
                  </Link>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
