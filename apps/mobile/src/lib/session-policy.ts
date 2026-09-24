/**
 * Pure session timing rules (unit-tested; no React Native imports).
 */

export const ROTATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Rotate once a week, and never bother for a session that has already expired. */
export function shouldRotate(
  session: { readonly rotatedAt: string; readonly expiresAt: string },
  now: Date,
): boolean {
  if (isExpired(session, now)) return false;
  const rotatedAt = Date.parse(session.rotatedAt);
  return !Number.isFinite(rotatedAt) || now.getTime() - rotatedAt >= ROTATE_AFTER_MS;
}

export function isExpired(session: { readonly expiresAt: string }, now: Date): boolean {
  const expiresAt = Date.parse(session.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}
