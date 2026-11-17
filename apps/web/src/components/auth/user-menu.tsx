'use client';

import {
  ChevronRightIcon,
  LogOut,
  MonitorDownIcon,
  MonitorSmartphone,
  SunMoonIcon,
  UserRound,
  XIcon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { LoadingRegion } from '@/components/data-display/loading';
import {
  PanelBody,
  PanelGroupLabel,
  PanelItem,
  PanelSeparator,
} from '@/components/ui/adaptive-popover';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { THEME_ICONS, THEME_LABELS, useThemePreference } from '@/components/ui/theme-toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { HELP_LINKS } from '@/lib/navigation';
import { INSTALL_HELP_EVENT, isIosDevice, isStandalone } from '@/lib/pwa';
import { THEME_PREFERENCES } from '@/lib/theme';
import { useInstallPrompt } from '@/lib/use-install-prompt';
import { useIsPhone } from '@/lib/use-media-query';
import { type SessionUser, signOut, useSession } from '@/lib/use-session';
import { cn } from '@/lib/utils';

/**
 * The account control at the right end of the top bar: identity, profile,
 * theme, help & legal, and sign-out — the same corner, same order, as every
 * broker app.
 *
 * One set of entries, two shapes. On tablets and desktops it is a dropdown
 * under the avatar. On phones it is a bottom sheet: a dropdown hanging from the
 * top-right corner covered the page, opened its "Help & legal" list as a
 * fly-out that had nowhere to fly to, and put 32px rows under a thumb. The
 * sheet lists everything flat, at touch height, within reach.
 *
 * Admin destinations live in the bar's "Admin" menu, not here: the account menu
 * is about the account.
 *
 * It never renders nothing while the session loads (that shifted the bar on
 * every page) and never strands the user if the session call fails — "Log out"
 * is always reachable.
 */
export function UserMenu({ className }: { className?: string | undefined }) {
  const session = useSession();
  const phone = useIsPhone();

  if (session.status === 'signed-out') return null;
  if (session.status === 'loading') {
    return (
      <LoadingRegion label="Loading account" className={cn('size-8 shrink-0', className)}>
        <Skeleton className="size-8 rounded-full" />
      </LoadingRegion>
    );
  }

  const user = session.status === 'signed-in' ? session.user : null;
  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={user === null ? 'Account menu' : `Account menu for ${user.profile.displayName}`}
      className={cn('rounded-full', className)}
    >
      <Avatar user={user} />
    </Button>
  );

  return phone ? (
    <AccountSheet user={user} trigger={trigger} />
  ) : (
    <AccountDropdown user={user} trigger={trigger} />
  );
}

function AccountDropdown({
  user,
  trigger,
}: {
  user: SessionUser | null;
  trigger: React.ReactNode;
}) {
  const { preference, setPreference } = useThemePreference();
  const canInstall = useCanInstall();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64">
        {user === null ? (
          <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
            Could not load your account details.
          </DropdownMenuLabel>
        ) : (
          <DropdownMenuLabel className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium">{user.profile.displayName}</span>
            <span className="truncate font-normal text-muted-foreground text-xs">{user.email}</span>
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound /> Profile & security
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={preference ?? ''} onValueChange={setPreference}>
          {THEME_PREFERENCES.map((option) => {
            const Icon = THEME_ICONS[option];
            return (
              <DropdownMenuRadioItem key={option} value={option}>
                <Icon className="text-muted-foreground" aria-hidden /> {THEME_LABELS[option]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>

        {/* Listed flat: four links do not earn a sub-menu and a second hover. */}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          Help & legal
        </DropdownMenuLabel>
        {HELP_LINKS.map((link) => (
          <DropdownMenuItem key={link.id} asChild>
            <Link href={link.href}>
              <link.icon /> {link.label}
            </Link>
          </DropdownMenuItem>
        ))}

        {canInstall && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={openInstallHelp}>
              <MonitorDownIcon /> Install app
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut(false)}>
          <LogOut /> Log out
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut(true)}>
          <MonitorSmartphone /> Log out of all devices
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The phone form: the same entries as rows in a bottom sheet. */
function AccountSheet({ user, trigger }: { user: SessionUser | null; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { preference, setPreference } = useThemePreference();
  const canInstall = useCanInstall();
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" showCloseButton={false} className="gap-0 p-0">
        <header className="flex items-center gap-3 border-border border-b px-4 pt-2 pb-3">
          <Avatar user={user} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col">
            <SheetTitle className="truncate text-base">
              {user === null ? 'Account' : user.profile.displayName}
            </SheetTitle>
            <SheetDescription>
              {user === null ? 'Could not load your account details.' : user.email}
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close" className="-mr-2">
              <XIcon />
            </Button>
          </SheetClose>
        </header>

        <PanelBody className="py-1.5">
          <PanelItem asChild>
            <Link href="/profile" onClick={close}>
              <UserRound aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">Profile & security</span>
              <ChevronRightIcon className="size-4 text-subtle-foreground" aria-hidden />
            </Link>
          </PanelItem>
          <div className="flex min-h-(--touch-target) items-center gap-3 px-4">
            <SunMoonIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span id="account-theme" className="flex-1 font-medium text-sm">
              Theme
            </span>
            <ToggleGroup
              type="single"
              value={preference ?? ''}
              onValueChange={setPreference}
              aria-labelledby="account-theme"
            >
              {THEME_PREFERENCES.map((option) => {
                const Icon = THEME_ICONS[option];
                return (
                  <ToggleGroupItem key={option} value={option}>
                    <Icon aria-hidden />
                    {THEME_LABELS[option]}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>
          {canInstall && (
            <PanelItem
              onClick={() => {
                close();
                openInstallHelp();
              }}
            >
              <MonitorDownIcon aria-hidden />
              <span className="font-medium">Install app</span>
            </PanelItem>
          )}

          <PanelSeparator />
          <PanelGroupLabel className="pt-1.5">Help & legal</PanelGroupLabel>
          {HELP_LINKS.map((link) => (
            <PanelItem key={link.id} asChild>
              <Link href={link.href} onClick={close}>
                <link.icon aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{link.label}</span>
                <ChevronRightIcon className="size-4 text-subtle-foreground" aria-hidden />
              </Link>
            </PanelItem>
          ))}

          <PanelSeparator />
          <PanelItem onClick={() => void signOut(false)}>
            <LogOut aria-hidden />
            <span className="font-medium">Log out</span>
          </PanelItem>
          <PanelItem onClick={() => void signOut(true)}>
            <MonitorSmartphone aria-hidden />
            <span className="font-medium">Log out of all devices</span>
          </PanelItem>
        </PanelBody>
      </SheetContent>
    </Sheet>
  );
}

function Avatar({ user, size = 'md' }: { user: SessionUser | null; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-11 text-sm' : 'size-7 text-2xs';
  if (user?.profile.avatarUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: avatars are small user uploads, not layout images
      <img
        src={user.profile.avatarUrl}
        alt=""
        className={cn('shrink-0 rounded-full object-cover', box)}
      />
    );
  }
  const initials =
    user?.profile.displayName
      .split(/\s+/)
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-foreground',
        box,
      )}
    >
      {initials}
    </span>
  );
}

function openInstallHelp(): void {
  window.dispatchEvent(new Event(INSTALL_HELP_EVENT));
}

/**
 * Whether "Install app" should be offered — always reachable here, whatever the
 * banner's state (docs/planning/pwa-plan.md §5.1). False when already installed
 * or when this browser cannot install (no captured prompt and not iOS).
 */
function useCanInstall(): boolean {
  const { canPrompt, installed } = useInstallPrompt();
  const [available, setAvailable] = React.useState(false);
  React.useEffect(() => {
    setAvailable(
      !installed &&
        !isStandalone() &&
        (canPrompt || isIosDevice(navigator.userAgent, navigator.maxTouchPoints)),
    );
  }, [canPrompt, installed]);
  return available;
}
