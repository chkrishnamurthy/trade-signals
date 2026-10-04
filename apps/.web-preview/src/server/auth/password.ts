import 'server-only';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id password hashing.
 *
 * OWASP 2025 baseline: Argon2id, m = 19 MiB, t = 2, p = 1. The encoded hash
 * records its own parameters, so raising these later is transparent to existing
 * hashes (verify still works; `needsRehash` flags the stale ones on next login).
 *
 * Impure (randomness + native binding), so this is server-side, never in
 * `packages/core`.
 */
// `@node-rs/argon2` defaults to the Argon2id variant, so we set only the cost
// parameters (avoiding the const-enum import that verbatimModuleSyntax forbids).
const PARAMS = {
  memoryCost: 19_456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hash a plaintext password to an Argon2id encoded string (embeds salt + params). */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, PARAMS);
}

/** Constant-time verify. Returns false (never throws) on a wrong or malformed hash. */
export async function verifyPassword(encoded: string, plain: string): Promise<boolean> {
  try {
    return await verify(encoded, plain);
  } catch {
    return false;
  }
}

/**
 * Verify against a real hash, or burn the same work against a decoy when the
 * account doesn't exist — so response timing can't reveal whether an email is
 * registered (account-enumeration defence). Always returns false for the decoy.
 */
let decoy: Promise<string> | undefined;
export async function verifyPasswordOrDecoy(
  encoded: string | undefined,
  plain: string,
): Promise<boolean> {
  if (encoded !== undefined) return verifyPassword(encoded, plain);
  decoy ??= hashPassword('a-decoy-password-that-is-never-a-real-credential');
  await verifyPassword(await decoy, plain);
  return false;
}

/** True when a stored hash was made with weaker params than the current target. */
export function needsRehash(encoded: string): boolean {
  const m = /\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(encoded);
  if (m === null) return true; // unknown format ⇒ rehash on next successful login
  const [, mem, time, par] = m;
  return (
    Number(mem) < PARAMS.memoryCost ||
    Number(time) < PARAMS.timeCost ||
    Number(par) < PARAMS.parallelism
  );
}
