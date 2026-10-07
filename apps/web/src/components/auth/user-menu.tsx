'use client';

import { LifeBuoyIcon, LogOut, MonitorSmartphone, UserRound } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { THEME_ICONS, THEME_LABELS, useThemePreference } from '@/components/ui/theme-toggle';
import { HELP_LINKS } from '@/lib/navigation';
import { THEME_PREFERENCES } from '@/lib/theme';
import { type SessionUser, signOut, useSession } from '@/lib/use-session';
import { cn } from '@/lib/utils';

/**
 * The account control at the right end of the top bar: identity, profile,
 * theme, help & legal, and sign-out — the same corner, same order, as every
 * broker app.
 *
 * Admin destinations moved OUT of this menu into the bar's "Lab" menu: the
 * account menu is about the account, and admins should not have to open it to
 * find a page.
 *
 * It never renders nothing while the session loads (that shifted the bar on
 * every page) and never strands the user if the session call fails — "Log out"
 * is always reachable.
 */
export function UserMenu({ className }: { className?: string | undefined }) {
  const session = useSession();
  const { preference, setPreference } = useThemePreference();

  if (session.status === 'signed-out') return null;
  if (session.status === 'loading') {
    return (
      <span
        aria-hidden
        className={cn('size-8 shrink-0 animate-pulse rounded-full bg-muted', className)}
      />
    );
  }

  const user = session.status === 'signed-in' ? session.user : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            user === null ? 'Account menu' : `Account menu for ${user.profile.displayName}`
          }
          className={cn('size-8 rounded-full', className)}
        >
          <Avatar user={user} />
        </Button>
      </DropdownMenuTrigger>
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

        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <LifeBuoyIcon className="size-4 text-muted-foreground" aria-hidden /> Help & legal
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            {HELP_LINKS.map((link) => (
              <DropdownMenuItem key={link.id} asChild>
                <Link href={link.href}>
                  <link.icon /> {link.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

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

function Avatar({ user }: { user: SessionUser | null }) {
  if (user?.profile.avatarUrl) {
    // biome-ignore lint/performance/noImgElement: avatars are small user uploads, not layout images
    return <img src={user.profile.avatarUrl} alt="" className="size-7 rounded-full object-cover" />;
  }
  const initials =
    user?.profile.displayName
      .split(/\s+/)
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';
  return (
    <span className="grid size-7 place-items-center rounded-full bg-primary/15 font-semibold text-[11px] text-foreground">
      {initials}
    </span>
  );
}
