'use client';

/**
 * Client-side reaction to an authoritative "not signed in".
 *
 * The Edge middleware only checks that a session cookie is *present*; the real,
 * revocable check runs in the Node runtime and answers 401 when the session was
 * revoked (e.g. the user signed this device out from another device), expired,
 * or invalidated. A revoked session therefore slips past the edge — the page
 * shell renders — and the first data fetch comes back 401.
 *
 * That 401 is not a data-load failure to show an error card for: the user is
 * signed out. Send them to the login page instead, once, preserving where they
 * were so a successful sign-in returns them here.
 */

let redirecting = false;

/**
 * If `response` is a 401, navigate to the login page and return `true` (the
 * caller should stop — a full navigation is under way and this frame is gone).
 * Returns `false` for any other status, so callers branch once:
 *
 *   if (redirectToLoginIfUnauthenticated(response)) return;
 *
 * A full-page `assign` (not a client route push) is deliberate: it re-runs the
 * middleware and lands on a freshly server-rendered `/login`, and it is the last
 * thing this now-defunct session does.
 */
export function redirectToLoginIfUnauthenticated(response: Response): boolean {
  if (response.status !== 401) return false;
  if (typeof window === 'undefined') return true;
  if (redirecting) return true;
  redirecting = true;

  const here = window.location.pathname + window.location.search;
  const next = here === '' || here === '/' ? '/watchlists' : here;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  return true;
}
