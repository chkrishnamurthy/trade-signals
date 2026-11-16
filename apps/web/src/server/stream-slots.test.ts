import { describe, expect, it } from 'vitest';
import { createSlotPool } from './stream-slots';

describe('createSlotPool', () => {
  it('hands out up to the maximum per key, then refuses', () => {
    const pool = createSlotPool(2);
    expect(pool.acquire('user:1')).not.toBeNull();
    expect(pool.acquire('user:1')).not.toBeNull();
    expect(pool.acquire('user:1')).toBeNull();
    expect(pool.held('user:1')).toBe(2);
  });

  it('counts each key on its own', () => {
    const pool = createSlotPool(1);
    expect(pool.acquire('user:1')).not.toBeNull();
    expect(pool.acquire('user:2')).not.toBeNull();
    expect(pool.acquire('user:1')).toBeNull();
  });

  it('frees a slot on release, so the next stream can open', () => {
    const pool = createSlotPool(1);
    const release = pool.acquire('user:1');
    expect(pool.acquire('user:1')).toBeNull();
    release?.();
    expect(pool.held('user:1')).toBe(0);
    expect(pool.acquire('user:1')).not.toBeNull();
  });

  it('ignores a second release, so two teardown paths cannot free two slots', () => {
    const pool = createSlotPool(2);
    const first = pool.acquire('user:1');
    pool.acquire('user:1');
    first?.();
    first?.();
    expect(pool.held('user:1')).toBe(1);
    // Only one slot came back: a third stream fits, a fourth does not.
    expect(pool.acquire('user:1')).not.toBeNull();
    expect(pool.acquire('user:1')).toBeNull();
  });
});
