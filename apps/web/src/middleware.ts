import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Authentication gate.
 *
 * This is a single-user personal tool: nothing it serves is public. Every
 * route is therefore closed by default and only the sign-in surfaces are open,
 * so a new page or API route is protected the moment it exists rather than the
 * moment someone remembers to list it here.
 *
 * `/login` and `/callback` are NOT auth routes — they are the market-data
 * provider's OAuth handshake, which writes a credential to disk. They stay
 * behind the gate deliberately.
 */
/**
 * Written out rather than using Clerk's `createRouteMatcher`, which is
 * deprecated in Core 3. The check is deliberately prefix-based: Clerk mounts
 * probe routes beneath its own pages (`/sign-in/SignIn_clerk_catchall_check_…`)
 * and those must stay reachable for the form to work.
 */
function isAuthRoute(pathname: string): boolean {
  return (
    pathname === '/sign-in' ||
    pathname.startsWith('/sign-in/') ||
    pathname === '/sign-up' ||
    pathname.startsWith('/sign-up/')
  );
}

export default clerkMiddleware(
  async (auth, request) => {
    if (isAuthRoute(request.nextUrl.pathname)) return;

    const { userId, redirectToSignIn } = await auth();
    if (userId !== null) return;

    // The dashboard polls JSON endpoints from the browser. Answering those with
    // a 302 to an HTML sign-in page would surface as a parse error; a 401 lets
    // the client report an expired session for what it is.
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Not signed in.', code: 'UNAUTHENTICATED', remedy: 'Sign in and try again.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Not `auth.protect()`: that answers 404, hiding the route's existence. That
    // is the right default for a public app and the wrong one here, where the
    // only visitor is the owner and a bare 404 offers them no way in. Send them
    // to the form, and back to where they were aiming once they are through.
    return redirectToSignIn({ returnBackUrl: request.url });
  },
  // Keeps sign-in inside this application rather than bouncing to Clerk's
  // hosted account portal.
  { signInUrl: '/sign-in', signUpUrl: '/sign-up' },
);

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|txt|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
