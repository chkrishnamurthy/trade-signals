import { NextResponse } from 'next/server';
import { authBaseUrl } from '@/server/auth/env';
import { handleGoogleCallback } from '@/server/auth/google-oauth';
import { safeRedirectPath } from '@/server/auth/redirects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth redirect, exchanges code, creates/links user, establishes session,
 * and redirects to destination.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  // Behind Nginx the request URL is the upstream (http://localhost:3000), so every
  // redirect is built from the configured public origin, never the request's.
  const origin = authBaseUrl();
  const error = searchParams.get('error');

  if (error) {
    const target = new URL('/login', origin);
    target.searchParams.set('error', error);
    return NextResponse.redirect(target, { status: 302 });
  }

  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    const target = new URL('/login', origin);
    target.searchParams.set('error', 'MISSING_PARAMS');
    return NextResponse.redirect(target, { status: 302 });
  }

  try {
    const result = await handleGoogleCallback(request, code, state);

    if (result.status === 'error') {
      console.error('[Google OAuth Error]:', result.code, result.message);
      const target = new URL('/login', origin);
      target.searchParams.set('error', result.code);
      return NextResponse.redirect(target, { status: 302 });
    }

    const destination = safeRedirectPath(result.redirectTo);
    return NextResponse.redirect(new URL(destination, origin), { status: 302 });
  } catch (err) {
    console.error('[Google OAuth Callback Uncaught Error]:', err);
    const target = new URL('/login', origin);
    target.searchParams.set('error', 'DATABASE_ERROR');
    return NextResponse.redirect(target, { status: 302 });
  }
}
