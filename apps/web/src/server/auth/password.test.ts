import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyPassword, verifyPasswordOrDecoy } from './password';
import { MIN_PASSWORD_LENGTH, validatePassword } from './password-policy';

describe('password hashing', () => {
  it('hashes to an argon2id string and verifies the right password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('the real password here');
    expect(await verifyPassword(hash, 'not the password')).toBe(false);
  });

  it('never throws on a malformed hash', async () => {
    expect(await verifyPassword('not-a-real-hash', 'x')).toBe(false);
  });

  it('produces a different hash each time (unique salt)', async () => {
    const a = await hashPassword('same input password');
    const b = await hashPassword('same input password');
    expect(a).not.toBe(b);
  });

  it('the decoy verify always returns false', async () => {
    expect(await verifyPasswordOrDecoy(undefined, 'anything at all')).toBe(false);
  });

  it('flags a weaker stored hash for rehash, keeps a current one', async () => {
    expect(needsRehash('$argon2id$v=19$m=4096,t=1,p=1$abc$def')).toBe(true);
    const current = await hashPassword('a current password value');
    expect(needsRehash(current)).toBe(false);
  });
});

describe('validatePassword', () => {
  it('rejects too-short passwords', () => {
    expect(validatePassword('short').ok).toBe(false);
  });

  it('rejects a common password', () => {
    expect(validatePassword('passw0rd').ok).toBe(false);
  });

  it('accepts a strong passphrase', () => {
    const result = validatePassword('a perfectly reasonable passphrase');
    expect(result.ok).toBe(true);
  });

  it('enforces the documented minimum length', () => {
    expect(validatePassword('x'.repeat(MIN_PASSWORD_LENGTH - 1)).ok).toBe(false);
    expect(validatePassword('x'.repeat(MIN_PASSWORD_LENGTH)).ok).toBe(true);
  });
});
