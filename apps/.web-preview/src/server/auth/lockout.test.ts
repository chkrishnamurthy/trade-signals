import { describe, expect, it } from 'vitest';
import {
  type AttemptState,
  DEFAULT_LOCKOUT,
  initialState,
  isLocked,
  lockRemainingMs,
  registerFailure,
} from './lockout';

const t0 = new Date('2026-09-06T10:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

describe('lockout state machine', () => {
  it('does not lock before the threshold', () => {
    let state = initialState(t0);
    for (let i = 0; i < DEFAULT_LOCKOUT.maxFailures - 1; i++) {
      state = registerFailure(state, t0);
    }
    expect(isLocked(state, t0)).toBe(false);
    expect(state.failures).toBe(DEFAULT_LOCKOUT.maxFailures - 1);
  });

  it('locks once failures reach the threshold', () => {
    let state = initialState(t0);
    for (let i = 0; i < DEFAULT_LOCKOUT.maxFailures; i++) {
      state = registerFailure(state, t0);
    }
    expect(isLocked(state, t0)).toBe(true);
    expect(lockRemainingMs(state, t0)).toBe(DEFAULT_LOCKOUT.baseLockoutMs);
  });

  it('backs off exponentially on further failures, capped', () => {
    let state = initialState(t0);
    for (let i = 0; i < DEFAULT_LOCKOUT.maxFailures + 1; i++) {
      state = registerFailure(state, t0);
    }
    // one past threshold ⇒ 2× the base lockout
    expect(lockRemainingMs(state, t0)).toBe(DEFAULT_LOCKOUT.baseLockoutMs * 2);

    let hammered: AttemptState = initialState(t0);
    for (let i = 0; i < 50; i++) hammered = registerFailure(hammered, t0);
    expect(lockRemainingMs(hammered, t0)).toBe(DEFAULT_LOCKOUT.maxLockoutMs);
  });

  it('resets the window after it elapses', () => {
    let state = initialState(t0);
    for (let i = 0; i < DEFAULT_LOCKOUT.maxFailures; i++) state = registerFailure(state, t0);
    // A failure long after the window starts a fresh count of 1.
    const later = at(DEFAULT_LOCKOUT.windowMs + 1000);
    state = registerFailure(state, later);
    expect(state.failures).toBe(1);
  });

  it('lock expires with time', () => {
    let state = initialState(t0);
    for (let i = 0; i < DEFAULT_LOCKOUT.maxFailures; i++) state = registerFailure(state, t0);
    expect(isLocked(state, at(DEFAULT_LOCKOUT.baseLockoutMs + 1))).toBe(false);
  });
});
