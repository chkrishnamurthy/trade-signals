import { describe, expect, it } from 'vitest';
import { isExpired, ROTATE_AFTER_MS, shouldRotate } from './session-policy';

const now = new Date('2026-09-24T06:00:00.000Z');
const later = (ms: number) => new Date(now.getTime() + ms).toISOString();
const earlier = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('session policy', () => {
  it('rotates a live session once it is a week old', () => {
    expect(shouldRotate({ rotatedAt: earlier(ROTATE_AFTER_MS), expiresAt: later(1e9) }, now)).toBe(
      true,
    );
    expect(shouldRotate({ rotatedAt: earlier(1000), expiresAt: later(1e9) }, now)).toBe(false);
  });

  it('never rotates an expired session', () => {
    expect(
      shouldRotate({ rotatedAt: earlier(ROTATE_AFTER_MS * 2), expiresAt: earlier(1) }, now),
    ).toBe(false);
    expect(isExpired({ expiresAt: now.toISOString() }, now)).toBe(true);
  });

  it('treats an unreadable timestamp as due / expired', () => {
    expect(shouldRotate({ rotatedAt: 'garbage', expiresAt: later(1e9) }, now)).toBe(true);
    expect(isExpired({ expiresAt: 'garbage' }, now)).toBe(true);
  });
});
