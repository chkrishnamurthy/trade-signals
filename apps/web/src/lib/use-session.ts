'use client';

import type * as React from 'react';
import { createContext, createElement, useContext, useEffect, useState } from 'react';
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
 * The session as the server saw it while rendering the page (root layout).
 * `null` = the server could not tell (its lookup failed); the hook then waits
 * for the browser's own request, as before.
 */
const ServerSession = createContext<SessionState | null>(null);

export function SessionProvider({
  initial,
  children,
}: {
  initial: SessionState | null;
  children: React.ReactNode;
}) {
  return createElement(ServerSession.Provider, { value: initial }, children);
}

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

/**
 * The current session. Starts from the server's answer, so the first paint
 * already shows the right account control and (for admins) the Lab menu; the
 * browser still confirms it once per page load, which also catches a sign-in
 * or sign-out that happened after the layout rendered (layouts persist across
 * client-side navigation).
 */
export function useSession(): SessionState {
  const initial = useContext(ServerSession);
  const [state, setState] = useState<SessionState>(initial ?? { status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    void loadSession().then((next) => {
      if (cancelled) return;
      // A failed confirmation does not throw away a good server answer.
      if (next.status === 'error' && initial !== null && initial.status !== 'loading') return;
      setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [initial]);
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
