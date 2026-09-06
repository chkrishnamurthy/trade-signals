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
