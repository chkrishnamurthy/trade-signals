import { describe, expect, it } from 'vitest';
import { hashRecoveryCode, verifyTotp } from './totp';

describe('TOTP', () => {
  it('accepts an RFC 6238 SHA-1 fixture truncated to six digits', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(verifyTotp(secret, '287082', 59_000)).toBe(1);
  });

  it('rejects malformed codes', () => {
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '12345', 59_000)).toBeNull();
  });

  it('normalizes recovery-code punctuation and case', () => {
    expect(hashRecoveryCode('abcde-12345')).toBe(hashRecoveryCode('ABCDE12345'));
  });
});
