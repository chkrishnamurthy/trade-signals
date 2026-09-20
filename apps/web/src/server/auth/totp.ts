import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { mfaEncryptionKey } from './env';
import { hashToken } from './session-token';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', mfaEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptTotpSecret(value: string): string {
  const [version, ivRaw, tagRaw, cipherRaw] = value.split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !cipherRaw)
    throw new Error('Invalid encrypted TOTP secret.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    mfaEncryptionKey(),
    Buffer.from(ivRaw, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherRaw, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function verifyTotp(secret: string, code: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/u.test(code)) return null;
  const current = Math.floor(nowMs / 1000 / STEP_SECONDS);
  for (const step of [current - 1, current, current + 1]) {
    if (totpAt(secret, step) === code) return step;
  }
  return null;
}

export function generateRecoveryCodes(): readonly string[] {
  return Array.from(
    { length: 8 },
    () =>
      randomBytes(5)
        .toString('hex')
        .toUpperCase()
        .match(/.{1,5}/gu)
        ?.join('-') ?? '',
  );
}

export function hashRecoveryCode(code: string): string {
  return hashToken(code.replace(/[^A-Z0-9]/giu, '').toUpperCase());
}

function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of input.replace(/=+$/u, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}
