import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createGoogleUser,
  findUserByEmail,
  linkGoogleIdentity,
  mfaEnabled,
  resolveGoogleIdentity,
  writeAudit,
} from '@equitywise/db';
import { cookies } from 'next/headers';
import { getDatabase } from '@/server/db';
import { beginMfaChallenge } from './challenges';
import { nativeClientLabel } from './client';
import { IS_PROD, OAUTH_STATE_COOKIE_NAME } from './cookie-config';
import {
  authBaseUrl,
  authSessionSecret,
  googleAuthConfig,
  googleAuthEnabled,
  signupEnabled,
} from './env';
import { safeRedirectPath } from './redirects';
import { clientIp } from './request';
import { type IssuedSession, startSession } from './session';
import { TERMS_VERSION } from './terms';

const OAUTH_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes

interface OAuthStatePayload {
  state: string;
  codeVerifier: string;
  next: string;
}

export function getGoogleRedirectUri(): string {
  return `${authBaseUrl()}/api/auth/google/callback`;
}

function signPayload(payload: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

function verifyPayload(cookieValue: string, secret: string): string | null {
  const dot = cookieValue.lastIndexOf('.');
  if (dot <= 0 || dot === cookieValue.length - 1) return null;
  const payload = cookieValue.slice(0, dot);
  const mac = cookieValue.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return payload;
}

/**
 * Initiates the Google OAuth flow:
 * Generates CSRF state, PKCE code verifier and challenge,
 * sets the signed HttpOnly cookie, and returns the authorization URL.
 */
export async function createGoogleAuthSession(nextUrl?: string | null): Promise<string> {
  if (!googleAuthEnabled()) {
    throw new Error('Google OAuth is not configured or enabled.');
  }

  const { clientId } = googleAuthConfig();
  const state = randomBytes(24).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const next = safeRedirectPath(nextUrl);

  const payload: OAuthStatePayload = { state, codeVerifier, next };
  const serialized = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signedCookieValue = signPayload(serialized, authSessionSecret());

  const cookieJar = await cookies();
  cookieJar.set(OAUTH_STATE_COOKIE_NAME, signedCookieValue, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', getRedirectUri());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'select_account');

  return authUrl.toString();
}

export function getRedirectUri(): string {
  return `${authBaseUrl()}/api/auth/google/callback`;
}

interface GoogleTokenResponse {
  access_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string | undefined;
  picture?: string | undefined;
}

export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = googleAuthConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch Google user info (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data.sub !== 'string' || typeof data.email !== 'string') {
    throw new Error('Invalid user info structure received from Google.');
  }

  return {
    sub: data.sub,
    email: data.email.toLowerCase().trim(),
    email_verified: Boolean(data.email_verified),
    name: typeof data.name === 'string' ? data.name.trim() : undefined,
    picture: typeof data.picture === 'string' ? data.picture.trim() : undefined,
  };
}

export type GoogleCallbackResult =
  | { status: 'success'; redirectTo: string }
  | { status: 'error'; code: string; message: string };

/**
 * Handles the Google OAuth callback:
 * Verifies CSRF state, exchanges authorization code, retrieves userinfo,
 * associates with a local PostgreSQL user, mints an EquityWise session, and returns redirect path.
 */
export async function handleGoogleCallback(
  request: Request,
  code: string,
  returnedState: string,
): Promise<GoogleCallbackResult> {
  const cookieJar = await cookies();
  const rawCookie = cookieJar.get(OAUTH_STATE_COOKIE_NAME)?.value;
  cookieJar.set(OAUTH_STATE_COOKIE_NAME, '', { maxAge: 0, path: '/' });

  if (!rawCookie) {
    return {
      status: 'error',
      code: 'INVALID_STATE',
      message: 'OAuth state cookie was missing or expired.',
    };
  }

  const payloadStr = verifyPayload(rawCookie, authSessionSecret());
  if (!payloadStr) {
    return {
      status: 'error',
      code: 'TAMPERED_STATE',
      message: 'OAuth state could not be verified.',
    };
  }

  let statePayload: OAuthStatePayload;
  try {
    statePayload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
  } catch {
    return { status: 'error', code: 'MALFORMED_STATE', message: 'Malformed OAuth state payload.' };
  }

  if (statePayload.state !== returnedState) {
    return { status: 'error', code: 'STATE_MISMATCH', message: 'OAuth state did not match.' };
  }

  // Exchange code with PKCE
  let tokens: GoogleTokenResponse;
  try {
    tokens = await exchangeGoogleCode(code, statePayload.codeVerifier);
  } catch (error) {
    return {
      status: 'error',
      code: 'TOKEN_EXCHANGE_FAILED',
      message: error instanceof Error ? error.message : 'Google token exchange failed.',
    };
  }

  // Fetch Google user profile
  let userInfo: GoogleUserInfo;
  try {
    userInfo = await fetchGoogleUserInfo(tokens.access_token);
  } catch (error) {
    return {
      status: 'error',
      code: 'USERINFO_FAILED',
      message: error instanceof Error ? error.message : 'Failed to retrieve Google user profile.',
    };
  }

  const outcome = await signInWithGoogleIdentity(request, userInfo, {
    enforceMfa: false, // web Google + 2FA is deferred (docs/mobile/01-discovery.md S16, G15)
    termsAccepted: null,
    deviceName: null,
  });
  if (outcome.status === 'error') return outcome;
  return { status: 'success', redirectTo: statePayload.next };
}

export type GoogleIdentityOutcome =
  | { status: 'signed_in'; issued: IssuedSession }
  | { status: 'linked'; identityId: number }
  | { status: 'mfa_required'; challengeId: string; binding: string | null }
  | { status: 'terms_required' }
  | { status: 'error'; code: string; message: string };

/**
 * Resolve a verified Google principal to an EquityWise account and act on it —
 * the one place both the web callback and the mobile app's native sign-in
 * (`/api/auth/google/native`) decide what a Google login means:
 *
 *   0. already signed in → link this Google identity to the current account;
 *   1. known identity    → sign in;
 *   2. known email       → link, then sign in;
 *   3. new person        → create the account (if sign-up is open), then sign in.
 *
 * `enforceMfa` routes 2FA-enrolled accounts to the 2FA challenge instead of
 * starting a session. `termsAccepted` (native only) gates step 3: null means "the
 * caller does not collect terms here" (web), false returns `terms_required` so the
 * app can show its terms popup and retry.
 */
export async function signInWithGoogleIdentity(
  request: Request,
  userInfo: GoogleUserInfo,
  options: {
    enforceMfa: boolean;
    termsAccepted: boolean | null;
    deviceName: string | null;
  },
): Promise<GoogleIdentityOutcome> {
  if (!userInfo.email_verified) {
    return { status: 'error', code: 'UNVERIFIED_EMAIL', message: 'Google email is not verified.' };
  }

  const db = getDatabase();
  const ip = clientIp(request);
  const client = nativeClientLabel(request.headers) ?? 'web';

  const begin = async (
    user: {
      id: number;
      securityVersion: number;
    },
    identityId: number,
  ): Promise<GoogleIdentityOutcome> => {
    if (options.enforceMfa && (await mfaEnabled(db, user.id))) {
      const challenge = await beginMfaChallenge({
        userId: user.id,
        securityVersion: user.securityVersion,
        authenticationMethod: 'google',
        authIdentityId: identityId,
      });
      return { status: 'mfa_required', ...challenge };
    }
    const issued = await startSession(user.id, request, {
      securityVersion: user.securityVersion,
      authenticationMethod: 'google',
      authIdentityId: identityId,
      deviceName: options.deviceName,
    });
    return { status: 'signed_in', issued };
  };

  // 0. If user is already authenticated in this session (e.g. connecting from Profile)
  const { getSessionUser } = await import('./require-user');
  const currentUser = await getSessionUser();

  // 1. Check if identity already exists
  const existingIdentity = await resolveGoogleIdentity(db, {
    subject: userInfo.sub,
    email: userInfo.email,
    emailVerified: true,
    displayName: userInfo.name ?? null,
    avatarUrl: userInfo.picture ?? null,
  });

  if (currentUser) {
    if (currentUser.status === 'disabled') {
      return {
        status: 'error',
        code: 'ACCOUNT_DISABLED',
        message: 'This account has been disabled.',
      };
    }
    if (existingIdentity && existingIdentity.user.id !== currentUser.id) {
      return {
        status: 'error',
        code: 'ALREADY_LINKED',
        message: 'This Google account is already connected to another user.',
      };
    }
    const identityId = existingIdentity
      ? existingIdentity.identityId
      : await linkGoogleIdentity(db, currentUser.id, {
          subject: userInfo.sub,
          email: userInfo.email,
          emailVerified: true,
          displayName: userInfo.name ?? null,
          avatarUrl: userInfo.picture ?? null,
        });

    await writeAudit(db, {
      userId: currentUser.id,
      event: 'identity_linked',
      ipAddress: ip,
      detail: { method: 'google', identityId, client },
    });

    return { status: 'linked', identityId };
  }

  if (existingIdentity) {
    if (existingIdentity.user.status === 'disabled') {
      return {
        status: 'error',
        code: 'ACCOUNT_DISABLED',
        message: 'This account has been disabled.',
      };
    }

    const outcome = await begin(existingIdentity.user, existingIdentity.identityId);

    await writeAudit(db, {
      userId: existingIdentity.user.id,
      event: outcome.status === 'signed_in' ? 'login' : 'login_mfa_challenge',
      ipAddress: ip,
      detail: { method: 'google', identityId: existingIdentity.identityId, client },
    });

    return outcome;
  }

  // 2. Identity does not exist: Check if an account with this email already exists
  const existingUser = await findUserByEmail(db, userInfo.email);

  if (existingUser) {
    if (existingUser.user.status === 'disabled') {
      return {
        status: 'error',
        code: 'ACCOUNT_DISABLED',
        message: 'This account has been disabled.',
      };
    }

    const identityId = await linkGoogleIdentity(db, existingUser.user.id, {
      subject: userInfo.sub,
      email: userInfo.email,
      emailVerified: true,
      displayName: userInfo.name ?? null,
      avatarUrl: userInfo.picture ?? null,
    });

    const outcome = await begin(existingUser.user, identityId);

    await writeAudit(db, {
      userId: existingUser.user.id,
      event: 'identity_linked',
      ipAddress: ip,
      detail: { method: 'google', identityId, client },
    });

    return outcome;
  }

  // 3. Brand new user: Check if sign-ups are allowed
  if (!signupEnabled()) {
    return {
      status: 'error',
      code: 'SIGNUP_CLOSED',
      message: 'Self-service registration is currently closed.',
    };
  }

  // The app collects terms acceptance in its own popup before an account exists.
  if (options.termsAccepted === false) return { status: 'terms_required' };

  const newUser = await createGoogleUser(db, {
    principal: {
      subject: userInfo.sub,
      email: userInfo.email,
      emailVerified: true,
      displayName: userInfo.name ?? null,
      avatarUrl: userInfo.picture ?? null,
    },
    displayName: userInfo.name || userInfo.email.split('@')[0] || 'User',
    termsVersion: TERMS_VERSION,
  });

  // A brand-new account cannot have 2FA yet, so this always signs in.
  const outcome = await begin(newUser.user, newUser.identityId);

  await writeAudit(db, {
    userId: newUser.user.id,
    event: 'register',
    ipAddress: ip,
    detail: { method: 'google', identityId: newUser.identityId, client },
  });

  return outcome;
}
