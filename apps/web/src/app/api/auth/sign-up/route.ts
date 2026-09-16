import { type AuthUser, createToken, createUser, writeAudit } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { sendVerificationEmail } from '@/server/auth/email';
import { authSessionSecret, signupEnabled } from '@/server/auth/env';
import { fail, json } from '@/server/auth/http';
import { hashPassword } from '@/server/auth/password';
import { validatePassword } from '@/server/auth/password-policy';
import { isPwned } from '@/server/auth/pwned';
import { clientIp, isSameOrigin } from '@/server/auth/request';
import { signUpSchema } from '@/server/auth/schemas';
import { startSession } from '@/server/auth/session';
import { generateSessionToken, hashToken } from '@/server/auth/session-token';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERIFY_TTL_MS = 30 * 60_000;

/**
 * POST /api/auth/sign-up — create an account and sign the new user in.
 *
 * Atomicity contract: signup either creates a complete account or writes nothing.
 * Everything that can fail runs in one of two phases:
 *   - BEFORE `createUser`: validation, breach check, and a required-config check.
 *     A failure here writes nothing at all.
 *   - AFTER `createUser` (which is itself atomic): the verification email, the
 *     audit line, and the session cookie are all BEST-EFFORT — a failure is
 *     logged and never turns a successfully created account into a
 *     "could not create your account" error.
 * The one thing we must not do is what the old code did: commit the user, then
 * throw on a later step and report failure, leaving an orphaned account behind.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!signupEnabled()) {
    return fail('Sign-up is currently closed.', 403, { code: 'SIGNUP_DISABLED' });
  }
  if (!isSameOrigin(request)) {
    return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail('Request body is not valid JSON.', 400, { code: 'INVALID_BODY' });
  }
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? 'Invalid request.', 400, { code: 'INVALID_BODY' });
  }
  const { email, password, displayName } = parsed.data;

  const strength = validatePassword(password);
  if (!strength.ok) return fail(strength.reason, 400, { code: 'WEAK_PASSWORD' });
  if (await isPwned(password)) {
    return fail('That password has appeared in a data breach — please choose another.', 400, {
      code: 'BREACHED_PASSWORD',
    });
  }

  // Verify required config BEFORE any write. Establishing the session (below)
  // needs this secret; checking it now means a server misconfiguration can never
  // leave a half-created account behind — it fails cleanly with nothing written.
  try {
    authSessionSecret();
  } catch {
    console.error('[sign-up] AUTH_SESSION_SECRET is not configured — refusing before any write.');
    return fail('Sign-up is temporarily unavailable. Please try again later.', 503, {
      code: 'SERVER_MISCONFIGURED',
    });
  }

  const db = getDatabase();
  const passwordHash = await hashPassword(password);
  const name = displayName ?? email.split('@')[0] ?? 'there';

  // Account creation is the single atomic write. If it fails there is nothing to
  // clean up — the transaction rolled back — so we can report honestly.
  let user: AuthUser;
  try {
    user = await createUser(db, {
      email,
      displayName: name,
      passwordHash,
      termsAcceptedAt: new Date(),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail('An account with this email already exists — please sign in instead.', 409, {
        code: 'EMAIL_TAKEN',
        remedy: 'Sign in, or reset your password if you have forgotten it.',
      });
    }
    throw error;
  }

  // ── From here the account exists and is complete. Everything below is
  //    best-effort and must never fail the request. ──────────────────────────

  try {
    const verifyToken = generateSessionToken();
    await createToken(db, {
      userId: user.id,
      purpose: 'email_verify',
      tokenHash: hashToken(verifyToken),
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    });
    await sendVerificationEmail(email, verifyToken);
  } catch (error) {
    console.error('[sign-up] verification-email step failed (non-fatal):', error);
  }

  try {
    await writeAudit(db, {
      event: 'signup',
      userId: user.id,
      ipAddress: clientIp(request),
    });
  } catch (error) {
    console.error('[sign-up] audit write failed (non-fatal):', error);
  }

  try {
    await startSession(user.id, request);
  } catch (error) {
    // The account was created; we just couldn't set the cookie. Report success
    // and tell the client to route the user to sign-in rather than the app.
    console.error('[sign-up] session establishment failed (account WAS created):', error);
    return json({ ok: true, signedIn: false }, 201);
  }

  return json({ ok: true, signedIn: true }, 201);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
