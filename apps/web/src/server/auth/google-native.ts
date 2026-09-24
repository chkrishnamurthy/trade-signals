import 'server-only';
import {
  type AuthChallenge,
  consumeChallengeById,
  createChallenge,
  getActiveChallenge,
} from '@equitywise/db';
import { getDatabase } from '@/server/db';
import { googleAuthConfig } from './env';
import { verifyGoogleIdToken } from './google-id-token';
import type { GoogleUserInfo } from './google-oauth';
import { generateSessionToken, hashToken } from './session-token';

/**
 * One-time state for the mobile app's native Google sign-in, kept in
 * `auth_challenges` (purpose `google_native`):
 *
 *   - a **nonce** the app passes to Credential Manager; Google embeds it in the ID
 *     token, so a token minted for anyone else — or replayed — fails;
 *   - a **pending sign-up**: when a verified Google user has no account yet, we
 *     hold the verified principal for 10 minutes while the app shows its terms
 *     popup, instead of asking for (and replaying) the ID token a second time.
 */

const NONCE_TTL_MS = 10 * 60_000;
const PENDING_TTL_MS = 10 * 60_000;

export async function issueGoogleNonce(): Promise<{ nonceId: string; nonce: string }> {
  const nonceId = generateSessionToken();
  const nonce = generateSessionToken();
  await createChallenge(getDatabase(), {
    purpose: 'google_native',
    tokenHash: hashToken(nonceId),
    data: { kind: 'nonce', nonce },
    expiresAt: new Date(Date.now() + NONCE_TTL_MS),
    maxAttempts: 1,
  });
  return { nonceId, nonce };
}

async function takeChallenge(id: string, kind: string): Promise<AuthChallenge | null> {
  const db = getDatabase();
  const challenge = await getActiveChallenge(db, hashToken(id), 'google_native', null);
  if (challenge === null || challenge.data.kind !== kind) return null;
  // Single use: whoever consumes it first wins; a replay finds it gone.
  return (await consumeChallengeById(db, challenge.id)) ? challenge : null;
}

/** Consume the nonce and verify the ID token against it. Null when the nonce is unknown/used. */
export async function verifyNativeGoogleToken(
  idToken: string,
  nonceId: string,
): Promise<GoogleUserInfo | null> {
  const challenge = await takeChallenge(nonceId, 'nonce');
  if (challenge === null || typeof challenge.data.nonce !== 'string') return null;
  return verifyGoogleIdToken(idToken, {
    audience: googleAuthConfig().clientId,
    nonce: challenge.data.nonce,
  });
}

export async function holdPendingSignup(userInfo: GoogleUserInfo): Promise<string> {
  const pendingSignupId = generateSessionToken();
  await createChallenge(getDatabase(), {
    purpose: 'google_native',
    tokenHash: hashToken(pendingSignupId),
    data: {
      kind: 'pending_signup',
      sub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name ?? null,
      picture: userInfo.picture ?? null,
    },
    expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    maxAttempts: 1,
  });
  return pendingSignupId;
}

export async function takePendingSignup(pendingSignupId: string): Promise<GoogleUserInfo | null> {
  const challenge = await takeChallenge(pendingSignupId, 'pending_signup');
  if (challenge === null) return null;
  const { sub, email, name, picture } = challenge.data;
  if (typeof sub !== 'string' || typeof email !== 'string') return null;
  return {
    sub,
    email,
    email_verified: true,
    name: typeof name === 'string' ? name : undefined,
    picture: typeof picture === 'string' ? picture : undefined,
  };
}
