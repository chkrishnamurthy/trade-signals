import type { MfaChallenge } from './auth';

/**
 * Hand-off of a 2FA challenge from a sign-in screen to the code screen. Kept in
 * memory only — the binding is never put in a route URL or on disk.
 */
let pending: MfaChallenge | null = null;

export function setPendingMfa(challenge: MfaChallenge | null): void {
  pending = challenge;
}

export function takePendingMfa(): MfaChallenge | null {
  return pending;
}
