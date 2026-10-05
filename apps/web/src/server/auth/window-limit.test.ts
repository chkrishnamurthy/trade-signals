import { describe, expect, it } from 'vitest';
import { type Bucket, hitWindow } from './window-limit';

const limit = { max: 3, windowMs: 60_000 };

describe('hitWindow', () => {
  it('allows up to max hits in a window, then refuses', () => {
    const store = new Map<string, Bucket>();
    expect(hitWindow(store, 'a', limit, 0).allowed).toBe(true);
    expect(hitWindow(store, 'a', limit, 1_000).allowed).toBe(true);
    expect(hitWindow(store, 'a', limit, 2_000).allowed).toBe(true);
    expect(hitWindow(store, 'a', limit, 3_000).allowed).toBe(false);
  });

  it('reports how long until the oldest hit leaves the window', () => {
    const store = new Map<string, Bucket>();
    for (const at of [0, 1_000, 2_000]) hitWindow(store, 'a', limit, at);
    const refused = hitWindow(store, 'a', limit, 10_000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSec).toBe(50);
  });

  it('lets the key back in once the window has slid past', () => {
    const store = new Map<string, Bucket>();
    for (const at of [0, 1_000, 2_000]) hitWindow(store, 'a', limit, at);
    expect(hitWindow(store, 'a', limit, 60_001).allowed).toBe(true);
  });

  it('does not count refused hits against the client', () => {
    const store = new Map<string, Bucket>();
    for (const at of [0, 1_000, 2_000]) hitWindow(store, 'a', limit, at);
    for (let i = 0; i < 50; i++) hitWindow(store, 'a', limit, 5_000 + i);
    expect(hitWindow(store, 'a', limit, 60_500).allowed).toBe(true);
  });

  it('keeps clients independent', () => {
    const store = new Map<string, Bucket>();
    for (const at of [0, 1, 2]) hitWindow(store, 'a', limit, at);
    expect(hitWindow(store, 'a', limit, 3).allowed).toBe(false);
    expect(hitWindow(store, 'b', limit, 3).allowed).toBe(true);
  });
});
