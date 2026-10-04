/**
 * Password policy — pure, no I/O, so it is trivially unit-testable and can run
 * on the client too (for inline feedback) without pulling in the hasher.
 *
 * Deliberately light (2026-09-17): sign-up friction was costing users, so the
 * rule is just "8+ characters with at least one letter and one number". No
 * blocklist, no breach check. Everything is one place, so tightening it later
 * is a matter of editing this file.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Human-readable statement of the rule, for form hints. */
export const PASSWORD_RULE_HINT = `At least ${MIN_PASSWORD_LENGTH} characters, with at least one letter and one number.`;

// `\p{L}` / `\p{N}` so non-Latin letters and digits count too.
const HAS_LETTER = /\p{L}/u;
const HAS_NUMBER = /\p{N}/u;

export type PasswordCheck = { ok: true } | { ok: false; reason: string };

/** Cheap, offline check. Returns the first failing reason. */
export function validatePassword(plain: string): PasswordCheck {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: `Keep it under ${MAX_PASSWORD_LENGTH} characters.` };
  }
  if (!HAS_LETTER.test(plain)) {
    return { ok: false, reason: 'Include at least one letter.' };
  }
  if (!HAS_NUMBER.test(plain)) {
    return { ok: false, reason: 'Include at least one number.' };
  }
  return { ok: true };
}
