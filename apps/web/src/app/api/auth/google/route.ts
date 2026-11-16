import { describeFailure } from '@equitywise/db';
import { NextResponse } from 'next/server';
import { googleAuthEnabled } from '@/server/auth/env';
import { createGoogleAuthSession } from '@/server/auth/google-oauth';
import { fail } from '@/server/auth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/google
 * Initiates the Google OAuth 2.0 flow by setting the state cookie and redirecting to Google.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!googleAuthEnabled()) {
    return fail('Google authentication is not available.', 503, { code: 'GOOGLE_AUTH_DISABLED' });
  }

  const { searchParams } = new URL(request.url);
  const next = searchParams.get('next');

  try {
    const authUrl = await createGoogleAuthSession(next);
    return NextResponse.redirect(authUrl, { status: 302 });
  } catch (error) {
    // The cause (a missing secret, a database failure) is the operator's to read.
    console.error('[google-auth] could not start sign-in:', describeFailure(error));
    return fail('Google sign-in could not be started.', 500, { code: 'AUTH_INIT_FAILED' });
  }
}
