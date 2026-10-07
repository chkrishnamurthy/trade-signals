'use client';

import { useEffect, useState } from 'react';
import { API_ROUTES } from '@/lib/api-routes';

export interface SessionUser {
  readonly email: string;
  readonly role: 'user' | 'admin';
  readonly profile: { readonly displayName: string; readonly avatarUrl: string | null };
}

/**
 * - `loading`: not known yet — render a same-size placeholder, never nothing,
 *   so the bar does not shift when the answer arrives.
 * - `error`: the session endpoint failed — still offer "Log out".
 */
export type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'signed-in'; readonly user: SessionUser }
  | { readonly status: 'signed-out' }
  | { readonly status: 'error' };

/**
 * One request per page load, however many components ask. The navigation
 * (admin "Lab" menu) and the account menu both need the session; without this
 * they would fetch it twice on every route.
 */
let pending: Promise<SessionState> | null = null;

function loadSession(): Promise<SessionState> {
  pending ??= fetch(API_ROUTES.authSession)
    .then((response) => {
      if (!response.ok) throw new Error(`session ${response.status}`);
      return response.json() as Promise<{ user: SessionUser | null }>;
    })
    .then(
      (payload): SessionState =>
        payload.user === null
          ? { status: 'signed-out' }
          : { status: 'signed-in', user: payload.user },
    )
    .catch((): SessionState => {
      // Let the next mount retry rather than caching a transient failure.
      pending = null;
      return { status: 'error' };
    });
  return pending;
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    void loadSession().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/** Sign out, then leave — whatever the endpoint answered. */
export async function signOut(all: boolean): Promise<void> {
  try {
    await fetch(API_ROUTES.authSignOut({ all }), { method: 'POST' });
  } finally {
    pending = null;
    window.location.href = '/login';
  }
}
