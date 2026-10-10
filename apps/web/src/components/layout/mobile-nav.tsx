'use client';

import { EllipsisIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type * as React from 'react';
import { useRef, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DRAWER_SECTIONS,
  HELP_LINKS,
  isGroupActive,
  LAB_GROUP,
  MOBILE_TABS,
  type NavMenuGroup,
} from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { NavItem } from './nav-item';
import { DISCLAIMER } from './page';

/**
 * Navigation below `lg`: a bottom tab bar (Groww, Kite mobile) plus a "More"
 * drawer for everything that does not fit five tabs.
 *
 * Why tabs and not the old hamburger: the four places people go most are one
 * thumb-tap away and always visible, so "where am I" never needs a menu
 * opened. The drawer — a bottom sheet, the direction a thumb already moves —
 * holds Markets, IPOs, the admin Lab and Help & legal, grouped with headings.
 *
 * The "More" tab lights when the current page lives in the drawer, so exactly
 * one tab is always current.
 */
export function MobileNav({
  isAdmin,
  className,
}: {
  isAdmin: boolean;
  className?: string | undefined;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const sections: readonly NavMenuGroup[] = isAdmin
    ? [...DRAWER_SECTIONS, LAB_GROUP]
    : DRAWER_SECTIONS;
  const moreActive = sections.some((group) => isGroupActive(group, pathname));
  const close = () => setOpen(false);

  return (
    <>
      <nav
        aria-label="Primary"
        data-mobile-nav
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-border border-t bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:hidden',
          className,
        )}
      >
        <ul className="mx-auto flex h-(--nav-bottom-height) max-w-xl items-stretch">
          {MOBILE_TABS.map((item) => (
            <li key={item.id} className="flex min-w-0 flex-1">
              <NavItem item={item} variant="tab" />
            </li>
          ))}
          <li className="flex min-w-0 flex-1">
            <button
              ref={moreButton}
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              // A page inside the drawer is current; say so on the tab that reaches it.
              aria-label={
                moreActive ? 'More destinations, current page is in here' : 'More destinations'
              }
              className={cn(
                'relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-2xs transition-colors',
                'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring',
                moreActive
                  ? 'font-semibold text-foreground before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-full before:bg-primary'
                  : 'font-medium text-muted-foreground hover:text-foreground',
              )}
            >
              <EllipsisIcon
                className={cn('size-5', moreActive && 'text-primary-strong')}
                aria-hidden
              />
              <span aria-hidden>More</span>
            </button>
          </li>
        </ul>
      </nav>

      <NavDrawer
        open={open}
        onOpenChange={setOpen}
        sections={sections}
        onNavigate={close}
        returnFocusTo={moreButton}
      />
    </>
  );
}

/**
 * The "More" drawer — the spec's off-canvas "Sidebar". A Radix Dialog under
 * the hood (Sheet): focus is trapped inside, Escape and the backdrop close it,
 * and focus returns to the "More" tab. The sheet is opened from a plain
 * button rather than a Radix trigger (it sits inside the tab list), so the
 * return target is passed in explicitly — without it focus fell to <body>.
 */
export function NavDrawer({
  open,
  onOpenChange,
  sections,
  onNavigate,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: readonly NavMenuGroup[];
  onNavigate: () => void;
  /** Where keyboard focus goes when the sheet closes — the button that opened it. */
  returnFocusTo?: React.RefObject<HTMLElement | null> | undefined;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        onCloseAutoFocus={(event) => {
          if (returnFocusTo?.current == null) return;
          event.preventDefault();
          returnFocusTo.current.focus();
        }}
        className="max-h-[85dvh] overflow-y-auto p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="border-border border-b px-4 py-3">
          <SheetTitle className="text-base">More</SheetTitle>
          <SheetDescription className="sr-only">
            Markets, IPOs and help pages of EquityWise
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-2 py-3">
          {sections.map((group) => (
            <section key={group.id} aria-labelledby={`drawer-${group.id}`}>
              <h2
                id={`drawer-${group.id}`}
                className="px-3 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide"
              >
                {group.label}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <NavItem item={item} variant="drawer" onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section aria-labelledby="drawer-help" className="border-border border-t px-3 pt-3">
            <h2
              id="drawer-help"
              className="pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide"
            >
              Help & legal
            </h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {HELP_LINKS.map((link) => (
                <li key={link.id}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    className="rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="pt-3 text-muted-foreground text-xs">{DISCLAIMER}</p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
