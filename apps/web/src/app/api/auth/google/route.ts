import { NextResponse } from 'next/server';
import { createGoogleAuthSession } from '@/server/auth/google-oauth';
import { googleAuthEnabled } from '@/server/auth/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/google
 * Initiates the Google OAuth 2.0 flow by setting the state cookie and redirecting to Google.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!googleAuthEnabled()) {
    return NextResponse.json(
      { error: 'Google authentication is not available.', code: 'GOOGLE_AUTH_DISABLED' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const next = searchParams.get('next');

  try {
    const authUrl = await createGoogleAuthSession(next);
    return NextResponse.redirect(authUrl, { status: 302 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initialize Google login.';
    return NextResponse.json({ error: message, code: 'AUTH_INIT_FAILED' }, { status: 500 });
  }
}
