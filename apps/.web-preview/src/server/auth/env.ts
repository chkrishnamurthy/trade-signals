import 'server-only';
import { IS_PROD } from './cookie-config';

/**
 * Auth secrets, read from the environment.
 *
 * In production these MUST be set (the app refuses to start an auth flow without
 * them). In development a fixed insecure fallback keeps local work friction-free —
 * it is never used when NODE_ENV is production.
 */

function secret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (IS_PROD) {
    throw new Error(`${name} is not set — required in production.`);
  }
  return devFallback;
}

/** HMAC key that signs the session cookie value. */
export function authSessionSecret(): string {
  return secret('AUTH_SESSION_SECRET', 'dev-only-insecure-session-secret-do-not-use-in-prod');
}

/** True when public self-service signup is open. Defaults to open. */
export function signupEnabled(): boolean {
  return process.env.AUTH_ALLOW_SIGNUP !== 'false';
}

export function googleAuthEnabled(): boolean {
  if (process.env.AUTH_GOOGLE_ENABLED === 'false') return false;
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function googleAuthConfig(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.');
  }
  return { clientId, clientSecret };
}

export function authBaseUrl(): string {
  const base = process.env.AUTH_BASE_URL?.trim();
  if (base) return base.replace(/\/$/, '');
  return IS_PROD ? 'https://equitywise.io' : 'http://localhost:3000';
}

export function trustedOrigins(): ReadonlySet<string> {
  const configured = process.env.AUTH_TRUSTED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const base = process.env.AUTH_BASE_URL?.trim();
  const defaults = IS_PROD
    ? ['https://equitywise.io']
    : ['http://localhost:3000', 'http://localhost'];
  return new Set(configured?.length ? configured : base ? [base] : defaults);
}

export function mfaEncryptionKey(): Buffer {
  const raw = process.env.AUTH_MFA_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('AUTH_MFA_ENCRYPTION_KEY is required for TOTP.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32)
    throw new Error('AUTH_MFA_ENCRYPTION_KEY must be 32 random bytes encoded as base64.');
  return key;
}
