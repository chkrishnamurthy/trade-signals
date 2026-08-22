import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
  PathCircuitBreaker,
  parseRetryAfter,
} from '../circuit.js';

describe('parseRetryAfter', () => {
  it('reads the delay-seconds form', () => {
    // The exact value Cloudflare returned for a banned /data/quotes.
    expect(parseRetryAfter('1358')).toBe(1_358_000);
  });

  it('reads the HTTP-date form relative to now', () => {
    const now = Date.parse('2026-08-22T02:52:51Z');
    expect(parseRetryAfter('Sat, 22 Aug 2026 03:00:51 GMT', now)).toBe(480_000);
  });

  it('treats a past date as no guidance rather than a negative wait', () => {
    const now = Date.parse('2026-08-22T02:52:51Z');
    expect(parseRetryAfter('Sat, 22 Aug 2026 02:00:00 GMT', now)).toBeUndefined();
  });

  it('rejects a zero delay, which would defeat the breaker', () => {
    expect(parseRetryAfter('0')).toBeUndefined();
  });

  it('returns undefined for absent or unparseable values', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter('  ')).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
  });

  it('clamps an absurd delay', () => {
    expect(parseRetryAfter('999999999')).toBe(MAX_COOLDOWN_MS);
  });
});

describe('PathCircuitBreaker', () => {
  /** A breaker on a clock the test controls. */
  const breaker = () => {
    let now = 1_000_000;
    return {
      circuit: new PathCircuitBreaker({ now: () => now }),
      advance: (ms: number) => {
        now += ms;
      },
    };
  };

  it('reports no wait for an untouched path', () => {
    expect(breaker().circuit.retryAfterMs('/data/quotes')).toBe(0);
  });

  it('counts down and then reopens', () => {
    const { circuit, advance } = breaker();
    circuit.trip('/data/quotes', 60_000);

    expect(circuit.retryAfterMs('/data/quotes')).toBe(60_000);
    advance(20_000);
    expect(circuit.retryAfterMs('/data/quotes')).toBe(40_000);
    advance(40_000);
    expect(circuit.retryAfterMs('/data/quotes')).toBe(0);
  });

  it('bans only the path it was given', () => {
    const { circuit } = breaker();
    circuit.trip('/data/quotes', 60_000);

    // Observed live: /data/quotes banned while /data/history served 200s.
    expect(circuit.retryAfterMs('/data/history')).toBe(0);
    expect(circuit.retryAfterMs('/data/marketStatus')).toBe(0);
  });

  it('never shortens an existing ban', () => {
    const { circuit } = breaker();
    circuit.trip('/data/quotes', 600_000);
    // A second caller sees the same ban a moment later, with a smaller value.
    circuit.trip('/data/quotes', 590_000);
    expect(circuit.retryAfterMs('/data/quotes')).toBe(600_000);
  });

  it('extends a ban when the upstream asks for longer', () => {
    const { circuit } = breaker();
    circuit.trip('/data/quotes', 60_000);
    circuit.trip('/data/quotes', 600_000);
    expect(circuit.retryAfterMs('/data/quotes')).toBe(600_000);
  });

  it('clamps a ban to the ceiling', () => {
    const { circuit } = breaker();
    circuit.trip('/data/quotes', Number.MAX_SAFE_INTEGER);
    expect(circuit.retryAfterMs('/data/quotes')).toBe(MAX_COOLDOWN_MS);
  });

  it('clears on request', () => {
    const { circuit } = breaker();
    circuit.trip('/data/quotes', DEFAULT_COOLDOWN_MS);
    circuit.clear('/data/quotes');
    expect(circuit.retryAfterMs('/data/quotes')).toBe(0);
  });

  it('snapshots only paths still banned', () => {
    const { circuit, advance } = breaker();
    circuit.trip('/data/quotes', 60_000);
    circuit.trip('/data/history', 10_000);
    advance(20_000);

    expect(circuit.snapshot()).toEqual({ '/data/quotes': 40_000 });
  });
});
