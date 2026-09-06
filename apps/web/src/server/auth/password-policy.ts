/**
 * Password strength policy — pure, no I/O, so it is trivially unit-testable and
 * can run on the client too (for inline feedback) without pulling in the hasher.
 *
 * Follows NIST SP 800-63B-4 / OWASP ASVS 5.0: length-first, no composition rules,
 * screen against common/breached passwords. The network breach check (Pwned
 * Passwords range API) lives separately in `pwned.ts`; this file holds the cheap,
 * offline checks plus a small starter blocklist.
 *
 * NOTE ON LENGTH: NIST recommends a 15-char minimum when a password is the only
 * factor (8 is the hard floor). We use 12 as a strong, user-friendly default —
 * raise `MIN_PASSWORD_LENGTH` to 15 for the strict posture. It is one constant.
 */

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/** A tiny starter blocklist. The real defence is the breach check in pwned.ts. */
const COMMON = new Set([
  'password',
  'passw0rd',
  '123456789012',
  'qwertyuiop',
  'letmein12345',
  'iloveyou1234',
  'administrator',
  'welcome12345',
  'changeme1234',
]);

export type PasswordCheck = { ok: true } | { ok: false; reason: string };

/** Cheap, offline strength check. Returns the first failing reason. */
export function validatePassword(plain: string): PasswordCheck {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: `Keep it under ${MAX_PASSWORD_LENGTH} characters.` };
  }
  if (COMMON.has(plain.toLowerCase())) {
    return { ok: false, reason: 'That password is too common — choose something less guessable.' };
  }
  return { ok: true };
}
