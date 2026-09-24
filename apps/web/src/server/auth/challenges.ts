import 'server-only';
import { createChallenge } from '@equitywise/db';
import { cookies, headers } from 'next/headers';
import { getDatabase } from '@/server/db';
import { isNativeClient } from './client';
import { IS_PROD } from './cookie-config';
import { generateSessionToken, hashToken } from './session-token';

const MFA_COOKIE = IS_PROD ? '__Host-auth-mfa' : 'auth-mfa';

/**
 * Open a 2FA challenge after a correct first factor. The challenge is bound to the
 * caller by a random `binding`: a browser gets it as the `__Host-auth-mfa` cookie,
 * the native app gets it back (returned here) to send with the code — it has no
 * cookie jar. Either way a stolen `challengeId` alone is useless.
 */
export async function beginMfaChallenge(input: {
  userId: number;
  securityVersion: number;
  authenticationMethod: 'password' | 'google';
  authIdentityId?: number | null;
  next?: string;
}): Promise<{ challengeId: string; binding: string | null }> {
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
  if (isNativeClient(await headers())) return { challengeId, binding };
  (await cookies()).set(MFA_COOKIE, binding, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 5 * 60,
  });
  return { challengeId, binding: null };
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
