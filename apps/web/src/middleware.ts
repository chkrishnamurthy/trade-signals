import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/server/auth/cookie-config';

/**
 * The route gate — closed by default.
 *
 * Runs on the Edge runtime, so it does NO database work and no crypto: it only
 * checks that a session cookie is present. The authoritative, revocable check
 * (HMAC + DB lookup + expiry + status) is `getSessionUser()` in the Node runtime,
 * called by protected routes and pages. A present-but-invalid cookie gets past
 * the edge and is rejected there.
 *
 * Only the auth surfaces and static assets are public. Everything else — the app,
 * `/api/*`, and the Fyers OAuth handshake at `/api/fyers/*` + `/callback` — stays
 * behind the gate, exactly as before.
 */

function isPublic(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/verify' ||
    pathname === '/reset' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname.startsWith('/api/auth/')
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const signedIn = request.cookies.get(SESSION_COOKIE_NAME) !== undefined;
  if (signedIn) return NextResponse.next();

  // Browser JSON calls must see a 401 they can parse, not an HTML redirect.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Not signed in.', code: 'UNAUTHENTICATED', remedy: 'Sign in and try again.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|txt|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
