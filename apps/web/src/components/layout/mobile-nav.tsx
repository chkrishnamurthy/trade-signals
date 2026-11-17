'use client';

import { EllipsisIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type * as React from 'react';
import { useRef, useState } from 'react';
import { PanelGroupLabel } from '@/components/ui/adaptive-popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ADMIN_GROUP,
  DRAWER_SECTIONS,
  isGroupActive,
  MOBILE_TABS,
  type NavMenuGroup,
} from '@/lib/navigation';
import { useSoftKeyboardOpen } from '@/lib/use-pwa-environment';
import { cn } from '@/lib/utils';
import { NavItem } from './nav-item';

/**
 * Navigation below `lg`: a bottom tab bar (Groww, Kite mobile) plus a "More"
 * drawer for everything that does not fit five tabs.
 *
 * Why tabs and not the old hamburger: the four places people go most are one
 * thumb-tap away and always visible, so "where am I" never needs a menu
 * opened. The drawer — a bottom sheet, the direction a thumb already moves —
 * holds Markets, IPOs and the Admin menu, grouped with headings. It is a list
 * of places and nothing else: help & legal live in the account sheet and the
 * page footer, and the standing disclaimer is in the footer of every page.
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
    ? [...DRAWER_SECTIONS, ADMIN_GROUP]
    : DRAWER_SECTIONS;
  const moreActive = sections.some((group) => isGroupActive(group, pathname));
  const close = () => setOpen(false);
  // Hidden while the on-screen keyboard is up, so it never covers what is typed.
  const keyboardOpen = useSoftKeyboardOpen();

  return (
    <>
      <nav
        aria-label="Primary"
        data-mobile-nav
        hidden={keyboardOpen}
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-border border-t bg-surface/95 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:hidden',
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
        className="overflow-y-auto p-0"
      >
        <SheetHeader className="items-center border-border border-b px-4 pt-2 pb-3">
          <SheetTitle className="text-base">More</SheetTitle>
          <SheetDescription className="sr-only">
            Markets, IPOs and other sections of EquityWise
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-1.5 pb-3">
          {sections.map((group) => (
            <section key={group.id} aria-labelledby={`drawer-${group.id}`}>
              <PanelGroupLabel id={`drawer-${group.id}`}>{group.label}</PanelGroupLabel>
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <NavItem item={item} variant="drawer" onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
