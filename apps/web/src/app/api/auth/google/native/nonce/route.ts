import type { NextResponse } from 'next/server';
import { isNativeClient } from '@/server/auth/client';
import { googleAuthEnabled } from '@/server/auth/env';
import { issueGoogleNonce } from '@/server/auth/google-native';
import { fail, json } from '@/server/auth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/google/native/nonce — a single-use nonce for the app's Google sign-in. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isNativeClient(request.headers)) {
    return fail('This endpoint is for the mobile app.', 400, { code: 'NOT_NATIVE_CLIENT' });
  }
  if (!googleAuthEnabled()) {
    return fail('Google sign-in is not available.', 503, { code: 'GOOGLE_AUTH_DISABLED' });
  }
  return json(await issueGoogleNonce());
}
