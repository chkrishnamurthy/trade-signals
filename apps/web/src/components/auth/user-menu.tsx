'use client';

import { LogOut, Shield } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { API_ROUTES } from '@/lib/api-routes';

interface SessionUser {
  email: string;
  role: 'user' | 'admin';
  profile: { displayName: string; avatarUrl: string | null };
}

/** The account control in the topbar: identity, an admin link, and log out. */
export function UserMenu() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(API_ROUTES.authSession)
      .then((r) => r.json())
      .then((d: { user: SessionUser | null }) => {
        if (!cancelled) setUser(d.user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (user === null) return null;

  const initials =
    user.profile.displayName
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  async function logout(all: boolean) {
    try {
      await fetch(API_ROUTES.authSignOut({ all }), { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          {user.profile.avatarUrl !== null ? (
            // biome-ignore lint/performance/noImgElement: avatars are small user uploads, not layout images
            <img
              src={user.profile.avatarUrl}
              alt=""
              className="size-6 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-6 place-items-center rounded-full bg-primary/15 font-medium text-[11px] text-primary">
              {initials}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-medium">{user.profile.displayName}</span>
          <span className="font-normal text-muted-foreground text-xs">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === 'admin' ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield className="mr-2 size-4" /> Admin
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => void logout(false)}>
          <LogOut className="mr-2 size-4" /> Log out
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void logout(true)} className="text-muted-foreground">
          Log out of all devices
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
