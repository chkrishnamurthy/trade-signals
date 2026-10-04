import 'server-only';
import { createChallenge } from '@equitywise/db';
import { cookies } from 'next/headers';
import { getDatabase } from '@/server/db';
import { IS_PROD } from './cookie-config';
import { generateSessionToken, hashToken } from './session-token';

const MFA_COOKIE = IS_PROD ? '__Host-auth-mfa' : 'auth-mfa';

export async function beginMfaChallenge(input: {
  userId: number;
  securityVersion: number;
  authenticationMethod: 'password' | 'google';
  authIdentityId?: number | null;
  next?: string;
}): Promise<string> {
  const challengeId = generateSessionToken();
  const binding = generateSessionToken();
  await createChallenge(getDatabase(), {
    purpose: 'mfa',
    tokenHash: hashToken(challengeId),
    userId: input.userId,
    identityId: input.authIdentityId ?? null,
    browserBindingHash: hashToken(binding),
    securityVersion: input.securityVersion,
    data: {
      authenticationMethod: input.authenticationMethod,
      next: input.next ?? '/watchlists',
    },
    expiresAt: new Date(Date.now() + 5 * 60_000),
    maxAttempts: 5,
  });
  (await cookies()).set(MFA_COOKIE, binding, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 5 * 60,
  });
  return challengeId;
}

export async function readMfaBindingHash(): Promise<string | null> {
  const value = (await cookies()).get(MFA_COOKIE)?.value;
  return value ? hashToken(value) : null;
}

export async function clearMfaCookie(): Promise<void> {
  (await cookies()).set(MFA_COOKIE, '', {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
