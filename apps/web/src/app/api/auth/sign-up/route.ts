import { createToken, createUser, writeAudit } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { sendVerificationEmail } from '@/server/auth/email';
import { signupEnabled } from '@/server/auth/env';
import { fail, json } from '@/server/auth/http';
import { hashPassword } from '@/server/auth/password';
import { validatePassword } from '@/server/auth/password-policy';
import { isPwned } from '@/server/auth/pwned';
import { clientIp, isSameOrigin, userAgent } from '@/server/auth/request';
import { signUpSchema } from '@/server/auth/schemas';
import { startSession } from '@/server/auth/session';
import { generateSessionToken, hashToken } from '@/server/auth/session-token';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERIFY_TTL_MS = 30 * 60_000;

/** POST /api/auth/sign-up — create an account and sign the new user in. */
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

  const db = getDatabase();
  const passwordHash = await hashPassword(password);
  const name = displayName ?? email.split('@')[0] ?? 'there';

  try {
    const user = await createUser(db, {
      email,
      displayName: name,
      passwordHash,
      termsAcceptedAt: new Date(),
    });

    // Verification is optional (does not block use); send the link anyway.
    const verifyToken = generateSessionToken();
    await createToken(db, {
      userId: user.id,
      purpose: 'email_verify',
      tokenHash: hashToken(verifyToken),
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    });
    await sendVerificationEmail(email, verifyToken);

    await writeAudit(db, {
      event: 'signup',
      userId: user.id,
      ipAddress: clientIp(request),
      userAgent: userAgent(request),
    });

    await startSession(user.id, request);
    return json({ ok: true }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Enumeration-safe: respond exactly as for a fresh signup.
      return json({ ok: true }, 201);
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
