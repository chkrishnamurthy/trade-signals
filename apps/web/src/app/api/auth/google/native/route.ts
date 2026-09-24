import type { NextResponse } from 'next/server';
import { isNativeClient } from '@/server/auth/client';
import { googleAuthEnabled } from '@/server/auth/env';
import { GoogleIdTokenError } from '@/server/auth/google-id-token';
import {
  holdPendingSignup,
  takePendingSignup,
  verifyNativeGoogleToken,
} from '@/server/auth/google-native';
import { type GoogleUserInfo, signInWithGoogleIdentity } from '@/server/auth/google-oauth';
import { fail, json } from '@/server/auth/http';
import { googleNativeSchema } from '@/server/auth/schemas';
import { sessionBody } from '@/server/auth/session';
import { TERMS_VERSION } from '@/server/auth/terms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/google/native — the mobile app's "Sign in with Google"
 * (docs/mobile/01-discovery.md §7.2). Body is either
 *   `{ idToken, nonceId, device? }` — straight from Credential Manager, or
 *   `{ pendingSignupId, acceptTerms: true, termsVersion, device? }` — after the
 *   terms popup, to finish creating a new account.
 *
 * Answers `{ ok, status }` where status is `signed_in` (+ `session`),
 * `mfa_required` (+ `challengeId`, `binding`), `linked` (the caller was already
 * signed in and just connected Google), or `terms_required` (+ `pendingSignupId`).
 * Same account rules as the website — both call `signInWithGoogleIdentity` — but
 * the app always honours 2FA.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isNativeClient(request.headers)) {
    return fail('This endpoint is for the mobile app.', 400, { code: 'NOT_NATIVE_CLIENT' });
  }
  if (!googleAuthEnabled()) {
    return fail('Google sign-in is not available.', 503, { code: 'GOOGLE_AUTH_DISABLED' });
  }
  const parsed = googleNativeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Invalid request.', 400, { code: 'INVALID_BODY' });
  const body = parsed.data;

  let userInfo: GoogleUserInfo | null;
  let termsAccepted = false;
  try {
    if ('idToken' in body) {
      userInfo = await verifyNativeGoogleToken(body.idToken, body.nonceId);
    } else {
      if (body.termsVersion !== TERMS_VERSION) {
        return fail('The terms have been updated. Please review and accept them again.', 409, {
          code: 'TERMS_OUTDATED',
        });
      }
      userInfo = await takePendingSignup(body.pendingSignupId);
      termsAccepted = true;
    }
  } catch (error) {
    if (error instanceof GoogleIdTokenError) {
      return fail(error.message, error.code === 'JWKS_UNAVAILABLE' ? 503 : 401, {
        code: error.code,
      });
    }
    throw error;
  }
  if (userInfo === null) {
    return fail('This Google sign-in expired. Please try again.', 410, { code: 'EXPIRED' });
  }

  const outcome = await signInWithGoogleIdentity(request, userInfo, {
    enforceMfa: true,
    termsAccepted,
    deviceName: body.device?.name ?? null,
  });

  switch (outcome.status) {
    case 'signed_in':
      return json({ ok: true, status: 'signed_in', ...sessionBody(outcome.issued) });
    case 'linked':
      return json({ ok: true, status: 'linked' });
    case 'mfa_required':
      return json({
        ok: true,
        status: 'mfa_required',
        challengeId: outcome.challengeId,
        binding: outcome.binding,
      });
    case 'terms_required':
      return json({
        ok: true,
        status: 'terms_required',
        pendingSignupId: await holdPendingSignup(userInfo),
        termsVersion: TERMS_VERSION,
      });
    case 'error':
      return fail(outcome.message, outcome.code === 'ACCOUNT_DISABLED' ? 403 : 400, {
        code: outcome.code,
      });
  }
}
