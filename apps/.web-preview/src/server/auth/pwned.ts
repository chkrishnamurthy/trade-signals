import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Breached-password check via the Pwned Passwords range API (k-anonymity): only
 * the first 5 chars of the password's SHA-1 leave the server, never the password.
 * Best-effort — if the service is unreachable we allow the password rather than
 * block a signup, because the offline length/blocklist checks already ran.
 */
export async function isPwned(password: string): Promise<boolean> {
  try {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    for (const line of body.split('\n')) {
      const hash = line.split(':')[0]?.trim().toUpperCase();
      if (hash === suffix) return true;
    }
    return false;
  } catch {
    return false;
  }
}
